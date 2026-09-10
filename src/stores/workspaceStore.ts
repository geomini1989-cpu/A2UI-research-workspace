import { create } from 'zustand'
import { apiJson, streamChat, streamAction } from '@/services/agentService'
import { clearSurfaces, processA2uiMessages, setActionHandler } from '@/components/a2ui/a2uiEngine'
import type { AgentAction, AgentStreamEvent } from '@/types/agent'
import { isSemanticAction } from '@/types/agent'
import type { ChatMessage, AgentActivity, TaskStatus } from '@/types/chat'
import type { ResearchEvidence } from '../../server/orchestration/types.js'
import { inferPresentationMode } from '@/components/a2ui/presentation'

export interface ResearchTurn {
  id: string
  prompt: string
  answer: string
  followUps: ChatMessage[]
  surfaceIds: string[]
  unavailable: { agentName: string; reason: string }[]
  evidence: ResearchEvidence[]
  activities: AgentActivity[]
  status: string
  taskStatus: TaskStatus
  error: string | null
  mode: 'compact' | 'standard' | 'rich'
  lastAction?: AgentAction
}
interface HistoryRun {
  id: string
  request: { kind: 'chat' | 'action'; payload: Record<string, unknown> }
  events: AgentStreamEvent[]
  running: boolean
}
interface WorkspaceStore {
  turns: ResearchTurn[]
  isGenerating: boolean
  activeTurnId: string | null
  ready: boolean
  needsAccessKey: boolean
  error: string | null
  sourceLabel: string
  initialize: (accessKey?: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  handleAction: (action: AgentAction) => Promise<void>
  retry: (id: string) => void
  stop: () => void
  clear: () => Promise<void>
}
let controller: AbortController | undefined
let initialization: Promise<void> | undefined
const newTurn = (id: string, prompt: string): ResearchTurn => ({
  id, prompt, answer: '', followUps: [], surfaceIds: [], evidence: [], unavailable: [], activities: [], status: '正在分析…',
  taskStatus: 'RUNNING', error: null, mode: inferPresentationMode(prompt),
})
function question(action: AgentAction) {
  const c = action.context
  return String(c.company ?? c.subject ?? '当前研究') + '：进一步了解' + String(c.metric ?? c.risk ?? c.segment ?? c.period ?? '这项内容')
}
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  const patch = (id: string, update: Partial<ResearchTurn>) =>
    set({ turns: get().turns.map(turn => turn.id === id ? { ...turn, ...update } : turn) })
  const current = (id: string) => get().turns.find(turn => turn.id === id)!
  const isQa = (action?: AgentAction) => Boolean(action && isSemanticAction(action.name) && action.name !== 'apply_filters')
  const startAction = (id: string, action: AgentAction) => {
    const turn = current(id)
    patch(id, {
      error: null, lastAction: action, activities: [], status: '正在处理…', taskStatus: 'RUNNING',
      followUps: isQa(action) ? [...turn.followUps,
        { id: crypto.randomUUID(), role: 'user', content: question(action), createdAt: Date.now() },
        { id: crypto.randomUUID(), role: 'agent', content: '', createdAt: Date.now() },
      ] : turn.followUps,
    })
  }
  const handleEvent = (id: string, event: AgentStreamEvent, qa: boolean) => {
    const turn = current(id)
    switch (event.type) {
      case 'status': patch(id, { status: event.status }); break
      case 'activity':
        patch(id, { activities: [...turn.activities, { id: crypto.randomUUID(), actor: event.actor, activity: event.activity, detail: event.detail, createdAt: Date.now() }] })
        break
      case 'task_state':
        patch(id, { taskStatus: event.state, status: event.state === 'WAITING_FOR_USER' ? '等待你的输入' : turn.status })
        break
      case 'message': {
        processA2uiMessages([event.message])
        const create = (event.message as { createSurface?: { surfaceId: string } }).createSurface
        if (create && !turn.surfaceIds.includes(create.surfaceId)) patch(id, { surfaceIds: [...turn.surfaceIds, create.surfaceId] })
        break
      }
      case 'agent_text':
        if (qa) {
          patch(id, { followUps: turn.followUps.map((message, index) => index === turn.followUps.length - 1 ? { ...message, content: message.content + event.text } : message) })
        } else patch(id, { answer: turn.answer + event.text })
        break
      case 'evidence':
        patch(id, { unavailable: event.unavailable ?? turn.unavailable, evidence: [...new Map([...turn.evidence, ...event.evidence].map(item => [item.id, item])).values()] })
        break
      case 'error': patch(id, { error: event.error, taskStatus: turn.taskStatus === 'WAITING_FOR_USER' ? turn.taskStatus : 'FAILED', status: '研究未完成' }); break
      case 'done': patch(id, { status: '完成' }); break
    }
  }
  const execute = async (id: string, action?: AgentAction) => {
    controller = new AbortController()
    const signal = controller.signal
    set({ isGenerating: true, activeTurnId: id })
    try {
      const onEvent = (event: AgentStreamEvent) => handleEvent(id, event, isQa(action))
      if (action) await streamAction(action, onEvent, signal)
      else await streamChat(current(id).prompt, onEvent, signal)
    } catch (error) {
      patch(id, signal.aborted
        ? { status: '已停止', taskStatus: 'CANCELLED', error: null }
        : { status: '研究未完成', taskStatus: 'FAILED', error: (error as Error).message })
    } finally {
      controller = undefined
      set({ isGenerating: false, activeTurnId: null })
    }
  }
  setActionHandler(action => { void get().handleAction(action) })
  return {
    turns: [], isGenerating: false, activeTurnId: null, ready: false, needsAccessKey: false, error: null, sourceLabel: '',
    initialize: accessKey => initialization ??= (async () => {
      try {
        const session = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey }) })
        if (session.status === 401) { set({ needsAccessKey: true, ready: true, error: accessKey ? '访问口令不正确' : null }); return }
        if (!session.ok) throw new Error('无法连接工作台')
        const [history, health] = await Promise.all([
          apiJson<HistoryRun[]>('/api/history'),
          apiJson<{ researchProvider: { sourceLabel: string } }>('/api/health'),
        ])
        clearSurfaces()
        set({ turns: [], needsAccessKey: false, error: null, sourceLabel: health.researchProvider.sourceLabel })
        for (const run of history) {
          const payload = run.request.payload
          let id = run.id
          let action: AgentAction | undefined
          if (run.request.kind === 'chat') {
            set({ turns: [...get().turns, newTurn(id, String(payload.message))] })
          } else {
            action = payload as unknown as AgentAction
            const previous = [...get().turns].reverse().find(turn => turn.surfaceIds.includes(action!.surfaceId))
            if (previous) id = previous.id
            else set({ turns: [...get().turns, newTurn(id, '继续研究')] })
            startAction(id, action)
          }
          for (const event of run.events) handleEvent(id, event, isQa(action))
          if (run.running) patch(id, { taskStatus: 'FAILED', status: '研究连接已断开', error: '上一研究尚未结束，请稍后打开对应研究任务或重试。' })
        }
        set({ ready: true })
      } catch (error) { set({ ready: true, error: (error as Error).message }) }
    })().finally(() => { initialization = undefined }),
    sendMessage: async text => {
      if (!text.trim() || get().isGenerating) return
      const id = crypto.randomUUID()
      set({ turns: [...get().turns, newTurn(id, text.trim())] })
      await execute(id)
    },
    handleAction: async action => {
      if (get().isGenerating) return
      const turn = [...get().turns].reverse().find(item => item.surfaceIds.includes(action.surfaceId))
      if (!turn) return
      startAction(turn.id, action)
      await execute(turn.id, action)
    },
    retry: id => {
      const turn = current(id)
      if (turn.lastAction) void get().handleAction(turn.lastAction)
      else void get().sendMessage(turn.prompt)
    },
    stop: () => controller?.abort(),
    clear: async () => {
      if (get().isGenerating) return
      try {
        await apiJson('/api/history', { method: 'DELETE' })
        clearSurfaces()
        set({ turns: [], error: null })
      } catch (error) { set({ error: (error as Error).message }) }
    },
  }
})
