import * as React from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { A2UIRenderer } from '@/components/a2ui/A2UIRenderer'
import { AgentProcess } from './AgentProcess'

const STARTERS = ['分析 NVIDIA', '分析 NVIDIA 的估值', '比较 NVIDIA 和 AMD']

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
              <p>AI 研究助手</p>
              <h2 id="welcome-title">想了解什么？</h2>
              <div aria-label="推荐问题">
                {STARTERS.map((starter) => (
                  <button type="button" key={starter} onClick={() => sendMessage(starter)}>{starter}</button>
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
