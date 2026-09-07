import type { A2uiMessage } from '@a2ui/web_core/v0_9'

import { companiesInRequest } from '../agent/specialistUtils.js'
import { runAutonomousResearch, type AgentActionPayload, type Emit } from '../agent/researchAgent.js'
import { RESEARCH_CATALOG_ID, sanitizeMessage } from '../a2ui/a2uiSchema.js'
import type { ResearchDimension } from '../interaction/types.js'

type Component = Record<string, unknown>

interface ComposerState {
  company: string
  selected: ResearchDimension[]
  comparison: string
}

const MODULES: Record<ResearchDimension, { title: string; description: string; agent: string }> = {
  financial: {
    title: '财务与估值',
    description: '收入、利润、估值与财务风险',
    agent: 'Financial Agent',
  },
  market: {
    title: '市场与风险',
    description: '市场变化、新闻、竞争与事件风险',
    agent: 'Market Agent',
  },
  technology: {
    title: '技术与产品',
    description: '产品路线、技术壁垒与竞争力',
    agent: 'Technology Agent',
  },
}

const DIMENSIONS = Object.keys(MODULES) as ResearchDimension[]
const ACTIONS = new Set([
  'composer_add_dimension',
  'composer_remove_dimension',
  'composer_add_comparison',
  'composer_remove_comparison',
  'composer_start',
])

const ref = (id: string) => ({ id })

function validated(messages: A2uiMessage[]): A2uiMessage[] {
  return messages.map((message) => {
    const result = sanitizeMessage(message)
    if (!result) throw new Error('Invalid Research Composer A2UI message')
    return result.message
  })
}

function selectedFromRequest(message: string): ResearchDimension[] {
  const selected: ResearchDimension[] = []
  if (/财务|估值|financial|valuation/i.test(message)) selected.push('financial')
  if (/市场|新闻|风险|market|news|risk/i.test(message)) selected.push('market')
  if (/技术|产品|technology|product/i.test(message)) selected.push('technology')
  return selected
}

function stateFromRequest(message: string): ComposerState {
  const companies = companiesInRequest(message)
  return {
    company: companies[0] ?? 'NVIDIA',
    selected: selectedFromRequest(message),
    comparison: companies[1] ?? '',
  }
}

function stateFromAction(action: AgentActionPayload): ComposerState {
  const company = typeof action.context?.company === 'string' && action.context.company.trim()
    ? action.context.company.trim()
    : 'NVIDIA'
  const selected = Array.isArray(action.context?.selected)
    ? action.context.selected.filter((item): item is ResearchDimension =>
        typeof item === 'string' && DIMENSIONS.includes(item as ResearchDimension))
    : []
  const comparison = typeof action.context?.comparison === 'string' ? action.context.comparison.trim() : ''
  return { company, selected: [...new Set(selected)], comparison }
}

function baseContext() {
  return {
    company: { path: '/company' },
    selected: { path: '/selected' },
    comparison: { path: '/comparison' },
  }
}

function composerMessages(state: ComposerState, surfaceId: string, create: boolean): A2uiMessage[] {
  const components: Component[] = []
  const rootChildren: Array<{ id: string }> = []

  const addRoot = (component: Component) => {
    components.push(component)
    rootChildren.push(ref(String(component.id)))
  }

  addRoot({ component: 'Text', id: 'composer-title', variant: 'h2', text: state.comparison ? `${state.company} vs ${state.comparison} 研究方案` : `${state.company} 研究方案` })
  addRoot({
    component: 'Text',
    id: 'composer-help',
    variant: 'body',
    text: '选择本次需要覆盖的研究方向。你可以随时增减内容，确认后再开始分析。',
  })
  addRoot({ component: 'Badge', id: 'composer-status', label: `已选择 ${state.selected.length} 个研究方向`, variant: 'secondary' })

  if (state.comparison) {
    const comparisonChildren = [ref('comparison-text'), ref('comparison-remove')]
    addRoot({ component: 'Card', id: 'comparison-card', title: '对比模式', children: comparisonChildren })
    components.push(
      { component: 'Text', id: 'comparison-text', variant: 'body', text: `主研究对象：${state.company} · 对比对象：${state.comparison}` },
      {
        component: 'Button',
        id: 'comparison-remove',
        label: '移除对比对象',
        variant: 'ghost',
        action: { event: { name: 'composer_remove_comparison', context: baseContext() } },
      },
    )
  }

  addRoot({ component: 'Text', id: 'current-title', variant: 'h3', text: '已选研究方向' })

  if (state.selected.length === 0) {
    addRoot({
      component: 'Card',
      id: 'empty-plan',
      children: [ref('empty-plan-text')],
    })
    components.push({ component: 'Text', id: 'empty-plan-text', variant: 'body', text: '还没有选择研究方向。先从下面添加一项。' })
  } else {
    const moduleCards = state.selected.map((dimension) => ref(`module-${dimension}`))
    addRoot({ component: 'Row', id: 'selected-modules', gap: 12, children: moduleCards })
    for (const dimension of state.selected) {
      const meta = MODULES[dimension]
      components.push(
        {
          component: 'Card',
          id: `module-${dimension}`,
          title: meta.title,
          children: [ref(`module-${dimension}-description`), ref(`module-${dimension}-remove`)],
          weight: 1,
        },
        { component: 'Text', id: `module-${dimension}-description`, variant: 'caption', text: meta.description },
        {
          component: 'Button',
          id: `module-${dimension}-remove`,
          label: '移除',
          variant: 'ghost',
          action: {
            event: {
              name: 'composer_remove_dimension',
              context: { ...baseContext(), dimension },
            },
          },
        },
      )
    }
  }

  addRoot({ component: 'Text', id: 'add-title', variant: 'h3', text: '添加研究方向' })
  const available = DIMENSIONS.filter((dimension) => !state.selected.includes(dimension))
  const addButtons = available.map((dimension) => ref(`add-${dimension}`))
  if (!state.comparison) addButtons.push(ref('add-comparison'))
  if (addButtons.length > 0) {
    addRoot({ component: 'Row', id: 'add-actions', gap: 10, children: addButtons })
  }

  for (const dimension of available) {
    components.push({
      component: 'Button',
      id: `add-${dimension}`,
      label: `＋ ${MODULES[dimension].title}`,
      variant: 'outline',
      action: {
        event: {
          name: 'composer_add_dimension',
          context: { ...baseContext(), dimension },
        },
      },
    })
  }

  if (!state.comparison) {
    components.push({
      component: 'Button',
      id: 'add-comparison',
      label: '＋ 加入 AMD 对比',
      variant: 'outline',
      action: {
        event: {
          name: 'composer_add_comparison',
          context: { ...baseContext(), comparisonTarget: 'AMD' },
        },
      },
    })
  }

  const agents = state.selected.map((dimension) => MODULES[dimension].agent)
  addRoot({
    component: 'Card',
    id: 'routing-preview',
    title: '研究范围',
    children: [ref('routing-text')],
  })
  components.push({
    component: 'Text',
    id: 'routing-text',
    variant: 'body',
    text: agents.length
      ? `预计调用：${agents.join(' · ')}${state.comparison ? ` · 对比 ${state.company} / ${state.comparison}` : ''}`
      : '加入研究模块后，这里会实时显示预计调用的专业 Agent。',
  })

  if (state.selected.length > 0) {
    addRoot({
      component: 'Button',
      id: 'composer-start',
      label: state.comparison ? '开始这份对比研究' : '开始这份研究',
      variant: 'primary',
      action: { event: { name: 'composer_start', context: baseContext() } },
    })
  } else {
    addRoot({ component: 'Text', id: 'composer-tip', variant: 'caption', text: '至少选择一个研究方向后即可开始。' })
  }

  const messages: A2uiMessage[] = []
  if (create) {
    messages.push({
      version: 'v0.9',
      createSurface: { surfaceId, catalogId: RESEARCH_CATALOG_ID, theme: {} },
    } as A2uiMessage)
  }
  messages.push(
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId,
        path: '/',
        value: {
          company: state.company,
          selected: state.selected,
          comparison: state.comparison,
        },
      },
    } as A2uiMessage,
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [
          { component: 'Column', id: 'root', gap: 16, children: rootChildren },
          ...components,
        ],
      },
    } as A2uiMessage,
  )
  return validated(messages)
}

function researchRequest(state: ComposerState): string {
  const labels = state.selected.map((dimension) => MODULES[dimension].title).join('、')
  if (state.comparison) {
    return `比较 ${state.company} 和 ${state.comparison}，重点研究：${labels}。请基于已选择的研究模块直接执行。`
  }
  return `深度研究 ${state.company}，重点研究：${labels}。请基于已选择的研究模块直接执行。`
}

export function isResearchComposerRequest(message: string): boolean {
  return /研究方案|研究方案|研究菜单|research\s+composer|research\s+plan/i.test(message)
}

export function isResearchComposerAction(name: string): boolean {
  return ACTIONS.has(name)
}

export async function runResearchComposerRequest(message: string, emit: Emit): Promise<void> {
  const state = stateFromRequest(message)
  const surfaceId = `composer-${crypto.randomUUID()}`
  emit({ type: 'status', status: '正在准备研究方案…' })
  for (const a2uiMessage of composerMessages(state, surfaceId, true)) emit({ type: 'message', message: a2uiMessage })
  emit({ type: 'task_state', state: 'WAITING_FOR_USER', taskId: surfaceId })
}

export async function runResearchComposerAction(action: AgentActionPayload, emit: Emit): Promise<void> {
  const state = stateFromAction(action)
  const surfaceId = action.surfaceId ?? `composer-${crypto.randomUUID()}`

  if (action.name === 'composer_add_dimension' || action.name === 'composer_remove_dimension') {
    const dimension = action.context?.dimension
    if (typeof dimension !== 'string' || !DIMENSIONS.includes(dimension as ResearchDimension)) {
      emit({ type: 'error', error: '未知研究模块' })
      return
    }
    const target = dimension as ResearchDimension
    state.selected = action.name === 'composer_add_dimension'
      ? [...new Set([...state.selected, target])]
      : state.selected.filter((item) => item !== target)
  }

  if (action.name === 'composer_add_comparison') {
    state.comparison = typeof action.context?.comparisonTarget === 'string'
      ? action.context.comparisonTarget
      : 'AMD'
  }

  if (action.name === 'composer_remove_comparison') {
    state.comparison = ''
  }

  if (action.name === 'composer_start') {
    if (state.selected.length === 0) {
      emit({ type: 'error', error: '请至少加入一个研究模块' })
      return
    }
    await runAutonomousResearch(
      researchRequest(state),
      emit,
      state.selected,
      crypto.randomUUID(),
      surfaceId,
    )
    return
  }

  emit({ type: 'status', status: '正在更新研究方案…' })
  for (const a2uiMessage of composerMessages(state, surfaceId, false)) emit({ type: 'message', message: a2uiMessage })
  emit({ type: 'task_state', state: 'WAITING_FOR_USER', taskId: surfaceId })
}
