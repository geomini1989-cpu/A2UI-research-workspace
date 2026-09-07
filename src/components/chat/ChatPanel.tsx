import * as React from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { A2UIRenderer } from '@/components/a2ui/A2UIRenderer'
import { AgentProcess } from './AgentProcess'

const STARTERS = [
  {
    label: '公司研究',
    title: '研究 NVIDIA',
    description: '梳理财务表现、市场变化、技术竞争力与关键风险，并支持继续追问。',
    prompt: '全面分析 NVIDIA，包含财务、市场和技术，并总结关键风险',
  },
  {
    label: '对比分析',
    title: '比较 NVIDIA 与 AMD',
    description: '对齐关键指标、竞争优势与风险差异，快速找到值得继续研究的问题。',
    prompt: '全面比较 NVIDIA 和 AMD，包含财务、市场、技术和关键风险',
  },
  {
    label: '自定义研究',
    title: '自己选择研究方向',
    description: '像选择研究菜单一样添加或移除财务、市场、技术与对比项，确认范围后再开始研究。',
    prompt: '打开 NVIDIA 研究方案，我想自己选择研究方向',
  },
  {
    label: '研究任务',
    title: '创建可保存的研究任务',
    description: '选择研究范围和深度，保存草稿，确认后再执行，适合需要持续推进的研究。',
    prompt: '帮我创建一个 NVIDIA 深度研究任务，重点研究财务和技术，暂时不要执行',
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
              <div className="conversation-welcome__eyebrow">AI Research Workspace</div>
              <h2 id="welcome-title">从一个问题，得到一份可继续推进的研究</h2>
              <p className="conversation-welcome__copy">
                输入公司、对比对象或研究目标。系统会自动组织财务、市场和技术研究，并把结果整理成可交互的指标、图表和结论。
              </p>
              <p className="conversation-welcome__notice">当前市场与财务数据为演示研究数据，用于体验研究流程与交互方式。</p>
              <div className="conversation-starters" aria-label="开始研究">
                {STARTERS.map((starter) => (
                  <button type="button" key={starter.prompt} onClick={() => sendMessage(starter.prompt)}>
                    <span className="conversation-starter__label">{starter.label}</span>
                    <strong>{starter.title}</strong>
                    <span className="conversation-starter__description">{starter.description}</span>
                    <span className="conversation-starter__action">开始研究 →</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <MessageList messages={messages} />
          {hasResponse && (
            <section className="assistant-generated" aria-label="研究结果">
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
