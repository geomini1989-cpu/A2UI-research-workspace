import { beforeEach, describe, expect, it } from 'vitest'
import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { createFinancialAgentCard, createMarketAgentCard, createTechnologyAgentCard } from '../a2a/agentCard.js'
import { runResearchAgent, type AgentActionPayload, type AgentEvent } from '../agent/researchAgent.js'
import { analyzeTaskRequirements, createDelegationPlan, requirementForDimensions } from '../orchestration/orchestrator.js'
import { clearAgentRegistry, registerAgent } from '../registry/agentRegistry.js'
import { handleRegisteredAction, isAllowedAction } from './actionRegistry.js'
import { decideInteraction, interactionPolicy } from './interactionPolicy.js'
import { clearPendingInteractions, createPendingInteraction, getPendingInteraction, listPendingInteractions } from './interactionStore.js'
import { missingInformationSurface, planReviewSurface, researchScopeSurface } from './interactionUi.js'
import { InteractionValidationError, validateComparison, validateDimensions } from './validation.js'

beforeEach(() => {
  clearPendingInteractions(); clearAgentRegistry()
  for (const card of [createFinancialAgentCard('http://local'), createMarketAgentCard('http://local'), createTechnologyAgentCard('http://local')]) registerAgent(card)
})

function action(name: string, interaction: ReturnType<typeof createPendingInteraction>, context: Record<string, unknown> = {}): AgentActionPayload {
  return { name, surfaceId: interaction.surfaceId, sourceComponentId: 'button', context: { interactionId: interaction.interactionId, taskId: interaction.taskId, ...context } }
}

function components(messages: A2uiMessage[]) {
  return messages.flatMap((message) => 'updateComponents' in message ? message.updateComponents.components : []) as Record<string, unknown>[]
}

describe('InteractionPolicy: autonomy first', () => {
  it.each([
    '分析 NVIDIA', '深入研究 NVIDIA', '分析 NVIDIA 的估值', '比较 NVIDIA 和 AMD',
    '全面分析 NVIDIA', '总结 NVIDIA 最近市场变化', '分析 NVIDIA 技术竞争力',
  ])('auto-proceeds without HITL: %s', (request) => expect(decideInteraction(request)).toMatchObject({ required: false, reason: 'none' }))

  it('uses safe defaults for standard and deep research', () => {
    expect(analyzeTaskRequirements('分析 NVIDIA').requiredSkills).toEqual(expect.arrayContaining(['financial-analysis', 'market-research', 'technology-analysis']))
    expect(analyzeTaskRequirements('深入研究 NVIDIA').requiredSkills).toHaveLength(3)
  })

  it('detects genuinely missing comparison targets', () => expect(decideInteraction('帮我比较两家公司')).toMatchObject({ required: true, reason: 'missing_information', missingFields: ['companyA', 'companyB'] }))
  it('detects material ambiguity only when the target changes the result', () => expect(decideInteraction('比较 Apple 和最大的芯片公司')).toMatchObject({ required: true, reason: 'material_ambiguity' }))
  it('honors explicit scope choice and explicit plan review', () => {
    expect(decideInteraction('让我选择分析 NVIDIA 的哪些维度').reason).toBe('explicit_user_choice')
    expect(decideInteraction('先给我 NVIDIA 和 AMD 的完整比较计划，我确认后再执行').reason).toBe('explicit_user_choice')
  })
  it('requires approval only for gated demo operations', () => {
    expect(decideInteraction('运行深度比较 NVIDIA 和 AMD').reason).toBe('approval_required')
    expect(interactionPolicy.requiresApproval('普通分析 NVIDIA')).toBe(false)
  })
  it('overrides an unnecessary LLM request to ask about a clear task', () => {
    expect(decideInteraction('分析 NVIDIA', { required: true, reason: 'explicit_user_choice', confidence: 0.2 })).toMatchObject({ required: false, reason: 'none' })
  })
})

describe('Pending task and A2UI interaction surfaces', () => {
  it('pauses a task with correlated identifiers and a persisted waiting record', () => {
    const interaction = createPendingInteraction('missing_information', { originalRequest: '帮我比较两家公司', decision: decideInteraction('帮我比较两家公司') })
    expect(interaction).toMatchObject({ status: 'waiting', taskStatus: 'WAITING_FOR_USER' })
    expect(interaction.interactionId).toBeTruthy(); expect(interaction.taskId).toBeTruthy(); expect(interaction.surfaceId).toBeTruthy()
    expect(getPendingInteraction(interaction.interactionId)).toEqual(interaction)
  })

  it('generates the missing-information form entirely as allow-listed A2UI', () => {
    const interaction = createPendingInteraction('missing_information', { originalRequest: '帮我比较两家公司', decision: decideInteraction('帮我比较两家公司') })
    const messages = missingInformationSurface(interaction)
    expect(messages.some((message) => 'updateDataModel' in message)).toBe(true)
    expect(components(messages).filter((item) => item.component === 'TextField')).toHaveLength(2)
    expect(components(messages).some((item) => item.component === 'Button' && item.label === '继续')).toBe(true)
    const root = components(messages).find((item) => item.id === 'root')
    expect(root?.children).toEqual(expect.arrayContaining([{ id: 'actions' }]))
    expect(root?.children).not.toEqual(expect.arrayContaining([{ id: 'continue' }, { id: 'cancel' }]))
  })

  it('emits WAITING_FOR_USER without executing specialists for missing input', async () => {
    const events: AgentEvent[] = []
    await runResearchAgent('帮我比较两家公司', (event) => events.push(event))
    expect(events).toContainEqual(expect.objectContaining({ type: 'task_state', state: 'WAITING_FOR_USER' }))
    expect(events.some((event) => event.type === 'activity' && event.activity === 'A2A delegation started')).toBe(false)
    expect(listPendingInteractions()).toHaveLength(1)
  })

  it('resumes the same task after validating two companies', () => {
    const interaction = createPendingInteraction('missing_information', { originalRequest: '帮我比较两家公司', decision: decideInteraction('帮我比较两家公司') })
    const outcome = handleRegisteredAction(action('submit_missing_information', interaction, { companyA: 'NVIDIA', companyB: 'AMD' }))
    expect(outcome.kind).toBe('resume')
    if (outcome.kind === 'resume') expect(outcome.interaction?.taskId).toBe(interaction.taskId)
    expect(getPendingInteraction(interaction.interactionId)).toMatchObject({ status: 'completed', taskStatus: 'RUNNING' })
  })

  it('renders explicit choice and routes only selected dimensions', () => {
    const interaction = createPendingInteraction('explicit_user_choice', { originalRequest: '让我选择分析 NVIDIA 的哪些维度', decision: decideInteraction('让我选择分析 NVIDIA 的哪些维度') })
    expect(components(researchScopeSurface(interaction)).some((item) => item.component === 'ChoicePicker')).toBe(true)
    const outcome = handleRegisteredAction(action('submit_research_scope', interaction, { dimensions: ['financial', 'technology'] }))
    expect(outcome).toMatchObject({ kind: 'resume', dimensions: ['financial', 'technology'] })
    if (outcome.kind === 'resume') {
      const names = createDelegationPlan(requirementForDimensions(outcome.dimensions ?? [])).delegations.map((item) => item.card.name)
      expect(names).toEqual(expect.arrayContaining(['Financial Research Agent', 'Technology & Product Research Agent']))
      expect(names.some((name) => name.startsWith('Market'))).toBe(false)
    }
  })

  it('creates a plan review with zero execution until Start', async () => {
    const events: AgentEvent[] = []
    await runResearchAgent('先给我 NVIDIA 和 AMD 的完整比较计划，我确认后再执行', (event) => events.push(event))
    expect(events.some((event) => event.type === 'task_state' && event.state === 'WAITING_FOR_USER')).toBe(true)
    expect(events.some((event) => event.type === 'activity' && event.activity === 'A2A delegation started')).toBe(false)
    const interaction = listPendingInteractions()[0]
    expect(components(planReviewSurface(interaction)).some((item) => item.component === 'Button' && item.label === '开始')).toBe(true)
    expect(handleRegisteredAction(action('approve_plan', interaction))).toMatchObject({ kind: 'resume', dimensions: ['financial', 'market', 'technology'] })
  })

  it('Modify keeps waiting, then selected scope changes the plan', () => {
    const interaction = createPendingInteraction('explicit_user_choice', { originalRequest: '完整比较 NVIDIA 和 AMD', decision: decideInteraction('让我选择'), defaultDimensions: ['financial', 'market', 'technology'] })
    expect(handleRegisteredAction(action('modify_plan', interaction))).toMatchObject({ kind: 'modify' })
    expect(interaction.status).toBe('waiting')
    const resumed = handleRegisteredAction(action('submit_research_scope', interaction, { dimensions: ['financial', 'technology'] }))
    expect(resumed).toMatchObject({ kind: 'resume', dimensions: ['financial', 'technology'] })
  })

  it('Cancel transitions to CANCELLED and prevents any later resume', () => {
    const interaction = createPendingInteraction('explicit_user_choice', { originalRequest: '分析 NVIDIA', decision: decideInteraction('让我选择') })
    expect(handleRegisteredAction(action('cancel_task', interaction))).toMatchObject({ kind: 'cancel' })
    expect(getPendingInteraction(interaction.interactionId)).toMatchObject({ status: 'cancelled', taskStatus: 'CANCELLED' })
    expect(() => handleRegisteredAction(action('submit_research_scope', interaction, { dimensions: ['financial'] }))).toThrow()
  })
})

describe('Action security and backend validation', () => {
  it('uses a centralized allow-list and rejects unknown actions', () => {
    expect(isAllowedAction('approve_plan')).toBe(true); expect(isAllowedAction('unknown_action')).toBe(false)
    expect(() => handleRegisteredAction({ name: 'unknown_action', surfaceId: 's', context: {} })).toThrow(InteractionValidationError)
  })
  it('runs deep comparison only after the allow-listed approval action is clicked', () => {
    const outcome = handleRegisteredAction({ name: 'run_deep_comparison', surfaceId: 'research', context: { companyA: 'NVIDIA', companyB: 'AMD' } })
    expect(outcome).toMatchObject({ kind: 'resume' })
    if (outcome.kind === 'resume') expect(outcome.request).toContain('深入全面比较 NVIDIA 和 AMD')
  })
  it('rejects invalid dimensions', () => expect(() => validateDimensions(['financial', 'hacker-agent'])).toThrow(InteractionValidationError))
  it('rejects missing, excessive, and duplicate comparison companies', () => {
    expect(() => validateComparison({ companyA: '', companyB: 'AMD' })).toThrow()
    expect(() => validateComparison({ companyA: 'NVIDIA', companyB: 'nvidia' })).toThrow()
    expect(() => validateComparison({ companyA: 'x'.repeat(81), companyB: 'AMD' })).toThrow()
  })
  it('rejects mismatched task/surface identity', () => {
    const interaction = createPendingInteraction('missing_information', { originalRequest: 'compare', decision: decideInteraction('帮我比较两家公司') })
    expect(() => handleRegisteredAction({ ...action('cancel_task', interaction), surfaceId: 'wrong-surface' })).toThrow(InteractionValidationError)
  })
})
