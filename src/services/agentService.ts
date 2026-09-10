import type { AgentStreamEvent } from '@/types/agent'

type EventHandler = (event: AgentStreamEvent) => void
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? '请求失败')
  return body as T
}
export async function consumeNdjson(res: Response, onEvent: EventHandler) {
  if (!res.ok) {
    const body = await res.json()
    throw new Error(body.error ?? '研究请求失败')
  }
  if (!res.body) throw new Error('研究响应为空')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminal = false
  const consume = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as AgentStreamEvent
    if (event.type === 'task_state') terminal = event.state !== 'RUNNING'
    if (event.type === 'done' || event.type === 'error') terminal = true
    onEvent(event)
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        consume(buffer.slice(0, idx))
        buffer = buffer.slice(idx + 1)
      }
    }
    consume(buffer + decoder.decode())
    if (!terminal) throw new Error('研究连接提前结束，请重试。')
  } finally {
    reader.releaseLock()
  }
}
async function stream(path: string, payload: unknown, onEvent: EventHandler, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(300_000)
  const res = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  await consumeNdjson(res, onEvent)
}
export function streamChat(message: string, onEvent: EventHandler, signal?: AbortSignal) {
  return stream('/api/chat', { message }, onEvent, signal)
}
export function streamAction(
  payload: { name: string; surfaceId: string; sourceComponentId: string; context: Record<string, unknown> },
  onEvent: EventHandler,
  signal?: AbortSignal,
) {
  return stream('/api/action', payload, onEvent, signal)
}
