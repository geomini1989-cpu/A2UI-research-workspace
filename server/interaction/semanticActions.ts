/**
 * The only UI-originated research intents accepted by the backend.  This is a
 * security boundary: A2UI action context is client input, not prompt text.
 */
export const SEMANTIC_ACTION_NAMES = [
  'explore_metric', 'explore_company', 'explore_risk', 'explore_segment',
  'explore_event', 'explore_period', 'compare_item', 'show_details',
  'view_source', 'change_time_range', 'apply_filters',
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
  // oxlint-disable-next-line no-control-regex -- 去除传入文本的控制字符。 / Strip control characters from input text.
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
  const filterSummary = [
    c.company && `公司：${c.company}`,
    c.segment && `业务板块：${c.segment}`,
    c.metric && `指标：${c.metric}`,
    c.period && `期间：${c.period}`,
    c.timeRange && `时间范围：${c.timeRange}`,
  ].filter(Boolean).join('，')
  const details: Record<SemanticActionName, string> = {
    explore_metric: `回答一个追问：${subject} 的 ${c.metric} 当前最值得关注什么？给出结论和最关键依据。`,
    explore_company: `回答一个追问：${c.company} 相对当前研究上下文最值得关注什么？`,
    explore_risk: `回答一个追问：${subject} 的 ${c.risk} 风险最可能如何影响判断？`,
    explore_segment: `回答一个追问：${subject} 的 ${c.segment} 业务分部最重要的变化和驱动是什么？`,
    explore_event: `回答一个追问：事件 ${c.eventId} 对 ${subject} 的核心影响是什么？`,
    explore_period: `回答一个追问：${subject} 在 ${c.period} 为什么出现当前表现？`,
    compare_item: `回答一个追问：围绕 ${c.comparisonTarget}，${subject} 的关键比较结论是什么？`,
    show_details: `回答一个追问：补充 ${subject} 当前视图最关键的细节与证据。`,
    view_source: `回答一个追问：${subject} 当前结论使用了什么演示数据，主要局限是什么？`,
    change_time_range: `回答一个追问：把时间范围看作 ${c.timeRange} 后，${subject} 的趋势判断有什么变化？`,
    apply_filters: `按以下筛选条件更新研究视图：${filterSummary || '当前筛选条件'}。重新组织相关指标、图表、表格和结论，只保留与筛选条件有关的内容。`,
  }
  return `${details[action.name]}\n已验证的交互上下文：${JSON.stringify(c)}`
}
