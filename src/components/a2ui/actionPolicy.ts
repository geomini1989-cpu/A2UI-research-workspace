export interface SemanticActionLike {
  event?: {
    name?: string
    context?: Record<string, unknown>
  }
}

export interface InlineMetricDetailLike {
  summary?: unknown
  keyPoints?: unknown
}

const FOLLOW_UP_ACTIONS = new Set([
  'explore_metric',
  'explore_company',
  'explore_risk',
  'explore_segment',
  'explore_event',
  'explore_period',
  'compare_item',
  'show_details',
  'view_source',
])

/** Explicit marker used by charts, whose point clicks are local by default. */
export function isResearchInteraction(action: SemanticActionLike | null | undefined): boolean {
  return action?.event?.context?.interactionMode === 'research'
}

/** Card/table/risk/stock semantic actions are conversational follow-ups even without the optional marker. */
export function isFollowUpAction(action: SemanticActionLike | null | undefined): boolean {
  const name = action?.event?.name
  return typeof name === 'string' && FOLLOW_UP_ACTIONS.has(name)
}

/** Empty/trivial detail envelopes must not make a simple metric card clickable. */
export function hasInlineMetricDetail(detail: InlineMetricDetailLike | null | undefined): boolean {
  if (!detail) return false
  const summary = typeof detail.summary === 'string' ? detail.summary.trim() : ''
  const points = Array.isArray(detail.keyPoints)
    ? detail.keyPoints.filter((point) => typeof point === 'string' && point.trim().length > 0)
    : []
  return Boolean(summary || points.length > 0)
}
