import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { runResearchAgent, runResearchAgentAction, type AgentEvent, type Emit } from '../agent/researchAgent.js'
import { isResearchJobAction, isResearchJobRequest, runResearchJobAction, runResearchJobRequest } from '../researchJobs/researchJobFlow.js'
import { isResearchComposerAction, isResearchComposerRequest, runResearchComposerAction, runResearchComposerRequest } from '../composer/researchComposer.js'
import { listResearchJobs } from '../researchJobs/researchJobService.js'
import { appendEvent, clearHistory, finishRun, getHistory, startRun, type RunRequest } from '../storage/history.js'
import { db, readState } from '../storage/database.js'
import { runContext, newUsage } from '../runtime/context.js'
import { config } from '../config.js'

const activeOwners = new Set<string>()
const chatInput = z.object({ message: z.string().trim().min(1).max(8000), mode: z.enum(['single', 'multi']).default('multi') })
const actionInput = z.object({
  name: z.string().min(1).max(80), surfaceId: z.string().min(1).max(160), sourceComponentId: z.string().max(160),
  context: z.record(z.string(), z.unknown()).default({}),
})

function withOwner<T>(req: FastifyRequest, fn: () => T): T {
  return runContext.run({ ownerId: req.ownerId, signal: new AbortController().signal, usage: newUsage(), mode: 'multi' }, fn)
}
async function streamRun(req: FastifyRequest, reply: FastifyReply, request: RunRequest, runner: (emit: Emit) => Promise<void>) {
  if (activeOwners.has(req.ownerId)) return reply.code(409).send({ error: '当前研究仍在运行，请先停止或等待完成。' })
  const quota = db.prepare('INSERT INTO daily_usage VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count')
    .get(new Date().toISOString().slice(0, 10), config.maxDailyRuns)
  if (!quota) return reply.code(429).send({ error: '今日研究操作额度已用完。' })

  activeOwners.add(req.ownerId)
  const controller = new AbortController()
  const usage = newUsage()
  const start = performance.now()
  let finished = false
  reply.raw.on('close', () => { if (!finished) controller.abort() })
  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no',
  })
  await runContext.run({
    ownerId: req.ownerId, signal: controller.signal, usage, mode: request.payload.mode === 'single' ? 'single' : 'multi',
  }, async () => {
    const id = startRun(request)
    let terminal = false
    const write = (event: AgentEvent) => {
      appendEvent(id, event)
      if (!reply.raw.destroyed) reply.raw.write(JSON.stringify(event) + '\n')
    }
    const emit: Emit = event => {
      controller.signal.throwIfAborted()
      terminal ||= event.type === 'done' || event.type === 'error' || (event.type === 'task_state' && event.state !== 'RUNNING')
      write(event)
    }
    try {
      await runner(emit)
      if (!terminal) throw new Error('研究连接提前结束，请重试。')
    } catch (error) {
      write({ type: 'error', error: controller.signal.aborted ? '研究已停止，可以重新执行。' : (error as Error).message })
      req.log.error({ err: error, runId: id }, 'Research interrupted')
    } finally {
      write({ type: 'telemetry', runId: id, durationMs: Math.round(performance.now() - start), ...usage })
      finishRun(id)
      finished = true
      activeOwners.delete(req.ownerId)
      reply.raw.end()
    }
  })
}

export async function chatRoutes(app: FastifyInstance) {
  app.get('/api/history', async req => withOwner(req, getHistory))
  app.get('/api/jobs', async req => withOwner(req, listResearchJobs))
  app.delete('/api/history', async (req, reply) => {
    if (activeOwners.has(req.ownerId)) return reply.code(409).send({ error: '请先停止研究' })
    withOwner(req, clearHistory)
    return { ok: true }
  })
  app.post('/api/chat', async (req, reply) => {
    const parsed = chatInput.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: '请输入 1–8000 字符的研究问题' })
    const { message } = parsed.data
    return streamRun(req, reply, { kind: 'chat', payload: parsed.data }, emit =>
      isResearchJobRequest(message) ? runResearchJobRequest(message, emit)
        : isResearchComposerRequest(message) ? runResearchComposerRequest(message, emit)
          : runResearchAgent(message, emit))
  })
  app.post('/api/action', async (req, reply) => {
    const parsed = actionInput.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: '操作参数不完整' })
    const action = parsed.data
    if (!withOwner(req, () => readState('surface', action.surfaceId))) return reply.code(403).send({ error: '该研究界面不属于当前会话' })
    return streamRun(req, reply, { kind: 'action', payload: action }, emit =>
      isResearchJobAction(action.name) ? runResearchJobAction(action, emit)
        : isResearchComposerAction(action.name) ? runResearchComposerAction(action, emit)
          : runResearchAgentAction(action, emit))
  })
}
