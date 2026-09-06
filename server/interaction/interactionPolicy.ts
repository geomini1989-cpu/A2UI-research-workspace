import { companiesInRequest } from '../agent/specialistUtils.js'
import type { InteractionDecision } from './types.js'

export interface InteractionPolicy {
  shouldRequestMissingInfo(request: string): boolean
  isMaterialAmbiguity(request: string): boolean
  didUserExplicitlyRequestChoice(request: string): boolean
  requiresApproval(request: string): boolean
  shouldAutoProceed(request: string): boolean
}

function isComparison(request: string) { return /比较|对比|compare|versus|\bvs\b/i.test(request) }
function isPlanReview(request: string) { return /先给我.*计划|计划.*确认|确认后再执行|review.*plan|approve.*plan/i.test(request) }

export const interactionPolicy: InteractionPolicy = {
  shouldRequestMissingInfo(request) {
    return isComparison(request) && companiesInRequest(request).length < 2 && !/最大的芯片公司|largest chip company/i.test(request)
  },
  isMaterialAmbiguity(request) {
    return isComparison(request) && /最大的芯片公司|最大.*半导体|largest chip company/i.test(request)
  },
  didUserExplicitlyRequestChoice(request) {
    return /让我选择|我来选择|给我几个研究方向|哪些维度.*选择|先给我.*计划|确认后再执行|let me choose|choose.*dimensions/i.test(request)
  },
  requiresApproval(request) {
    return /运行深度比较|run deep comparison|导出研究|export research|添加.*观察列表|add.*watchlist/i.test(request)
  },
  shouldAutoProceed(request) {
    return !this.shouldRequestMissingInfo(request) && !this.isMaterialAmbiguity(request)
      && !this.didUserExplicitlyRequestChoice(request) && !this.requiresApproval(request)
  },
}

/** Deterministic backend policy wins over an LLM suggestion, preventing over-asking. */
export function decideInteraction(request: string, _llmSuggestion?: Partial<InteractionDecision>): InteractionDecision {
  if (interactionPolicy.shouldRequestMissingInfo(request)) return { required: true, reason: 'missing_information', confidence: 0.99, missingFields: ['companyA', 'companyB'], explanation: 'Two comparison targets are required and cannot be inferred.' }
  if (interactionPolicy.isMaterialAmbiguity(request)) return { required: true, reason: 'material_ambiguity', confidence: 0.35, ambiguousOptions: ['NVIDIA', 'TSMC', 'Intel'], explanation: 'The ambiguous target materially changes the comparison.' }
  if (isPlanReview(request) || interactionPolicy.didUserExplicitlyRequestChoice(request)) return { required: true, reason: 'explicit_user_choice', confidence: 1, explanation: isPlanReview(request) ? 'The user explicitly requested plan approval.' : 'The user explicitly requested control over research scope.' }
  if (interactionPolicy.requiresApproval(request)) return { required: true, reason: 'approval_required', confidence: 1, explanation: 'This demo operation requires explicit approval.' }
  return { required: false, reason: 'none', confidence: 0.95, explanation: 'Required information is present or a safe research default exists.' }
}

export function isExplicitPlanReview(request: string): boolean { return isPlanReview(request) }
