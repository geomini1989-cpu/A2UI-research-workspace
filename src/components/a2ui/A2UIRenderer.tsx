import type { ResearchTurn } from '@/stores/workspaceStore'
import { A2UISurface } from './A2UISurface'

export function A2UIRenderer({ turn, generating, onRetry }: { turn: ResearchTurn; generating: boolean; onRetry: () => void }) {
  return (
    <div className="genui-root" data-mode={turn.mode} data-streaming={generating}>
      {turn.error && <div className="genui-error" role="alert"><p>{turn.error}</p><button className="genui-retry" onClick={onRetry} disabled={generating}>重试</button></div>}
      {turn.unavailable.map(item => <p key={item.agentName} className="research-limitation">{item.agentName} 暂不可用：{item.reason}。本次结果未包含该部分。</p>)}
      {turn.surfaceIds.map(surfaceId => <A2UISurface key={surfaceId} surfaceId={surfaceId} />)}
      {generating && <p role="status" className="genui-loading__label">{turn.status}</p>}
      {turn.evidence.length > 0 && <details className="research-sources">
        <summary>数据来源与依据（{turn.evidence.length}）</summary>
        <ul>{turn.evidence.map(item => <li key={item.id}>
          {item.ref?.startsWith('https://')
            ? <a href={item.ref} target="_blank" rel="noreferrer">{item.sourceName}</a>
            : <span>{item.sourceName}</span>}
          {item.period && <span> · 报告期 {item.period}</span>}
          {item.retrievedAt && <span> · 获取于 {item.retrievedAt.slice(0, 10)}</span>}
          <p>{item.description}</p>
        </li>)}</ul>
      </details>}
    </div>
  )
}
