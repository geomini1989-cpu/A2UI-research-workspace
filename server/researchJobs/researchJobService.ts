import { randomUUID } from 'node:crypto'
import type { AgentEvent } from '../agent/researchAgent.js'
import type { ResearchDimension } from '../interaction/types.js'
import { InteractionValidationError, validateCompany, validateDimensions } from '../interaction/validation.js'
import { db } from '../storage/database.js'
import { ownerId } from '../runtime/context.js'

export type ResearchDepth = 'quick' | 'deep' | 'comprehensive'
export type ResearchJobStatus = 'DRAFT' | 'SUBMITTED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export interface ResearchJob {
  id: string
  company: string
  dimensions: ResearchDimension[]
  depth: ResearchDepth
  instructions: string
  status: ResearchJobStatus
  createdAt: string
  updatedAt: string
  submittedAt?: string
  error?: string
}
export interface ResearchJobInput { id?: unknown; company?: unknown; dimensions?: unknown; depth?: unknown; instructions?: unknown }
export function createResearchJobId() { return 'RJ-' + new Date().toISOString().slice(0, 10).replaceAll('-', '') + '-' + randomUUID().slice(0, 8).toUpperCase() }
export function getResearchJob(id: string): ResearchJob | undefined {
  const row = db.prepare('SELECT body FROM jobs WHERE id = ? AND owner_id = ?').get(id, ownerId())
  return row ? JSON.parse(row.body as string) as ResearchJob : undefined
}
export function listResearchJobs(): ResearchJob[] {
  return db.prepare('SELECT body FROM jobs WHERE owner_id = ? ORDER BY json_extract(body, \'$.updatedAt\') DESC').all(ownerId())
    .map(row => JSON.parse(row.body as string) as ResearchJob)
}
export function saveResearchJobDraft(input: ResearchJobInput): ResearchJob {
  const id = input.id === undefined ? createResearchJobId() : String(input.id)
  if (!/^RJ-[A-Z0-9-]+$/i.test(id)) throw new InteractionValidationError('Invalid research job id')
  const depth = input.depth ?? 'deep'
  if (!['quick', 'deep', 'comprehensive'].includes(String(depth))) throw new InteractionValidationError('Invalid research depth')
  if (input.instructions !== undefined && typeof input.instructions !== 'string') throw new InteractionValidationError('Instructions must be a string')
  const now = new Date().toISOString()
  const existing = getResearchJob(id)
  const job: ResearchJob = {
    id: existing?.id ?? id, company: validateCompany(input.company, 'Company'), dimensions: validateDimensions(input.dimensions),
    depth: depth as ResearchDepth, instructions: (input.instructions as string | undefined ?? '').trim().slice(0, 1200),
    status: 'DRAFT', createdAt: existing?.createdAt ?? now, updatedAt: now,
  }
  const updated = db.prepare("INSERT INTO jobs(id, owner_id, status, body) VALUES (?, ?, 'DRAFT', ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE jobs.owner_id=excluded.owner_id AND jobs.status='DRAFT' RETURNING id")
    .get(job.id, ownerId(), JSON.stringify(job))
  if (!updated) throw new InteractionValidationError('Only your draft research jobs can be edited')
  return job
}
export function submitResearchJob(input: ResearchJobInput): ResearchJob {
  const existing = typeof input.id === 'string' ? getResearchJob(input.id) : undefined
  if (existing && ['SUBMITTED', 'RUNNING', 'COMPLETED'].includes(existing.status)) return existing
  const draft = saveResearchJobDraft(input)
  const now = new Date().toISOString()
  const row = db.prepare("UPDATE jobs SET status='SUBMITTED', body=json_set(body, '$.status', 'SUBMITTED', '$.submittedAt', ?, '$.updatedAt', ?) WHERE id=? AND owner_id=? AND status='DRAFT' RETURNING body")
    .get(now, now, draft.id, ownerId())!
  return JSON.parse(row.body as string) as ResearchJob
}

// 条件更新即领取任务；重复启动不会再次执行。 / The conditional update claims a job exactly once.
export function claimResearchJob(id: string): ResearchJob | undefined {
  const row = db.prepare("UPDATE jobs SET status='RUNNING', result=NULL, body=json_remove(json_set(body, '$.status', 'RUNNING', '$.updatedAt', ?), '$.error') WHERE id=? AND owner_id=? AND status IN ('SUBMITTED','FAILED','CANCELLED') RETURNING body")
    .get(new Date().toISOString(), id, ownerId())
  return row ? JSON.parse(row.body as string) as ResearchJob : undefined
}
export function finishResearchJob(id: string, status: 'COMPLETED' | 'FAILED' | 'CANCELLED', events: AgentEvent[], error?: string) {
  db.prepare("UPDATE jobs SET status=?, result=?, body=json_set(body, '$.status', ?, '$.updatedAt', ?, '$.error', ?) WHERE id=? AND owner_id=? AND status='RUNNING'")
    .run(status, JSON.stringify(events), status, new Date().toISOString(), error ?? null, id, ownerId())
}
export function getResearchJobResult(id: string): AgentEvent[] {
  const row = db.prepare('SELECT result FROM jobs WHERE id=? AND owner_id=?').get(id, ownerId())
  return row?.result ? JSON.parse(row.result as string) as AgentEvent[] : []
}
export function buildResearchRequest(job: ResearchJob): string {
  const depthLabel = { quick: '快速', deep: '深度', comprehensive: '全面' }
  const dimensionLabel = { financial: '财务', market: '市场与新闻', technology: '技术与产品' }
  return [
    depthLabel[job.depth] + '研究 ' + job.company,
    '研究维度：' + job.dimensions.map(item => dimensionLabel[item]).join('、'),
    job.instructions ? '附加要求：' + job.instructions : '',
    '这是已提交的研究任务，请直接执行，不要再次要求确认研究范围。',
  ].filter(Boolean).join('\n')
}
