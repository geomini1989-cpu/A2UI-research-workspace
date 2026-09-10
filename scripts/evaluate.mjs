import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

// 显式运行才调用模型；保留原始事件供人工复核。 / Model calls require explicit invocation; raw events support manual review.
const base = process.env.EVAL_BASE_URL ?? 'http://127.0.0.1:3001'
const session = await fetch(base + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey: process.env.APP_ACCESS_KEY }) })
if (!session.ok) throw new Error('Evaluation login failed: ' + session.status)
const cookie = session.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const health = await (await fetch(base + '/api/health')).json()
const cases = JSON.parse(await readFile(new URL('../eval/cases.json', import.meta.url), 'utf8'))
const results = []
for (const item of cases) for (const mode of ['single', 'multi']) {
  const start = performance.now()
  let firstContentMs = null
  const response = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message: item.prompt, mode }), signal: AbortSignal.timeout(300000) })
  if (!response.ok) throw new Error('Evaluation request failed: ' + await response.text())
  const events = []
  let pending = ''
  const accept = line => {
    if (!line.trim()) return
    const event = JSON.parse(line)
    events.push(event)
    const components = event.message?.updateComponents?.components ?? []
    if (firstContentMs === null && components.some(c => ['MetricCard', 'StockOverviewCard', 'ComparisonCard', 'ResearchSummaryCard', 'Chart', 'RiskBadge', 'InsightList'].includes(c.component))) firstContentMs = Math.round(performance.now() - start)
  }
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop()
    lines.forEach(accept)
  }
  accept(pending)
  const evidence = events.filter(e => e.type === 'evidence').flatMap(e => e.evidence)
  const result = { id: item.id, prompt: item.prompt, mode, firstContentMs, durationMs: Math.round(performance.now() - start), completed: events.some(e => e.type === 'done') && !events.some(e => e.type === 'error'), evidenceCount: evidence.length, sourceLinks: evidence.filter(e => e.ref?.startsWith('https://')).map(e => e.ref), usage: events.find(e => e.type === 'telemetry'), events }
  results.push(result)
  console.log(item.id, mode, result.completed, result.durationMs + 'ms')
  await mkdir('.data/evaluations', { recursive: true })
  await writeFile('.data/evaluations/latest.json', JSON.stringify({ createdAt: new Date().toISOString(), health, results }, null, 2))
}
