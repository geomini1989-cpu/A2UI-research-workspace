export interface SemanticActionLike {
  event?: {
    context?: Record<string, unknown>
  }
}

export interface InlineMetricDetailLike {
  summary?: unknown
  keyPoints?: unknown
}

/** Only explicit research interactions may leave the current local UI and start Q&A. */
export function isResearchInteraction(action: SemanticActionLike | null | undefined): boolean {
  return action?.event?.context?.interactionMode === 'research'
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
