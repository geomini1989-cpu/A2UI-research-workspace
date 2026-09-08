type Component = Record<string, unknown>

function childIds(component: Component): string[] {
  const ids: string[] = []
  if (typeof component.child === 'string') ids.push(component.child)
  if (Array.isArray(component.children)) {
    for (const child of component.children) {
      if (typeof child === 'string') ids.push(child)
      else if (child && typeof child === 'object' && 'id' in child && typeof child.id === 'string') ids.push(child.id)
    }
  }
  return ids
}

function isSourceComponent(id: string, component: Component): boolean {
  if (/^(?:stream-)?ds-/i.test(id)) return true
  if (component.component === 'Badge' && typeof component.label === 'string' && /MCP|演示研究数据|Demo/i.test(component.label)) return true
  if (component.component === 'Text' && typeof component.text === 'string' && /数据来源/.test(component.text)) return true
  return false
}

function idHintRank(id: string): number | null {
  const value = id.toLowerCase()
  if (/^(title|page-title|main-title|research-title)$/.test(value)) return 0
  if (value.includes('overview')) return 10
  if (value.includes('filter')) return 15
  if (value.includes('metric')) return 20
  if (/(comparison|compare|table|segment|business)/.test(value)) return 30
  if (/(chart|trend)/.test(value)) return 40
  if (value.includes('risk')) return 50
  if (/(insight|summary|conclusion)/.test(value)) return 60
  return null
}

function directRank(id: string, component: Component): number {
  if (isSourceComponent(id, component)) return 900

  const hinted = idHintRank(id)
  if (hinted !== null) return hinted

  switch (component.component) {
    case 'StockOverview': return 10
    case 'FilterBar': return 15
    case 'MetricCard': return 20
    case 'ComparisonCard':
    case 'Table': return 30
    case 'Chart': return 40
    case 'RiskBadge': return 50
    case 'InsightList': return 55
    case 'ResearchSummary': return 60
    case 'Button': return 70
    case 'Badge': return 75
    case 'Divider': return 80
    case 'Text': {
      const text = typeof component.text === 'string' ? component.text : ''
      const variant = typeof component.variant === 'string' ? component.variant : 'body'
      if (/数据来源/.test(text)) return 900
      if (/风险/.test(text)) return 49
      if (/洞察|总结|结论|要点/.test(text)) return 54
      if (/业务分部|对比|财务|市场|技术|趋势|结构/.test(text)) return 29
      if ((variant === 'h1' || variant === 'h2') && /研究|分析|NVIDIA|AMD|公司/.test(text)) return 0
      if (/^h[1-5]$/.test(variant)) return 25
      if (variant === 'caption') return 80
      return 60
    }
    default:
      return 65
  }
}

function semanticRank(
  id: string,
  byId: ReadonlyMap<string, Component>,
  visiting: Set<string>,
): number {
  const component = byId.get(id)
  if (!component) return 65
  if (visiting.has(id)) return directRank(id, component)

  const own = directRank(id, component)
  if (!['Row', 'Column', 'Card', 'List'].includes(String(component.component))) return own

  visiting.add(id)
  const children = childIds(component)
  const substantive = children
    .map((childId) => {
      const child = byId.get(childId)
      return child ? { childId, child, rank: semanticRank(childId, byId, visiting) } : null
    })
    .filter((item): item is { childId: string; child: Component; rank: number } => Boolean(item))
    .filter((item) => !['Text', 'Divider', 'Badge'].includes(String(item.child.component)))

  const fallback = children
    .map((childId) => semanticRank(childId, byId, visiting))
    .filter((rank) => Number.isFinite(rank))
  visiting.delete(id)

  const ranks = substantive.length > 0 ? substantive.map((item) => item.rank) : fallback
  return ranks.length > 0 ? Math.min(...ranks) : own
}

/**
 * Stable page-level layout policy.
 *
 * Agent still chooses the actual components/content, but the server owns the
 * visual rhythm: overview -> filters -> key metrics -> precise analysis ->
 * supporting chart -> risk/insights -> actions -> data source.
 */
export function stableTopLevelOrder(
  ids: readonly string[],
  byId: ReadonlyMap<string, Component>,
): string[] {
  const seen = new Set<string>()
  return ids
    .filter((id) => id !== 'root' && !seen.has(id) && (seen.add(id), true))
    .map((id, index) => ({ id, index, rank: semanticRank(id, byId, new Set()) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.id)
}


export interface StableLayoutPlan {
  rootChildren: string[]
  generated: Component[]
}

/**
 * Deterministic page composition for generated research results.
 *
 * The Agent emits business cards only. The server owns placement: all top-level
 * MetricCards are grouped into one fixed Row; the remaining business blocks are
 * placed according to stableTopLevelOrder. This keeps "what to show" generative
 * while making "where it goes" deterministic.
 */
export function buildStableLayoutPlan(
  ids: readonly string[],
  byId: ReadonlyMap<string, Component>,
): StableLayoutPlan {
  const uniqueIds = [...new Set(ids.filter((id) => id !== 'root'))]
  const metricIds = uniqueIds.filter((id) => byId.get(id)?.component === 'MetricCard')
  const nonMetricIds = uniqueIds.filter((id) => byId.get(id)?.component !== 'MetricCard')
  const generated: Component[] = []

  if (metricIds.length > 0) {
    const metricRowId = '__layout-metrics'
    generated.push({
      component: 'Row',
      id: metricRowId,
      gap: 16,
      children: metricIds.map((id) => ({ id })),
    })
    const layoutMap = new Map(byId)
    layoutMap.set(metricRowId, generated[0])
    return {
      rootChildren: stableTopLevelOrder([...nonMetricIds, metricRowId], layoutMap),
      generated,
    }
  }

  return { rootChildren: stableTopLevelOrder(nonMetricIds, byId), generated }
}
