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
            { id: nextId('agent'), role: 'agent', content: text, createdAt: Date.now() },
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
      const drill = semantic && !filtering
      // Add/remove actions mutate the Composer in place. composer_start is a
      // transition to a new research surface, so the first generated surface
      // replaces the Composer instead of sharing its component graph.
      const inlineComposer = action.name.startsWith('composer_') && action.name !== 'composer_start'
      const target = String(action.context.metric ?? action.context.segment ?? action.context.risk ?? action.context.period ?? action.context.company ?? '详情')
      set({
        isGenerating: true,
        agentStatus: filtering ? '正在更新分析…' : drill ? `正在深入分析 ${target}…` : '正在执行操作…',
        error: null,
        activities: [],
        pendingDrill: drill ? { action, startedAt: Date.now() } : null,
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
            const drillSurfaceId = drill ? createdSurfaceId(event) : null
            if (drill && drillSurfaceId) {
              const parentSurfaceId = action.surfaceId
              const parent = get().surfaceHistory.find((item) => item.surfaceId === parentSurfaceId)
              const depth = parent ? parent.depth + 1 : 1
              set({
                surfaceHistory: [
                  // A parent has one active child at a time. Older branches remain
                  // cached and can be reopened without another agent call.
                  ...get().surfaceHistory
                    .filter((item) => item.surfaceId !== drillSurfaceId)
                    .map((item) => item.parentSurfaceId === parentSurfaceId ? { ...item, collapsed: true } : item),
                  { surfaceId: drillSurfaceId, parentSurfaceId, depth, action, collapsed: false },
                ],
                pendingDrill: null,
              })
            }
            // Preserve the current interaction form when backend validation fails.
            // Replace it only after the server has actually produced a new surface.
            if (!semantic && !inlineComposer && event.type === 'message' && !surfaceCleared) {
              clearSurfaces()
              set({ rootSurfaceId: null, surfaceHistory: [] })
              surfaceCleared = true
            }
            if (drill && event.type === 'error') set({ drillError: { action, error: event.error }, pendingDrill: null })
            handleStreamEvent(get, set, event, drill)
          },
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : '操作失败，请稍后再试'
        set({
          error: drill ? null : message,
          drillError: drill ? { action, error: message } : null,
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
