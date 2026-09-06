/**
 * HTTP client for the Research Agent backend.
 *
 * Both /api/chat and /api/action respond with `application/x-ndjson` — one JSON
 * object per line. Each line is an AgentStreamEvent. We parse them and hand each
 * to `onEvent` so the store can progressively update the Chat + A2UI surface.
 */
import type { AgentStreamEvent } from '@/types/agent'

type EventHandler = (event: AgentStreamEvent) => void

async function consumeNdjson(res: Response, onEvent: EventHandler) {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API request failed (${res.status}): ${text}`)
  }
  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as AgentStreamEvent)
      } catch {
        // ignore malformed control lines; never crash the stream
      }
    }
  }
}

/** Send a natural-language research request and stream back A2UI events. */
export async function streamChat(message: string, onEvent: EventHandler) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  await consumeNdjson(res, onEvent)
}

/** Post an A2UI component action (e.g. a button click) and stream back events. */
export async function streamAction(
  payload: { name: string; surfaceId: string; sourceComponentId: string; context: Record<string, unknown> },
  onEvent: EventHandler,
) {
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  await consumeNdjson(res, onEvent)
}
