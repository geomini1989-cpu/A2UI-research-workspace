/**
 * Contract between the frontend and the Agent.
 *
 * Demo actions are `name`s emitted by A2UI `Button` components and received by
 * the backend `/api/action` route. Future MCP tools / A2A calls will plug in here.
 */
export const DEMO_ACTIONS = [
  'submit_missing_information',
  'submit_research_scope',
  'approve_plan',
  'modify_plan',
  'approve_operation',
  'cancel_task',
  'run_deep_comparison',
  'generate_report',
  'compare_company',
  'add_watchlist',
  'explore_metric', 'explore_company', 'explore_risk', 'explore_segment',
  'explore_event', 'explore_period', 'compare_item', 'show_details',
  'view_source', 'change_time_range',
] as const

export type DemoAction = (typeof DEMO_ACTIONS)[number]

export const SEMANTIC_ACTIONS = [
  'explore_metric', 'explore_company', 'explore_risk', 'explore_segment',
  'explore_event', 'explore_period', 'compare_item', 'show_details',
  'view_source', 'change_time_range',
] as const
export type SemanticActionName = (typeof SEMANTIC_ACTIONS)[number]
export type SemanticActionContext = Partial<Record<
  'taskId' | 'subject' | 'company' | 'ticker' | 'metric' | 'period' | 'segment' | 'risk' | 'eventId' | 'comparisonTarget' | 'currentView' | 'source' | 'timeRange',
  string
>>
export function isSemanticAction(name: string): name is SemanticActionName {
  return (SEMANTIC_ACTIONS as readonly string[]).includes(name)
}

/** Payload received from an A2UI client action (shaped by the MessageProcessor). */
export interface AgentAction {
  name: string
  surfaceId: string
  sourceComponentId: string
  timestamp: string
  context: Record<string, unknown>
}

export interface SurfaceHistoryEntry {
  surfaceId: string
  parentSurfaceId: string
  depth: number
  action: AgentAction
  collapsed: boolean
}

export interface ActionExecutionState {
  action: AgentAction
  startedAt: number
}

/** Stream event envelope delivered by the backend over NDJSON. */
export type AgentStreamEvent =
  | { type: 'status'; status: string }
  | { type: 'activity'; actor: string; activity: string; detail?: string }
  | { type: 'task_state'; state: 'RUNNING' | 'WAITING_FOR_USER' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; taskId: string; interactionId?: string }
  | { type: 'surface'; surfaceId: string; catalogId: string }
  | { type: 'message'; message: unknown }
  | { type: 'agent_text'; text: string }
  | { type: 'done' }
  | { type: 'error'; error: string }
