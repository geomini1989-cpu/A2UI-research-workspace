import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { ResearchDimension } from '../interaction/types.js'
import { InteractionValidationError, validateCompany, validateDimensions } from '../interaction/validation.js'

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
}

export interface ResearchJobInput {
  id?: unknown
  company?: unknown
  dimensions?: unknown
  depth?: unknown
  instructions?: unknown
}

const STORE_PATH = join(process.cwd(), '.data', 'research-jobs.json')
const DEPTHS = ['quick', 'deep', 'comprehensive'] as const

export function createResearchJobId(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return 'RJ-' + date + '-' + randomUUID().slice(0, 8).toUpperCase()
}

async function readJobs(): Promise<ResearchJob[]> {
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    return JSON.parse(raw) as ResearchJob[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function writeJobs(jobs: ResearchJob[]): Promise<void> {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(jobs, null, 2) + '\n', 'utf8')
}

function validateId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !/^RJ-[A-Z0-9-]+$/i.test(value)) {
    throw new InteractionValidationError('Invalid research job id')
  }
  return value
}

function validateDepth(value: unknown): ResearchDepth {
  if (value === undefined || value === null || value === '') return 'deep'
  if (typeof value !== 'string' || !(DEPTHS as readonly string[]).includes(value)) {
    throw new InteractionValidationError('Invalid research depth')
  }
  return value as ResearchDepth
}

function validateInstructions(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new InteractionValidationError('Instructions must be a string')
  return value.trim().slice(0, 1200)
}

function normalizeInput(input: ResearchJobInput) {
  return {
    id: validateId(input.id),
    company: validateCompany(input.company, 'Company'),
    dimensions: validateDimensions(input.dimensions),
    depth: validateDepth(input.depth),
    instructions: validateInstructions(input.instructions),
  }
}

export async function getResearchJob(id: string): Promise<ResearchJob | undefined> {
  const jobs = await readJobs()
  return jobs.find((job) => job.id.toLowerCase() === id.toLowerCase())
}

export async function saveResearchJobDraft(input: ResearchJobInput): Promise<ResearchJob> {
  const value = normalizeInput(input)
  const jobs = await readJobs()
  const now = new Date().toISOString()
  const id = value.id ?? createResearchJobId()
  const index = jobs.findIndex((job) => job.id.toLowerCase() === id.toLowerCase())

  if (index >= 0) {
    if (jobs[index].status !== 'DRAFT') {
      throw new InteractionValidationError('Only draft research jobs can be edited')
    }
    jobs[index] = { ...jobs[index], ...value, id: jobs[index].id, updatedAt: now }
    await writeJobs(jobs)
    return jobs[index]
  }

  const job: ResearchJob = {
    id,
    company: value.company,
    dimensions: value.dimensions,
    depth: value.depth,
    instructions: value.instructions,
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
  }
  jobs.push(job)
  await writeJobs(jobs)
  return job
}

export async function submitResearchJob(input: ResearchJobInput): Promise<ResearchJob> {
  const requestedId = validateId(input.id)
  if (requestedId) {
    const existing = await getResearchJob(requestedId)
    if (existing && existing.status !== 'DRAFT') {
      if (existing.status === 'SUBMITTED' || existing.status === 'RUNNING' || existing.status === 'COMPLETED') return existing
      throw new InteractionValidationError('This research job cannot be submitted')
    }
  }

  const draft = await saveResearchJobDraft(input)
  const jobs = await readJobs()
  const index = jobs.findIndex((job) => job.id === draft.id)
  const now = new Date().toISOString()
  jobs[index] = { ...jobs[index], status: 'SUBMITTED', submittedAt: now, updatedAt: now }
  await writeJobs(jobs)
  return jobs[index]
}

export async function setResearchJobStatus(id: string, status: ResearchJobStatus): Promise<ResearchJob> {
  const jobs = await readJobs()
  const index = jobs.findIndex((job) => job.id.toLowerCase() === id.toLowerCase())
  if (index < 0) throw new InteractionValidationError('Research job not found')
  jobs[index] = { ...jobs[index], status, updatedAt: new Date().toISOString() }
  await writeJobs(jobs)
  return jobs[index]
}

export function buildResearchRequest(job: ResearchJob): string {
  const depthLabel: Record<ResearchDepth, string> = {
    quick: '快速',
    deep: '深度',
    comprehensive: '全面',
  }
  const dimensionLabel: Record<ResearchDimension, string> = {
    financial: '财务',
    market: '市场与新闻',
    technology: '技术与产品',
  }
  const parts = [
    depthLabel[job.depth] + '研究 ' + job.company,
    '研究维度：' + job.dimensions.map((item) => dimensionLabel[item]).join('、'),
  ]
  if (job.instructions) parts.push('附加要求：' + job.instructions)
  parts.push('这是已提交的研究任务，请直接执行，不要再次要求确认研究范围。')
  return parts.join('\n')
}
