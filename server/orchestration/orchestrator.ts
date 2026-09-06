import type { AgentCard } from '@a2a-js/sdk'
import { dispatchSpecialistTask, type A2aDispatchOutcome } from '../a2a/client.js'
import { matchAgentsBySkills } from '../registry/agentRegistry.js'
import type { AggregationContext, AgentActivityEvent, DelegationPlan, DelegationResult, NeedUserInput, RequiredSkill, SpecialistResult, TaskRequirement } from './types.js'

const unique = <T>(items: T[]): T[] => [...new Set(items)]

export function analyzeTaskRequirements(request: string): TaskRequirement {
  const text = request.toLowerCase()
  const pageOnly = /创建|生成|设计|create|build|design/.test(text) && /页面|界面|dashboard|page|ui/.test(text)
    && !/分析|全面|财务|估值|风险|市场|新闻|技术|产品|analy|financial|valuation|market|news|technology|product/.test(text)
  if (pageOnly) return { requiredSkills: [], canRunInParallel: false, useCoordinatorMcp: false }

  const skills: RequiredSkill[] = []
  const genericResearch = /分析|研究|analy|research/.test(text) && !/快速|quick/.test(text)
  const hasDimension = /财务|估值|营收|利润|增长|毛利|市场|新闻|行业趋势|竞争动态|市场事件|技术|产品|路线|护城河|financial|valuation|revenue|profit|margin|market|news|technology|technical|product|roadmap|moat/.test(text)
  const comprehensive = /全面分析|综合分析|全方位|深入研究|深入分析|完整比较|comprehensive|full analysis|deep research/.test(text) || (genericResearch && !hasDimension)
  const comparison = /比较|对比|compare|versus|\bvs\b/.test(text)
  const market = comprehensive || /市场|新闻|行业趋势|竞争动态|市场事件|market|news|industry trend|competitive intelligence/.test(text)
  const technology = comprehensive || /技术|产品|路线|护城河|technology|technical|product|roadmap|moat/.test(text)
  const financial = comprehensive || /财务|估值|营收|利润|增长|毛利|financial|valuation|revenue|profit|margin/.test(text) || (comparison && !technology && !market)

  if (financial) {
    skills.push(/估值|valuation/.test(text) ? 'valuation-analysis' : 'financial-analysis')
    if (/财务风险|估值风险|financial risk|valuation risk/.test(text)) skills.push('risk-analysis')
    if (comparison && !technology && !market) skills.push('company-comparison')
  }
  if (market) {
    skills.push(/新闻|news/.test(text) ? 'news-research' : 'market-research')
    if (/竞争动态|competitive intelligence|竞争格局/.test(text)) skills.push('competitive-intelligence')
    if (/行业趋势|industry trend/.test(text)) skills.push('industry-trends')
  }
  if (technology) {
    skills.push(/产品|product/.test(text) ? 'product-analysis' : 'technology-analysis')
    if (/技术风险|technology risk|technical risk/.test(text)) skills.push('technology-risk')
    if (comparison) skills.push('product-comparison')
  }
  return { requiredSkills: unique(skills), canRunInParallel: skills.length > 1, useCoordinatorMcp: skills.length === 0 }
}

export function requirementForDimensions(dimensions: readonly ('financial' | 'market' | 'technology')[]): TaskRequirement {
  const requiredSkills: RequiredSkill[] = dimensions.map((dimension) => dimension === 'financial' ? 'financial-analysis' : dimension === 'market' ? 'market-research' : 'technology-analysis')
  return { requiredSkills, canRunInParallel: requiredSkills.length > 1, useCoordinatorMcp: false }
}

export function createDelegationPlan(requirement: TaskRequirement): DelegationPlan {
  const matches = matchAgentsBySkills(requirement.requiredSkills)
  const covered = new Set(matches.flatMap((match) => match.matchedSkills))
  return { requirement, delegations: matches, unmatchedSkills: requirement.requiredSkills.filter((skill) => !covered.has(skill)) }
}

export type SpecialistDispatch = (
  card: AgentCard,
  request: string,
  timeoutMs: number,
  onActivity?: (activity: import('./types.js').SpecialistActivity) => void,
) => Promise<A2aDispatchOutcome>

const defaultSpecialistDispatch: SpecialistDispatch = (card, request, timeoutMs, onActivity) =>
  dispatchSpecialistTask(card, request, timeoutMs, fetch, onActivity)

export async function executeDelegationPlan(
  plan: DelegationPlan,
  request: string,
  onActivity: (event: AgentActivityEvent) => void = () => {},
  dispatch: SpecialistDispatch = defaultSpecialistDispatch,
  timeoutMs = 30_000,
  onSettled: (result: DelegationResult) => void = () => {},
): Promise<DelegationResult[]> {
  const calls = plan.delegations.map(async (match): Promise<DelegationResult> => {
    console.info(`[A2A] starting ${match.card.name}`)
    onActivity({ stage: 'delegation_started', actor: match.card.name, detail: match.matchedSkills.join(', ') })
    try {
      const outcome = await dispatch(match.card, request, timeoutMs, (activity) => {
        onActivity({ stage: activity.stage === 'tool' ? 'tool_call' : 'agent_working', actor: match.card.name, detail: activity.message })
      })
      onActivity({ stage: 'agent_completed', actor: match.card.name, detail: outcome.taskId })
      const result: DelegationResult = { agentName: match.card.name, matchedSkills: match.matchedSkills, status: 'completed', taskId: outcome.taskId, result: outcome.result }
      onSettled(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown A2A failure'
      console.error(`[A2A] ${match.card.name} failed: ${error}`)
      onActivity({ stage: 'agent_failed', actor: match.card.name, detail: error })
      const result: DelegationResult = { agentName: match.card.name, matchedSkills: match.matchedSkills, status: 'failed', error }
      onSettled(result)
      return result
    }
  })
  return Promise.all(calls)
}

export function aggregateSpecialistResults(results: DelegationResult[], plan: DelegationPlan, fallbackSubject = 'Research subject'): AggregationContext {
  const completed = results.filter((item): item is DelegationResult & { result: SpecialistResult } => item.status === 'completed' && Boolean(item.result))
  const dimensions: AggregationContext['dimensions'] = {}
  for (const item of completed) dimensions[item.result.taskType] = item.result
  return {
    subject: completed[0]?.result.subject || fallbackSubject,
    dimensions,
    unavailable: results.filter((item) => item.status === 'failed').map((item) => ({ agentName: item.agentName, skills: item.matchedSkills, reason: item.error ?? 'Unavailable' })),
    unmatchedSkills: plan.unmatchedSkills,
    completedAgents: completed.map((item) => item.agentName),
  }
}

export function findSpecialistNeedInput(results: DelegationResult[]): NeedUserInput | undefined {
  return results.find((item) => item.status === 'completed' && item.result?.needUserInput)?.result?.needUserInput
}
