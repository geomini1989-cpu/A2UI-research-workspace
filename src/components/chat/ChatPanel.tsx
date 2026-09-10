import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { A2UIRenderer } from '@/components/a2ui/A2UIRenderer'
import { AgentProcess } from './AgentProcess'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiJson } from '@/services/agentService'

const STARTERS = [
  { title: '公司研究', prompt: '全面分析 NVIDIA，包含财务、市场和技术，并总结关键风险' },
  { title: '财报比较', prompt: '比较 NVIDIA 和 AMD 的财务表现' },
  { title: '自定义研究', prompt: '打开 NVIDIA 研究方案，我想自己选择研究方向' },
  { title: '保存研究任务', prompt: '帮我创建一个 NVIDIA 深度研究任务，重点研究财务和技术，暂时不要执行' },
]
export function ChatPanel() {
  const { turns, isGenerating, activeTurnId, ready, needsAccessKey, sourceLabel, error, initialize, sendMessage, retry, stop } = useWorkspaceStore()
  const [accessKey, setAccessKey] = useState('')
  const [jobs, setJobs] = useState<Array<{ id: string; company: string; status: string }>>([])
  const [jobError, setJobError] = useState<string | null>(null)
  useEffect(() => { void initialize() }, [initialize])
  if (!ready) return <p role="status">正在恢复工作台…</p>
  if (needsAccessKey) return <form className="workspace-access" onSubmit={event => { event.preventDefault(); void initialize(accessKey) }}>
    <h2>进入研究工作台</h2>
    <label htmlFor="access-key">访问口令</label>
    <Input id="access-key" type="password" value={accessKey} onChange={event => setAccessKey(event.target.value)} autoComplete="current-password" required />
    {error && <p role="alert">{error}</p>}
    <Button type="submit">进入工作台</Button>
  </form>
  return (
    <div className="flex h-full flex-col">
      <div className="conversation-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="conversation-thread">
          {error && <div role="alert">{error}<Button variant="outline" onClick={() => void initialize()}>重新连接</Button></div>}
          <div className="research-toolbar">
            <span>{sourceLabel}</span>
            <Button variant="outline" size="sm" onClick={() => {
              setJobError(null)
              void apiJson<typeof jobs>('/api/jobs').then(setJobs).catch(error => setJobError(error.message))
            }}>我的研究任务</Button>
          </div>
          {jobError && <p role="alert">{jobError}</p>}
          {jobs.length > 0 && <nav className="research-jobs" aria-label="已保存的研究任务">{jobs.map(job =>
            <button key={job.id} disabled={isGenerating} onClick={() => void sendMessage('打开研究任务 ' + job.id)}>{job.company} · {job.status} · {job.id}</button>,
          )}</nav>}
          {turns.length === 0 && <section className="conversation-welcome" aria-labelledby="welcome-title">
            <div className="conversation-welcome__eyebrow">AI Research Workspace</div>
            <h2 id="welcome-title">从一个问题，得到一份可继续推进的研究</h2>
            <p className="conversation-welcome__copy">输入公司名称或股票代码，查看指标、图表与证据，也可以先保存研究任务。</p>
            <p className="conversation-welcome__notice">数据以标注的来源和报告期为准。未提供的信息会明确留空。</p>
            <div className="conversation-starters">{STARTERS.map(starter =>
              <button type="button" key={starter.title} onClick={() => void sendMessage(starter.prompt)}><strong>{starter.title}</strong><span>开始研究 →</span></button>,
            )}</div>
          </section>}
          {turns.map(turn => <section key={turn.id} className="research-turn" aria-label="研究对话">
            <MessageList messages={[{ id: turn.id, role: 'user', content: turn.prompt, createdAt: 0 }]} />
            <div className="assistant-generated">
              {turn.answer && <p className="conversation-message--assistant">{turn.answer}</p>}
              <A2UIRenderer turn={turn} generating={isGenerating && activeTurnId === turn.id} onRetry={() => retry(turn.id)} />
              <MessageList messages={turn.followUps} />
              <AgentProcess activities={turn.activities} taskStatus={turn.taskStatus} status={turn.status} />
            </div>
          </section>)}
        </div>
      </div>
      {isGenerating && <div className="research-stop"><Button variant="outline" size="sm" onClick={stop}>停止研究</Button></div>}
      <ChatInput disabled={isGenerating} onSend={sendMessage} />
    </div>
  )
}
