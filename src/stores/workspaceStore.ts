import { create } from 'zustand'

import { streamChat, streamAction } from '@/services/agentService'
import { clearSurfaces, processA2uiMessages, setActionHandler } from '@/components/a2ui/a2uiEngine'
import type { WorkspaceState } from '@/types/chat'
import { isSemanticAction, type AgentAction, type AgentStreamEvent } from '@/types/agent'
import { inferPresentationMode } from '@/components/a2ui/presentation'

let seq = 0
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${seq++}`

interface WorkspaceStore extends WorkspaceState {
  surfaceVersion: number
  sendMessage: (text: string) => Promise<void>
  handleAction: (action: AgentAction) => Promise<void>
  backDrillDown: () => void
  collapseDrillDown: (surfaceId: string) => void
  reopenDrillDown: (surfaceId: string) => void
  retryDrillDown: () => void
  clear: () => void
}

function createdSurfaceId(event: AgentStreamEvent): string | null {
  if (event.type !== 'message' || !event.message || typeof event.message !== 'object') return null
  const create = (event.message as { createSurface?: { surfaceId?: unknown } }).createSurface
  return typeof create?.surfaceId === 'string' ? create.surfaceId : null
}

function semanticQuestion(action: AgentAction): string {
  const c = action.context
  const subject = String(c.company ?? c.subject ?? '当前内容')
  switch (action.name) {
    case 'explore_metric': return `${subject} 的 ${String(c.metric ?? '这个指标')} 最值得关注什么？`
    case 'explore_company': return `${String(c.company ?? subject)} 最值得关注什么？`
    case 'explore_risk': return `${subject} 的 ${String(c.risk ?? '这个风险')} 会如何影响判断？`
    case 'explore_segment': return `${subject} 的 ${String(c.segment ?? '这个业务')} 关键变化是什么？`
    case 'explore_event': return `这个事件对 ${subject} 的核心影响是什么？`
    case 'explore_period': return `${subject} 在 ${String(c.period ?? '这个期间')} 为什么出现当前表现？`
    case 'compare_item': return `围绕 ${String(c.comparisonTarget ?? '这个比较项')}，关键结论是什么？`
    case 'view_source': return `这条结论的数据来源和局限是什么？`
    case 'change_time_range': return `换到 ${String(c.timeRange ?? '这个时间范围')} 后，趋势判断有什么变化？`
    default: return `补充一下 ${subject} 最关键的细节。`
  }
}

function handleStreamEvent(
  get: () => WorkspaceStore,
  set: (partial: Partial<WorkspaceStore>) => void,
  event: AgentStreamEvent,
  localDrillFailure = false,
) {
  switch (event.type) {
    case 'status':
      set({ agentStatus: event.status })
      break
    case 'activity':
      set({ activities: [...get().activities, { id: nextId('activity'), actor: event.actor, activity: event.activity, detail: event.detail, createdAt: Date.now() }] })
      break
    case 'task_state':
      set({
        taskStatus: event.state,
        activeTaskId: event.taskId,
        activeInteractionId: event.state === 'COMPLETED' || event.state === 'FAILED' || event.state === 'CANCELLED'
          ? null
          : event.interactionId ?? get().activeInteractionId,
        isGenerating: event.state === 'RUNNING',
        agentStatus: event.state === 'WAITING_FOR_USER' ? '等待你的输入' : event.state === 'CANCELLED' ? '已取消' : get().agentStatus,
      })
      break
    case 'agent_text': {
      // Accumulate agent replies into the most recent agent message.
      const messages = get().messages
      const text = event.text === '已生成研究视图（Demo 数据）' ? '研究结果已整理如下。' : event.text
      const last = messages[messages.length - 1]
      if (last && last.role === 'agent') {
        set({
          messages: [
            ...messages.slice(0, -1),
            { ...last, content: last.content + text },
          ],
        })
      } else {
        set({
          messages: [
            ...messages,
            {
              id: nextId('agent'),
              role: 'agent',
              content: text,
              createdAt: Date.now(),
              kind: last?.kind === 'followup' ? 'followup' : undefined,
            },
          ],
        })
      }
      break
    }
    case 'message':
      processA2uiMessages([event.message])
      set({ surfaceVersion: get().surfaceVersion + 1, rootSurfaceId: get().rootSurfaceId ?? createdSurfaceId(event) })
      break
    case 'done':
      set({ isGenerating: false, agentStatus: get().taskStatus === 'CANCELLED' ? '已取消' : '完成' })
      break
    case 'error':
      set({
        error: localDrillFailure ? null : event.error,
        isGenerating: false,
        agentStatus: get().taskStatus === 'WAITING_FOR_USER' ? '输入无效，请修正' : '出错',
        taskStatus: get().taskStatus === 'WAITING_FOR_USER' ? 'WAITING_FOR_USER' : 'FAILED',
      })
      break
  }
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  setActionHandler((action) => {
    void get().handleAction(action)
  })

  return {
    messages: [],
    isGenerating: false,
    activeSurfaceId: null,
    agentStatus: '',
    activities: [],
    taskStatus: 'COMPLETED',
    activeTaskId: null,
    activeInteractionId: null,
    rootSurfaceId: null,
    surfaceHistory: [],
    pendingDrill: null,
    drillError: null,
    error: null,
    surfaceVersion: 0,
    presentationMode: 'standard',

    sendMessage: async (text) => {
      const trimmed = text.trim()
      if (!trimmed || get().isGenerating) return

      clearSurfaces()
      set({
        messages: [
          ...get().messages,
          { id: nextId('user'), role: 'user', content: trimmed, createdAt: Date.now() },
        ],
        isGenerating: true,
        agentStatus: '正在分析…',
        error: null,
        activities: [],
        taskStatus: 'RUNNING',
        activeTaskId: null,
        activeInteractionId: null,
        surfaceVersion: 0,
        rootSurfaceId: null,
        surfaceHistory: [],
        pendingDrill: null,
        drillError: null,
        presentationMode: inferPresentationMode(trimmed),
      })

      try {
        await streamChat(trimmed, (event) => handleStreamEvent(get, set, event))
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : '请求失败，请稍后再试',
          isGenerating: false,
          agentStatus: '出错',
        })
      }
    },

    handleAction: async (action) => {
      if (get().isGenerating) return
      const semantic = isSemanticAction(action.name)
      const filtering = action.name === 'apply_filters'
      const qa = semantic && !filtering
      // Add/remove actions mutate the Composer in place. composer_start is a
      // transition to a new research surface, so the first generated surface
      // replaces the Composer instead of sharing its component graph.
      const inlineComposer = action.name.startsWith('composer_') && action.name !== 'composer_start'
      const question = qa ? semanticQuestion(action) : null
      const currentMessages = get().messages
      set({
        messages: question
          ? [...currentMessages, { id: nextId('user'), role: 'user', content: question, createdAt: Date.now(), kind: 'followup' }]
          : currentMessages,
        isGenerating: true,
        agentStatus: filtering ? '正在更新分析…' : qa ? '正在回答追问…' : '正在执行操作…',
        error: null,
        activities: [],
        pendingDrill: null,
        drillError: null,
      })
      let surfaceCleared = false
      try {
        await streamAction(
          {
            name: action.name,
            surfaceId: action.surfaceId,
            sourceComponentId: action.sourceComponentId,
            context: action.context,
          },
          (event) => {
            // Preserve the current generated research surface for semantic Q&A.
            // Only non-semantic actions that genuinely navigate to another flow
            // replace the current surface.
            if (!semantic && !inlineComposer && event.type === 'message' && !surfaceCleared) {
              clearSurfaces()
              set({ rootSurfaceId: null, surfaceHistory: [] })
              surfaceCleared = true
            }
            handleStreamEvent(get, set, event)
          },
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : '操作失败，请稍后再试'
        set({
          error: message,
          drillError: null,
          pendingDrill: null,
          isGenerating: false,
          agentStatus: '出错',
        })
      }
    },

    backDrillDown: () => {
      const history = get().surfaceHistory
      const current = [...history].filter((item) => !item.collapsed).sort((a, b) => b.depth - a.depth)[0]
      if (current) set({ surfaceHistory: history.map((item) => item.surfaceId === current.surfaceId ? { ...item, collapsed: true } : item), drillError: null })
    },

    collapseDrillDown: (surfaceId) => set({ surfaceHistory: get().surfaceHistory.map((item) => item.surfaceId === surfaceId ? { ...item, collapsed: true } : item) }),
    reopenDrillDown: (surfaceId) => set({ surfaceHistory: get().surfaceHistory.map((item) => item.surfaceId === surfaceId ? { ...item, collapsed: false } : item) }),
    retryDrillDown: () => {
      const action = get().drillError?.action
      if (action) void get().handleAction(action)
    },

    clear: () => {
      clearSurfaces()
      set({ messages: [], isGenerating: false, activeSurfaceId: null, agentStatus: '', error: null, activities: [], taskStatus: 'COMPLETED', activeTaskId: null, activeInteractionId: null, surfaceVersion: 0, presentationMode: 'standard', rootSurfaceId: null, surfaceHistory: [], pendingDrill: null, drillError: null })
    },
  }
})
