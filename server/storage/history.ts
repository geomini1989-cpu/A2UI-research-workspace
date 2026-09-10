import { randomUUID } from 'node:crypto'
import { db } from './database.js'
import { ownerId } from '../runtime/context.js'
import type { AgentEvent } from '../agent/researchAgent.js'

export interface RunRequest { kind: 'chat' | 'action'; payload: Record<string, unknown> }
export function startRun(request: RunRequest) {
  const id = randomUUID()
  db.prepare('INSERT INTO runs(id, owner_id, request, started_at) VALUES (?, ?, ?, ?)')
    .run(id, ownerId(), JSON.stringify(request), new Date().toISOString())
  return id
}
export function appendEvent(runId: string, event: AgentEvent) {
  db.prepare('INSERT INTO events(run_id, body) VALUES (?, ?)').run(runId, JSON.stringify(event))
  if (event.type === 'message' && 'createSurface' in event.message) {
    db.prepare('INSERT INTO state VALUES (?, ?, ?, ?) ON CONFLICT(namespace,id,owner_id) DO NOTHING')
      .run('surface', event.message.createSurface.surfaceId, ownerId(), '{}')
  }
}
export function finishRun(id: string) {
  db.prepare('UPDATE runs SET finished_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}
export function getHistory() {
  const events = db.prepare('SELECT body FROM events WHERE run_id = ? ORDER BY sequence')
  return db.prepare('SELECT * FROM runs WHERE owner_id = ? ORDER BY started_at').all(ownerId()).map(row => ({
    id: row.id, request: JSON.parse(row.request as string) as RunRequest, running: row.finished_at === null,
    events: events.all(row.id as string).map(event => JSON.parse(event.body as string) as AgentEvent),
  }))
}
export function clearHistory() {
  db.prepare('DELETE FROM runs WHERE owner_id = ?').run(ownerId())
  db.prepare('DELETE FROM state WHERE owner_id = ?').run(ownerId())
}
