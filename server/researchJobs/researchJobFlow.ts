import { companiesInRequest } from '../agent/specialistUtils.js'
import { runAutonomousResearch, type AgentActionPayload, type Emit } from '../agent/researchAgent.js'
import type { ResearchDimension } from '../interaction/types.js'
import { InteractionValidationError } from '../interaction/validation.js'
import {
  buildResearchRequest,
  createResearchJobId,
  getResearchJob,
  saveResearchJobDraft,
  claimResearchJob,
  finishResearchJob,
  getResearchJobResult,
  submitResearchJob,
  type ResearchDepth,
  type ResearchJob,
  type ResearchJobInput,
} from './researchJobService.js'
import { researchJobFormSurface, researchJobStatusSurface, researchJobSubmittedSurface } from './researchJobUi.js'
import { runContext } from '../runtime/context.js'
import type { AgentEvent } from '../agent/researchAgent.js'

const RESEARCH_JOB_ACTIONS = new Set([
  'save_research_job_draft',
  'submit_research_job',
  'start_research_job',
])

function emitMessages(emit: Emit, messages: ReturnType<typeof researchJobFormSurface>) {
  for (const message of messages) emit({ type: 'message', message })
}

function jobIdInText(text: string): string | undefined {
  return text.match(/\bRJ-[A-Z0-9-]+\b/i)?.[0]
}

function dimensionsInText(text: string): ResearchDimension[] {
  const dimensions: ResearchDimension[] = []
  if (/财务|估值|financial|valuation/i.test(text)) dimensions.push('financial')
  if (/市场|新闻|竞争|market|news|competitive/i.test(text)) dimensions.push('market')
  if (/技术|产品|technology|technical|product/i.test(text)) dimensions.push('technology')
  return dimensions.length ? dimensions : ['financial', 'market', 'technology']
}

function depthInText(text: string): ResearchDepth {
  if (/快速|quick/i.test(text)) return 'quick'
  if (/全面|comprehensive/i.test(text)) return 'comprehensive'
  return 'deep'
}

function companyInText(text: string): string {
  const known = companiesInRequest(text)[0]
  if (known) return known
  const match = text.match(/(?:创建|新建)(?:一个|一份)?\s*([A-Za-z0-9 .&-]{2,80}?)\s*(?:的)?(?:快速|深度|全面)?研究任务/i)
  return match?.[1]?.trim() ?? ''
}

function draftFromRequest(text: string): ResearchJob {
  const now = new Date().toISOString()
  return {
    id: createResearchJobId(),
    company: companyInText(text),
    dimensions: dimensionsInText(text),
    depth: depthInText(text),
    instructions: '',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
  }
}

function inputFromAction(action: AgentActionPayload): ResearchJobInput {
  return {
    id: action.context?.jobId,
    company: action.context?.company,
    dimensions: action.context?.dimensions,
    depth: action.context?.depth,
    instructions: action.context?.instructions,
  }
}

export function isResearchJobAction(name: string): boolean {
  return RESEARCH_JOB_ACTIONS.has(name)
}

export function isResearchJobRequest(message: string): boolean {
  const hasJobId = Boolean(jobIdInText(message))
  return /(?:创建|新建).{0,20}研究任务|研究任务.{0,20}(?:创建|新建)|research\s+(?:job|task)/i.test(message)
    || (hasJobId && /研究任务|research\s+(?:job|task)/i.test(message))
}

export async function runResearchJobRequest(message: string, emit: Emit): Promise<void> {
  emit({ type: 'status', status: '正在准备研究任务…' })
  const requestedId = jobIdInText(message)

  if (requestedId) {
    const job = await getResearchJob(requestedId)
    if (!job) {
      emit({ type: 'error', error: '未找到研究任务 ' + requestedId })
      return
    }
    const surfaceId = 'research-job-' + job.id
    if (job.status === 'DRAFT') {
      emitMessages(emit, researchJobFormSurface(job, surfaceId, true))
      emit({ type: 'agent_text', text: '已恢复研究任务草稿。' })
      emit({ type: 'task_state', state: 'WAITING_FOR_USER', taskId: job.id })
      return
    }
    if (job.status === 'SUBMITTED') {
      emitMessages(emit, researchJobSubmittedSurface(job, surfaceId))
      emit({ type: 'agent_text', text: '研究任务已提交，可以开始执行。' })
      emit({ type: 'task_state', state: 'COMPLETED', taskId: job.id })
      emit({ type: 'done' })
      return
    }
    if (job.status === 'COMPLETED') {
      for (const event of getResearchJobResult(job.id)) emit(event)
      return
    }
    emitMessages(emit, researchJobStatusSurface(job, surfaceId))
    emit({ type: 'agent_text', text: '已读取研究任务状态。' })
    emit({ type: 'task_state', state: job.status === 'FAILED' ? 'FAILED' : 'COMPLETED', taskId: job.id })
    emit({ type: 'done' })
    return
  }

  const draft = draftFromRequest(message)
  emitMessages(emit, researchJobFormSurface(draft, 'research-job-' + draft.id))
  emit({ type: 'agent_text', text: '已准备研究任务草稿，请检查后保存或提交。' })
  emit({ type: 'task_state', state: 'WAITING_FOR_USER', taskId: draft.id })
}

export async function runResearchJobAction(action: AgentActionPayload, emit: Emit): Promise<void> {
  try {
    if (action.name === 'save_research_job_draft') {
      const job = await saveResearchJobDraft(inputFromAction(action))
      emitMessages(emit, researchJobFormSurface(job, 'research-job-' + job.id, true))
      emit({ type: 'agent_text', text: '草稿已保存。任务编号：' + job.id + '。之后输入这个编号即可继续编辑。' })
      emit({ type: 'task_state', state: 'WAITING_FOR_USER', taskId: job.id })
      return
    }

    if (action.name === 'submit_research_job') {
      const job = await submitResearchJob(inputFromAction(action))
      emitMessages(emit, researchJobSubmittedSurface(job, 'research-job-' + job.id))
      emit({ type: 'agent_text', text: '研究任务已提交。' })
      emit({ type: 'task_state', state: 'COMPLETED', taskId: job.id })
      emit({ type: 'done' })
      return
    }

    if (action.name === 'start_research_job') {
      const jobId = action.context?.jobId
      if (typeof jobId !== 'string') throw new InteractionValidationError('Research job id is required')
      const job = await getResearchJob(jobId)
      if (!job) throw new InteractionValidationError('Research job not found')
      const claimed = claimResearchJob(job.id)
      if (!claimed) {
        if (job.status === 'DRAFT') throw new InteractionValidationError('请先提交研究任务')
        emitMessages(emit, researchJobStatusSurface(job, 'research-job-' + job.id))
        emit({ type: 'agent_text', text: job.status === 'RUNNING' ? '任务正在运行，本次操作未重复执行。' : '任务已完成，可以按编号打开已有结果。' })
        emit({ type: 'done' })
        return
      }
      const events: AgentEvent[] = []
      let finalStatus: 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'FAILED'
      let failure: string | undefined
      try {
        await runAutonomousResearch(buildResearchRequest(claimed), event => {
          events.push(event)
          if (event.type === 'error') failure = event.error
          if (event.type === 'task_state' && event.state === 'COMPLETED') finalStatus = 'COMPLETED'
          emit(event)
        }, claimed.dimensions, claimed.id, action.surfaceId)
      } catch (error) {
        failure = (error as Error).message
        throw error
      } finally {
        if (runContext.getStore()?.signal.aborted) finalStatus = 'CANCELLED'
        finishResearchJob(job.id, finalStatus, events, failure)
      }
      return
    }

    throw new InteractionValidationError('Unknown research job action')
  } catch (error) {
    emit({ type: 'error', error: error instanceof Error ? error.message : 'Research job operation failed' })
  }
}
