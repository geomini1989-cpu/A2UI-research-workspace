import { useWorkspaceStore } from '@/stores/workspaceStore'
import { A2UISurface } from './A2UISurface'
function LoadingState({ status, mode }: { status: string; mode: 'compact' | 'standard' | 'rich' }) {
  return (
    <div className="genui-loading" data-mode={mode} role="status" aria-live="polite">
      <div className="genui-loading__label">
        <span aria-hidden="true" />
        {status || '正在分析…'}
      </div>
      <div className="genui-skeleton" aria-hidden="true">
        <i /><i /><i />
        {mode !== 'compact' && <b />}
      </div>
    </div>
  )
}

function ErrorState({ error, inline = false, onRetry }: { error: string; inline?: boolean; onRetry?: () => void }) {
  return (
    <div className={inline ? 'genui-inline-error' : 'genui-error'} role="alert">
      <strong>{inline ? '请检查输入内容' : '无法生成研究结果'}</strong>
      <p>{error}</p>
      {!inline && <small>请稍后重试，或调整研究范围后再次提交。</small>}
      {!inline && onRetry && <button type="button" className="genui-retry" onClick={onRetry}>重试</button>}
    </div>
  )
}

export function A2UIRenderer() {
  const error = useWorkspaceStore((s) => s.error)
  const isGenerating = useWorkspaceStore((s) => s.isGenerating)
  const agentStatus = useWorkspaceStore((s) => s.agentStatus)
  const rootSurfaceId = useWorkspaceStore((s) => s.rootSurfaceId)
  const surfaceHistory = useWorkspaceStore((s) => s.surfaceHistory)
  const pendingDrill = useWorkspaceStore((s) => s.pendingDrill)
  const drillError = useWorkspaceStore((s) => s.drillError)
  const backDrillDown = useWorkspaceStore((s) => s.backDrillDown)
  const collapseDrillDown = useWorkspaceStore((s) => s.collapseDrillDown)
  const reopenDrillDown = useWorkspaceStore((s) => s.reopenDrillDown)
  const retryDrillDown = useWorkspaceStore((s) => s.retryDrillDown)
  const mode = useWorkspaceStore((s) => s.presentationMode)
  const taskStatus = useWorkspaceStore((s) => s.taskStatus)
  const messages = useWorkspaceStore((s) => s.messages)
  const sendMessage = useWorkspaceStore((s) => s.sendMessage)
  useWorkspaceStore((s) => s.surfaceVersion)
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content

  if (!rootSurfaceId) {
    if (error) return <ErrorState error={error} onRetry={lastUserMessage ? () => sendMessage(lastUserMessage) : undefined} />
    return isGenerating ? <LoadingState status={agentStatus} mode={mode} /> : null
  }

  const visibleDetails = surfaceHistory
    .filter((entry) => !entry.collapsed)
    .filter((entry) => entry.parentSurfaceId === rootSurfaceId || surfaceHistory.some((parent) => parent.surfaceId === entry.parentSurfaceId && !parent.collapsed))
    .sort((a, b) => a.depth - b.depth)
  const collapsedDetails = surfaceHistory.filter((entry) => entry.collapsed)
  const label = String(pendingDrill?.action.context.metric ?? pendingDrill?.action.context.segment ?? pendingDrill?.action.context.risk ?? pendingDrill?.action.context.period ?? pendingDrill?.action.context.company ?? '详情')

  return (
    <div className="genui-root" data-mode={mode} data-streaming={isGenerating ? 'true' : 'false'}>
      {error && taskStatus === 'WAITING_FOR_USER' && <ErrorState error={error} inline />}
      {error && taskStatus !== 'WAITING_FOR_USER' && <ErrorState error={error} />}
      <A2UISurface surfaceId={rootSurfaceId} />
      {visibleDetails.map((entry) => (
        <section className="genui-drill" key={entry.surfaceId} aria-label="下钻研究结果">
          <div className="genui-drill__bar">
            <span>深入研究 · 第 {entry.depth} 层</span>
            <button type="button" onClick={() => collapseDrillDown(entry.surfaceId)}>收起</button>
            <button type="button" onClick={backDrillDown}>返回上一级</button>
          </div>
          <A2UISurface surfaceId={entry.surfaceId} />
        </section>
      ))}
      {collapsedDetails.length > 0 && (
        <div className="genui-drill__collapsed">
          {collapsedDetails.map((entry) => <button type="button" key={entry.surfaceId} onClick={() => reopenDrillDown(entry.surfaceId)}>重新展开第 {entry.depth} 层研究</button>)}
        </div>
      )}
      {pendingDrill && <div className="genui-drill-loading" role="status" aria-live="polite">正在深入分析 {label}…</div>}
      {drillError && <div className="genui-inline-error" role="alert"><strong>无法获取下钻详情</strong><p>{drillError.error}</p><button type="button" className="genui-retry" onClick={retryDrillDown}>重试</button></div>}
    </div>
  )
}
