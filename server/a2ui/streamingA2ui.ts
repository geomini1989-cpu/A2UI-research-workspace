import type { A2uiMessage } from '@a2ui/web_core/v0_9'

type Component = Record<string, unknown>

function isMeaningfulResearchComponent(component: Component): boolean {
  switch (component.component) {
    case 'MetricCard':
      return typeof component.title === 'string'
        && component.title.trim().length > 0
        && typeof component.value === 'string'
        && component.value.trim().length > 0
    case 'ComparisonCard':
      return Array.isArray(component.rows) && component.rows.length > 0
    case 'StockOverview':
      return typeof component.company === 'string' && component.company.trim().length > 0
    case 'ResearchSummary':
      return (typeof component.summary === 'string' && component.summary.trim().length > 0)
        || (Array.isArray(component.keyPoints) && component.keyPoints.length > 0)
    case 'RiskBadge':
      return typeof component.level === 'string'
        && ((typeof component.label === 'string' && component.label.trim().length > 0)
          || (typeof component.description === 'string' && component.description.trim().length > 0))
    case 'InsightList':
      return Array.isArray(component.items) && component.items.length > 0
    case 'Table':
      return Array.isArray(component.rows) && component.rows.length > 0
    case 'Chart':
      return Array.isArray(component.data) && component.data.length > 0
    default:
      return false
  }
}

function childIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((child) => {
    if (typeof child === 'string') return [child]
    if (child && typeof child === 'object' && 'id' in child && typeof child.id === 'string') {
      return [child.id]
    }
    return []
  })
}

/**
 * Tracks the component graph of one streamed A2UI generation.
 *
 * Component identity is always the component id, never the component type:
 * multiple MetricCards / Charts / RiskBadges are expected and preserved.
 * Only root.children is accumulated so a later partial root update cannot hide
 * blocks that were already streamed.
 */
export class StreamingA2uiState {
  private readonly componentIds = new Set<string>()
  private readonly nestedReferences = new Set<string>()
  private meaningfulResearchContent = false
  private readonly rootChildIds: string[] = []
  private readonly rootChildSet = new Set<string>()
  private root: Component | null = null
  private sourceSeen = false
  private createSeen = false

  noteCreate() {
    this.createSeen = true
  }

  get sawCreate() {
    return this.createSeen
  }

  get hasRoot() {
    return Boolean(this.root)
  }

  get hasSource() {
    return this.sourceSeen
  }

  get hasSubstantiveContent() {
    return this.meaningfulResearchContent
  }

  prepareMessage(message: A2uiMessage): A2uiMessage {
    if (!('updateComponents' in message)) return message

    const components = (message.updateComponents.components as Component[]).map((component) => ({ ...component }))

    // First pass: collect every id in this complete A2UI message. This lets a
    // root safely reference a sibling component even when root appears first.
    for (const component of components) {
      if (typeof component.id === 'string') this.componentIds.add(component.id)
      if (isMeaningfulResearchComponent(component)) this.meaningfulResearchContent = true
      if (component.component === 'Badge' && typeof component.label === 'string' && component.label.includes('MCP')) {
        this.sourceSeen = true
      }
      if (component.id === 'root') continue
      if (typeof component.child === 'string') this.nestedReferences.add(component.child)
      for (const id of childIds(component.children)) this.nestedReferences.add(id)
    }

    // Second pass: root is append-only during this generation. De-duplicate by
    // component id, not component type.
    for (const component of components) {
      if (component.id !== 'root' || component.component !== 'Column') continue
      for (const id of childIds(component.children)) {
        if (id === 'root' || !this.componentIds.has(id) || this.rootChildSet.has(id)) continue
        this.rootChildSet.add(id)
        this.rootChildIds.push(id)
      }
      component.children = this.rootChildIds.map((id) => ({ id }))
      this.root = { ...component }
    }

    return {
      ...message,
      updateComponents: {
        ...message.updateComponents,
        components,
      },
    } as A2uiMessage
  }

  /**
   * Build the authoritative final root. Components that are referenced by a
   * nested container stay nested; unreferenced top-level components are added.
   */
  finalRootComponent(): Component | null {
    if (!this.root) return null

    for (const id of this.componentIds) {
      if (id === 'root' || this.nestedReferences.has(id) || this.rootChildSet.has(id)) continue
      this.rootChildSet.add(id)
      this.rootChildIds.push(id)
    }

    const normalized = this.rootChildIds.filter((id) =>
      this.componentIds.has(id) && !this.nestedReferences.has(id))

    this.rootChildIds.length = 0
    this.rootChildSet.clear()
    for (const id of normalized) {
      this.rootChildIds.push(id)
      this.rootChildSet.add(id)
    }

    this.root = { ...this.root, children: normalized.map((id) => ({ id })) }
    return { ...this.root, children: normalized.map((id) => ({ id })) }
  }

  createDataSourceComponents(): Component[] {
    if (!this.root || this.sourceSeen) return []

    const unique = (base: string) => {
      let id = base
      let index = 1
      while (this.componentIds.has(id)) id = `${base}-${++index}`
      return id
    }

    const dividerId = unique('stream-ds-div')
    this.componentIds.add(dividerId)
    const labelId = unique('stream-ds-label')
    this.componentIds.add(labelId)
    const badgeId = unique('stream-ds-badge')
    this.componentIds.add(badgeId)

    const current = childIds(this.root.children)
    return [
      { component: 'Divider', id: dividerId },
      { component: 'Text', id: labelId, variant: 'caption', text: '数据来源' },
      { component: 'Badge', id: badgeId, label: 'Demo / MCP Research Tool', variant: 'secondary' },
      {
        ...this.root,
        children: [...current, dividerId, labelId, badgeId].map((id) => ({ id })),
      },
    ]
  }
}
