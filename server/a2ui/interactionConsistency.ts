type Component = Record<string, unknown>

type MetricInteractionMode = 'static' | 'detail' | 'followup'

function hasInlineDetail(component: Component): boolean {
  const detail = component.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return false
  const record = detail as Record<string, unknown>
  const summary = typeof record.summary === 'string' && record.summary.trim().length > 0
  const keyPoints = Array.isArray(record.keyPoints)
    && record.keyPoints.some((point) => typeof point === 'string' && point.trim().length > 0)
  return summary || keyPoints
}

function hasFollowUp(component: Component): boolean {
  const action = component.action
  if (!action || typeof action !== 'object' || Array.isArray(action)) return false
  const event = (action as Record<string, unknown>).event
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false
  const name = (event as Record<string, unknown>).name
  return typeof name === 'string' && name.trim().length > 0
}

function modeOf(component: Component): MetricInteractionMode {
  if (hasInlineDetail(component)) return 'detail'
  if (hasFollowUp(component)) return 'followup'
  return 'static'
}

function keepMode(component: Component, mode: MetricInteractionMode): Component {
  if (mode === 'detail') {
    const { action: _action, ...rest } = component
    return rest
  }
  if (mode === 'followup') {
    const { detail: _detail, ...rest } = component
    return rest
  }
  const { detail: _detail, action: _action, ...rest } = component
  return rest
}

/**
 * Metric interaction consistency is scoped to an explicit semantic group, not
 * to the MetricCard component type itself.
 *
 * Example: NVIDIA/AMD "数据中心营收" cards share one interactionGroup and therefore
 * must both be static, both inline-detail, or both follow-up. A separate
 * "AI 加速器份额" group may legitimately use another mode.
 *
 * The server never invents missing detail/action payloads. If the model emits a
 * mixed group and there is no complete common behavior available for every card,
 * the safe common denominator is static.
 */
export function normalizeMetricInteractionGroups(components: readonly Component[]): Component[] {
  const result = components.map((component) => ({ ...component }))
  const groups = new Map<string, number[]>()

  result.forEach((component, index) => {
    if (component.component !== 'MetricCard') return
    const group = typeof component.interactionGroup === 'string'
      ? component.interactionGroup.trim()
      : ''
    if (!group) return
    const indexes = groups.get(group) ?? []
    indexes.push(index)
    groups.set(group, indexes)
  })

  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue
    const cards = indexes.map((index) => result[index])
    const modes = new Set(cards.map(modeOf))
    if (modes.size <= 1) continue

    const allHaveDetail = cards.every(hasInlineDetail)
    const allHaveFollowUp = cards.every(hasFollowUp)
    const target: MetricInteractionMode = allHaveFollowUp
      ? 'followup'
      : allHaveDetail
        ? 'detail'
        : 'static'

    for (const index of indexes) result[index] = keepMode(result[index], target)
  }

  return result
}
