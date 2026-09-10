import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ownerId } from '../runtime/context.js'

const directory = process.env.DATA_DIR ?? join(process.cwd(), '.data')
if (!process.env.VITEST) mkdirSync(directory, { recursive: true })
export const db = new DatabaseSync(process.env.VITEST ? ':memory:' : join(directory, 'research.sqlite'))
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY COLLATE NOCASE, owner_id TEXT NOT NULL,
    status TEXT NOT NULL, body TEXT NOT NULL, result TEXT
  );
  CREATE TABLE IF NOT EXISTS state (
    namespace TEXT NOT NULL, id TEXT NOT NULL, owner_id TEXT NOT NULL, body TEXT NOT NULL,
    PRIMARY KEY(namespace, id, owner_id)
  );
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request TEXT NOT NULL,
    started_at TEXT NOT NULL, finished_at TEXT
  );
  CREATE INDEX IF NOT EXISTS runs_owner ON runs(owner_id, started_at);
  CREATE TABLE IF NOT EXISTS events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    body TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_run ON events(run_id, sequence);
  CREATE TABLE IF NOT EXISTS daily_usage (day TEXT PRIMARY KEY, count INTEGER NOT NULL);
`)

// 旧草稿仅迁移到本机身份，保留原文件。 / Import legacy drafts into the local identity, preserving the source file.
const legacyPath = join(directory, 'research-jobs.json')
if (!process.env.VITEST && existsSync(legacyPath)) {
  const insert = db.prepare('INSERT OR IGNORE INTO jobs(id, owner_id, status, body) VALUES (?, ?, ?, ?)')
  for (const job of JSON.parse(readFileSync(legacyPath, 'utf8'))) insert.run(job.id, 'local', job.status, JSON.stringify(job))
}

export function readState<T>(namespace: string, id: string): T | undefined {
  const row = db.prepare('SELECT body FROM state WHERE namespace = ? AND id = ? AND owner_id = ?').get(namespace, id, ownerId())
  return row ? JSON.parse(row.body as string) as T : undefined
}
export function writeState(namespace: string, id: string, body: unknown) {
  db.prepare('INSERT INTO state VALUES (?, ?, ?, ?) ON CONFLICT(namespace,id,owner_id) DO UPDATE SET body=excluded.body')
    .run(namespace, id, ownerId(), JSON.stringify(body))
}
export function listState<T>(namespace: string): T[] {
  return db.prepare('SELECT body FROM state WHERE namespace = ? AND owner_id = ?').all(namespace, ownerId()).map(row => JSON.parse(row.body as string) as T)
}
export function clearState(namespace: string) {
  db.prepare('DELETE FROM state WHERE namespace = ? AND owner_id = ?').run(namespace, ownerId())
}

// 单进程重启后标记未完成任务，允许显式重试。 / Mark interrupted single-process runs as failed on restart.
export function recoverInterruptedRuns() {
  const event = JSON.stringify({ type: 'error', error: '服务已重启，研究未完成，请重试。' })
  db.prepare('INSERT INTO events(run_id, body) SELECT id, ? FROM runs WHERE finished_at IS NULL').run(event)
  db.prepare('UPDATE runs SET finished_at = ? WHERE finished_at IS NULL').run(new Date().toISOString())
  db.prepare("UPDATE jobs SET status='FAILED', body=json_set(body, '$.status', 'FAILED', '$.error', '服务重启，请重试研究') WHERE status='RUNNING'").run()
}
