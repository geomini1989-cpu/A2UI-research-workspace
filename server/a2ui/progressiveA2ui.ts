import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import type { AgentMatch, DelegationResult } from '../orchestration/types.js'
import { RESEARCH_CATALOG_ID, sanitizeMessage } from './a2uiSchema.js'

type Component = Record<string, unknown>

const ref = (id: string) => ({ id })

function validated(messages: A2uiMessage[]): A2uiMessage[] {
  return messages.map((message) => {
    const result = sanitizeMessage(message)
    if (!result) throw new Error('Server generated an invalid progressive A2UI message')
    return result.message
  })
}

function componentId(component: Component): string | undefined {
  return typeof component.id === 'string' ? component.id : undefined
}

function staticChildIds(component: Component): string[] {
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

/**
 * Turn a validated final component tree into paint-sized steps.
 *
 * A complete dependency closure is emitted before its top-level root child is
 * revealed, so containers never point at components that have not arrived yet.
 * The root is then expanded one top-level block at a time. On an existing
 * progress surface the phase badge stays visible until the final block lands.
 */
export function progressiveRenderSteps(
  messages: readonly A2uiMessage[],
  options: { existingSurface?: boolean; progressComponentId?: string } = {},
): A2uiMessage[][] {
  const creates = messages.filter((message) => 'createSurface' in message)
  const dataUpdates = messages.filter((message) => 'updateDataModel' in message)
  const otherMessages = messages.filter((message) => !('createSurface' in message) && !('updateDataModel' in message) && !('updateComponents' in message))
  const componentMessages = messages.filter((message) => 'updateComponents' in message)
  const surfaceId = componentMessages.find((message) => 'updateComponents' in message)?.updateComponents.surfaceId
    ?? creates.find((message) => 'createSurface' in message)?.createSurface.surfaceId

  const orderedIds: string[] = []
  const byId = new Map<string, Component>()
  for (const message of componentMessages) {
    if (!('updateComponents' in message)) continue
    for (const raw of message.updateComponents.components) {
      const component = raw as Component
      const id = componentId(component)
      if (!id) continue
      if (!byId.has(id)) orderedIds.push(id)
      byId.set(id, component)
    }
  }

  const root = byId.get('root')
  const rootRefs = root && Array.isArray(root.children)
    ? root.children.filter((child): child is string | { id: string } =>
        typeof child === 'string' || Boolean(child && typeof child === 'object' && 'id' in child && typeof child.id === 'string'))
    : []
  const validRootRefs = rootRefs.filter((child) => byId.has(typeof child === 'string' ? child : child.id))

  // Fall back to the already-valid message batches when the model did not
  // provide the normal static root structure.
  if (!surfaceId || !root || validRootRefs.length === 0) {
    const fallback = messages.filter((message) => !(options.existingSurface && 'createSurface' in message))
    return fallback.map((message) => [message])
  }

  const emitted = new Set<string>()
  const renderSteps: A2uiMessage[][] = []
  const visibleRefs: Array<string | { id: string }> = []

  const collect = (id: string, batch: Component[], visiting: Set<string>) => {
    if (id === 'root' || emitted.has(id) || visiting.has(id)) return
    const component = byId.get(id)
    if (!component) return
    visiting.add(id)
    for (const childId of staticChildIds(component)) collect(childId, batch, visiting)
    visiting.delete(id)
    emitted.add(id)
    batch.push(component)
  }

  validRootRefs.forEach((rootRef, index) => {
    const id = typeof rootRef === 'string' ? rootRef : rootRef.id
    const batch: Component[] = []
    collect(id, batch, new Set())
    visibleRefs.push(rootRef)
    const children: Array<string | { id: string }> = [...visibleRefs]
    const progressId = options.progressComponentId ?? 'progress-phase'
    if (options.existingSurface && index < validRootRefs.length - 1 && byId.get(progressId) === undefined) {
      // The progress component belongs to the already-rendered skeleton, so it
      // intentionally does not appear in the final component map.
      children.push({ id: progressId })
    }
    batch.push({ ...root, children })
    renderSteps.push(validated([
      { version: 'v0.9', updateComponents: { surfaceId, components: batch } } as A2uiMessage,
    ]))
  })

  // Keep any non-visual state updates ordered before the first visible block.
  const prefix = [
    ...(options.existingSurface ? [] : creates.slice(0, 1)),
    ...dataUpdates,
    ...otherMessages,
  ]
  if (prefix.length > 0) renderSteps[0].unshift(...prefix)

  // Components not reachable from root are intentionally not revealed, but an
  // updated definition for an already-emitted id has already been folded into
  // byId. `orderedIds` is retained as a consistency guard for malformed trees.
  void orderedIds
  return renderSteps
}

/** Stable component/data-model key shared by live A2A activity and final results. */
export function progressiveAgentKey(agentName: string): string {
  return agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'agent'
}

function agentLabel(agentName: string): string {
  if (agentName.startsWith('Financial')) return '财务研究 Agent'
  if (agentName.startsWith('Market')) return '市场与新闻 Agent'
  if (agentName.startsWith('Technology')) return '技术与产品 Agent'
  if (agentName === 'Research Coordinator') return '研究协调 Agent'
  return agentName
}

function actorComponents(agentName: string): Component[] {
  const key = progressiveAgentKey(agentName)
  return [
    {
      component: 'Card', id: `progress-card-${key}`, title: agentLabel(agentName),
      children: [ref(`progress-badge-${key}`), ref(`progress-detail-${key}`)],
    },
    { component: 'Badge', id: `progress-badge-${key}`, label: '等待开始', variant: 'outline' },
    { component: 'Text', id: `progress-detail-${key}`, variant: 'caption', text: '尚未收到研究事件。' },
  ]
}

/**
 * Create a renderable surface before any specialist or LLM has completed.
 * Later messages overwrite these stable component ids on the same surface.
 */
export function createProgressiveResearchSurface(
  surfaceId: string,
  request: string,
  delegations: readonly AgentMatch[],
): A2uiMessage[] {
  const actors = delegations.length > 0
    ? delegations.map((item) => item.card.name)
    : ['Research Coordinator']
  const actorKeys = actors.map(progressiveAgentKey)
  const components: Component[] = [
    {
      component: 'Column', id: 'root', gap: 16,
      children: [ref('progress-title'), ref('progress-request'), ref('progress-phase'), ref('progress-agents'), ref('progress-source')],
    },
    { component: 'Text', id: 'progress-title', variant: 'h2', text: '正在构建研究视图' },
    { component: 'Text', id: 'progress-request', variant: 'body', text: request },
    {
      component: 'Badge', id: 'progress-phase', variant: 'secondary',
      label: delegations.length > 0 ? `0/${delegations.length} 个专业 Agent 已完成` : '正在准备生成界面',
    },
    {
      component: 'Column', id: 'progress-agents', gap: 12,
      children: actorKeys.map((key) => ref(`progress-card-${key}`)),
    },
    ...actors.flatMap(actorComponents),
    { component: 'Badge', id: 'progress-source', label: 'Demo / MCP Research Tool', variant: 'outline' },
  ]

  return validated([
    { version: 'v0.9', createSurface: { surfaceId, catalogId: RESEARCH_CATALOG_ID, theme: {} } },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId,
        path: '/',
        value: {
          request,
          phase: 'researching',
          completed: 0,
          total: delegations.length,
          agents: Object.fromEntries(actors.map((name) => [progressiveAgentKey(name), { name, status: 'pending' }])),
        },
      },
    },
    { version: 'v0.9', updateComponents: { surfaceId, components } },
  ] as A2uiMessage[])
}

/** Update the visible specialist card as live A2A status events arrive. */
export function progressiveAgentActivity(
  surfaceId: string,
  agentName: string,
  stage: 'delegation_started' | 'agent_working' | 'tool_call',
  detail?: string,
): A2uiMessage[] {
  const key = progressiveAgentKey(agentName)
  const label = stage === 'tool_call' ? '正在调用 MCP 工具' : stage === 'delegation_started' ? '已接收任务' : '正在研究'
  return validated([
    {
      version: 'v0.9',
      updateDataModel: { surfaceId, path: `/agents/${key}`, value: { name: agentName, status: stage, detail: detail ?? '' } },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [
          { component: 'Badge', id: `progress-badge-${key}`, label, variant: 'secondary' },
          { component: 'Text', id: `progress-detail-${key}`, variant: 'caption', text: detail || '专业 Agent 正在处理任务。' },
        ],
      },
    },
  ] as A2uiMessage[])
}

/** Publish one specialist's settled result without waiting for its siblings. */
export function progressiveAgentSettled(
  surfaceId: string,
  result: DelegationResult,
  completed: number,
  total: number,
): A2uiMessage[] {
  const key = progressiveAgentKey(result.agentName)
  const succeeded = result.status === 'completed' && Boolean(result.result)
  const detail = succeeded
    ? result.result!.note ?? `${result.result!.findings.length} findings · ${result.result!.metrics.length} metrics`
    : `专业 Agent 暂不可用：${result.error ?? '未知错误'}`
  return validated([
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId,
        path: `/agents/${key}`,
        value: succeeded
          ? { name: result.agentName, status: 'completed', result: result.result }
          : { name: result.agentName, status: 'failed', error: result.error ?? '未知错误' },
      },
    },
    {
      version: 'v0.9',
      updateDataModel: { surfaceId, path: '/completed', value: completed },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [
          { component: 'Badge', id: 'progress-phase', label: `${completed}/${total} 个专业 Agent 已返回`, variant: completed === total ? 'default' : 'secondary' },
          { component: 'Badge', id: `progress-badge-${key}`, label: succeeded ? '研究完成' : '暂不可用', variant: succeeded ? 'default' : 'destructive' },
          { component: 'Text', id: `progress-detail-${key}`, variant: 'body', text: detail },
        ],
      },
    },
  ] as A2uiMessage[])
}

/** Update the shared phase banner while keeping the already-rendered surface. */
export function progressivePhase(
  surfaceId: string,
  phase: 'tool' | 'synthesizing' | 'fallback',
  detail?: string,
): A2uiMessage[] {
  const text = phase === 'tool'
    ? (detail || '正在调用研究工具')
    : phase === 'fallback'
      ? (detail || '专业 Agent 不可用，正在使用 MCP 降级研究')
      : (detail || '专业研究已返回，正在生成最终视图')
  return validated([
    { version: 'v0.9', updateDataModel: { surfaceId, path: '/phase', value: phase } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [
          { component: 'Badge', id: 'progress-phase', label: text, variant: phase === 'fallback' ? 'destructive' : 'secondary' },
        ],
      },
    },
  ] as A2uiMessage[])
}
