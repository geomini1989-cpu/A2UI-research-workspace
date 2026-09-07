import * as React from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { A2UIRenderer } from '@/components/a2ui/A2UIRenderer'
import { AgentProcess } from './AgentProcess'

const STARTERS = [
  {
    label: '实时组合',
    title: '打开 NVIDIA 研究组合器',
    description: '像点单一样逐项加入财务、市场和技术模块，界面会在同一 A2UI Surface 中实时重组。',
    prompt: '帮我打开 NVIDIA 研究组合器，我想自己逐项添加研究模块',
  },
  {
    label: '动态对比',
    title: '配置 NVIDIA vs AMD',
    description: '先进入对比模式，再自由增减研究模块，观察 UI 和 Agent 路由一起变化。',
    prompt: '帮我打开 NVIDIA 和 AMD 的对比研究组合器',
  },
  {
    label: '业务闭环',
    title: '创建可保存的研究任务',
    description: '演示草稿保存、提交和执行，把 Generative UI 接到真实业务状态上。',
    prompt: '帮我创建一个 NVIDIA 深度研究任务，先保存草稿再提交',
  },
]

export function ChatPanel() {
  const messages = useWorkspaceStore((s) => s.messages)
  const isGenerating = useWorkspaceStore((s) => s.isGenerating)
  const agentStatus = useWorkspaceStore((s) => s.agentStatus)
  const sendMessage = useWorkspaceStore((s) => s.sendMessage)
  const activities = useWorkspaceStore((s) => s.activities)
  const taskStatus = useWorkspaceStore((s) => s.taskStatus)
  const surfaceVersion = useWorkspaceStore((s) => s.surfaceVersion)
  const error = useWorkspaceStore((s) => s.error)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const latest = messages[messages.length - 1]
    if (latest?.role !== 'user') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({ top: element.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [messages])

  const hasResponse = isGenerating || taskStatus === 'WAITING_FOR_USER' || surfaceVersion > 0 || Boolean(error)

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="conversation-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="conversation-thread">
          {messages.length === 0 && (
            <section className="conversation-welcome" aria-labelledby="welcome-title">
              <div className="conversation-welcome__eyebrow">A2UI · Generative UI · Multi-Agent</div>
              <h2 id="welcome-title">把研究像点单一样组合起来</h2>
              <p className="conversation-welcome__copy">
                先从一个演示入口开始。研究模块、对比对象和执行 Agent 会随着你的选择实时变化。
              </p>
              <div className="conversation-starters" aria-label="推荐演示">
                {STARTERS.map((starter) => (
                  <button type="button" key={starter.prompt} onClick={() => sendMessage(starter.prompt)}>
                    <span className="conversation-starter__label">{starter.label}</span>
                    <strong>{starter.title}</strong>
                    <span className="conversation-starter__description">{starter.description}</span>
                    <span className="conversation-starter__action">开始演示 →</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <MessageList messages={messages} />
          {hasResponse && (
            <section className="assistant-generated" aria-label="Generated research response">
              <A2UIRenderer />
              <AgentProcess activities={activities} taskStatus={taskStatus} status={agentStatus} />
            </section>
          )}
        </div>
      </div>
      <ChatInput disabled={isGenerating} onSend={sendMessage} />
    </div>
  )
}
