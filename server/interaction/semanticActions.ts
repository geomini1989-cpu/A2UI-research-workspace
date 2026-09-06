/**
 * The only UI-originated research intents accepted by the backend.  This is a
 * security boundary: A2UI action context is client input, not prompt text.
 */
export const SEMANTIC_ACTION_NAMES = [
  'explore_metric', 'explore_company', 'explore_risk', 'explore_segment',
  'explore_event', 'explore_period', 'compare_item', 'show_details',
  'view_source', 'change_time_range',
] as const

export type SemanticActionName = (typeof SEMANTIC_ACTION_NAMES)[number]
export interface SemanticActionContext {
  taskId?: string
  subject?: string
  company?: string
  ticker?: string
  metric?: string
  period?: string
  segment?: string
  risk?: string
  eventId?: string
  comparisonTarget?: string
  currentView?: string
  source?: string
  timeRange?: string
}

export interface SemanticAction {
  name: SemanticActionName
  surfaceId: string
  sourceComponentId: string
  context: SemanticActionContext
}

const CONTEXT_KEYS = new Set<keyof SemanticActionContext>([
  'taskId', 'subject', 'company', 'ticker', 'metric', 'period', 'segment',
  'risk', 'eventId', 'comparisonTarget', 'currentView', 'source', 'timeRange',
])

export class SemanticActionValidationError extends Error {}

export function isSemanticActionName(value: string): value is SemanticActionName {
  return (SEMANTIC_ACTION_NAMES as readonly string[]).includes(value)
}

function cleanString(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new SemanticActionValidationError(`${key} must be a string`)
  const normalized = value.replace(/[\u0000-\u001f]/g, ' ').trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > 120) throw new SemanticActionValidationError(`${key} is invalid`)
  return normalized
}

/** Validate, trim and constrain every value before it is ever serialized for an LLM. */
export function validateSemanticAction(input: {
  name: string
  surfaceId?: string
  sourceComponentId?: string
  context?: Record<string, unknown>
}): SemanticAction {
  if (!isSemanticActionName(input.name)) throw new SemanticActionValidationError(`Action is not allow-listed: ${input.name}`)
  const surfaceId = cleanString(input.surfaceId, 'surfaceId')
  const sourceComponentId = cleanString(input.sourceComponentId, 'sourceComponentId')
  if (!surfaceId || !sourceComponentId) throw new SemanticActionValidationError('surfaceId and sourceComponentId are required')
  const raw = input.context ?? {}
  const context: SemanticActionContext = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!CONTEXT_KEYS.has(key as keyof SemanticActionContext)) throw new SemanticActionValidationError(`Unsupported action context: ${key}`)
    const cleaned = cleanString(value, key)
    if (cleaned !== undefined) (context as Record<string, string>)[key] = cleaned
  }
  const required: Partial<Record<SemanticActionName, keyof SemanticActionContext>> = {
    explore_metric: 'metric', explore_company: 'company', explore_risk: 'risk',
    explore_segment: 'segment', explore_event: 'eventId', explore_period: 'period',
    compare_item: 'comparisonTarget', change_time_range: 'timeRange',
  }
  const requiredKey = required[input.name]
  if (requiredKey && !context[requiredKey]) throw new SemanticActionValidationError(`${input.name} requires ${requiredKey}`)
  return { name: input.name, surfaceId, sourceComponentId, context }
}

/** A structured, Chinese research request. Routing remains the coordinator's job. */
export function semanticActionRequest(action: SemanticAction): string {
  const c = action.context
  const subject = c.company ?? c.subject ?? '当前研究对象'
  const details: Record<SemanticActionName, string> = {
    explore_metric: `仅深入分析 ${subject} 的 ${c.metric}，重点说明趋势、驱动因素、可持续性与相关风险。`,
    explore_company: `深入研究 ${c.company}，并与当前研究上下文关联。`,
    explore_risk: `深入分析 ${subject} 的 ${c.risk}，说明触发条件、影响路径和缓解因素。`,
    explore_segment: `深入研究 ${subject} 的 ${c.segment} 业务分部，结合财务表现与产品/技术驱动因素。`,
    explore_event: `深入分析市场事件 ${c.eventId} 对 ${subject} 的影响、时间线与不确定性。`,
    explore_period: `深入分析 ${subject} 在 ${c.period} 的表现，解释该期间的变化和关键驱动。`,
    compare_item: `围绕 ${c.comparisonTarget} 对 ${subject} 进行针对性的估值或业务比较。`,
    show_details: `补充展示 ${subject} 当前视图的关键细节与证据。`,
    view_source: `说明 ${subject} 当前结论使用的演示数据来源与局限。`,
    change_time_range: `将 ${subject} 的分析时间范围调整为 ${c.timeRange}，并重新解释趋势。`,
  }
  return `${details[action.name]}\n已验证的交互上下文：${JSON.stringify(c)}`
}
