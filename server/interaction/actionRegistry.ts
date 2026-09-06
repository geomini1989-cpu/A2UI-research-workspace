import type { AgentActionPayload } from '../agent/researchAgent.js'
import { cancelPendingInteraction, getPendingInteraction, resolvePendingInteraction } from './interactionStore.js'
import type { PendingInteraction, ResearchDimension } from './types.js'
import { validateComparison, validateDimensions, InteractionValidationError } from './validation.js'
import { isSemanticActionName, validateSemanticAction, type SemanticAction } from './semanticActions.js'

export const ACTION_NAMES = [
  'submit_missing_information', 'submit_research_scope', 'approve_plan', 'modify_plan', 'approve_operation', 'cancel_task',
  'run_deep_comparison', 'generate_report', 'compare_company', 'add_watchlist',
] as const
export type ActionName = (typeof ACTION_NAMES)[number]

export type InteractionActionOutcome =
  | { kind: 'resume'; interaction?: PendingInteraction; request: string; dimensions?: ResearchDimension[] }
  | { kind: 'modify'; interaction: PendingInteraction }
  | { kind: 'cancel'; interaction: PendingInteraction }
  | { kind: 'legacy' }
  | { kind: 'semantic'; action: SemanticAction }

export function isAllowedAction(name: string): name is ActionName | import('./semanticActions.js').SemanticActionName {
  return (ACTION_NAMES as readonly string[]).includes(name) || isSemanticActionName(name)
}

function interactionFor(action: AgentActionPayload): PendingInteraction {
  const interactionId = action.context?.interactionId
  const taskId = action.context?.taskId
  if (typeof interactionId !== 'string' || typeof taskId !== 'string') throw new InteractionValidationError('interactionId and taskId are required')
  const interaction = getPendingInteraction(interactionId)
  if (!interaction || interaction.taskId !== taskId || interaction.surfaceId !== action.surfaceId) throw new InteractionValidationError('Interaction identity does not match the pending task')
  return interaction
}

export function handleRegisteredAction(action: AgentActionPayload): InteractionActionOutcome {
  if (!isAllowedAction(action.name)) throw new InteractionValidationError(`Action is not allow-listed: ${action.name}`)
  if (isSemanticActionName(action.name)) return { kind: 'semantic', action: validateSemanticAction(action) }
  if (action.name === 'generate_report' || action.name === 'compare_company' || action.name === 'add_watchlist') return { kind: 'legacy' }
  if (action.name === 'run_deep_comparison') {
    const { companyA, companyB } = validateComparison(action.context ?? {})
    return { kind: 'resume', request: `深入全面比较 ${companyA} 和 ${companyB}，包含财务、市场和技术` }
  }
  const interaction = interactionFor(action)
  if (action.name === 'cancel_task') return { kind: 'cancel', interaction: cancelPendingInteraction(interaction.interactionId) }
  if (action.name === 'modify_plan') return { kind: 'modify', interaction }
  if (action.name === 'submit_missing_information') {
    const values = validateComparison(action.context ?? {})
    return { kind: 'resume', interaction: resolvePendingInteraction(interaction.interactionId, values), request: `${interaction.context.originalRequest}\nComparison targets: ${values.companyA} and ${values.companyB}` }
  }
  if (action.name === 'submit_research_scope') {
    const dimensions = validateDimensions(action.context?.dimensions)
    return { kind: 'resume', interaction: resolvePendingInteraction(interaction.interactionId, { dimensions }), request: interaction.context.originalRequest, dimensions }
  }
  if (action.name === 'approve_plan' || action.name === 'approve_operation') {
    const dimensions = interaction.context.defaultDimensions
    return { kind: 'resume', interaction: resolvePendingInteraction(interaction.interactionId, { approved: true }), request: interaction.context.originalRequest, dimensions }
  }
  throw new InteractionValidationError(`No handler for allow-listed action: ${action.name}`)
}
