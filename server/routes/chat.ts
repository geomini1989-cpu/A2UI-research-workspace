import type { FastifyReply, FastifyInstance } from 'fastify'
import type { AgentEvent, Emit } from '../agent/researchAgent.js'
import { runResearchAgent, runResearchAgentAction } from '../agent/researchAgent.js'

interface Ndjson {
  emit: Emit
  /** Closes the HTTP stream. Must be called once the runner settles. */
  finish: () => void
}

/**
 * Begin an `application/x-ndjson` streaming reply. We hijack Fastify's response
 * so we can write lines incrementally as the agent produces them, then close it
 * when the agent settles.
 */
function beginNdjson(reply: FastifyReply): Ndjson {
  reply.hijack()
  const res = reply.raw
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Transfer-Encoding': 'chunked',
    'X-Accel-Buffering': 'no',
  })
  return {
    emit: (event: AgentEvent) => {
      // A client may disconnect mid-stream; writing then throws. Ignore it.
      try {
        res.write(`${JSON.stringify(event)}\n`)
      } catch {
        /* client gone */
      }
    },
    finish: () => {
      try {
        res.end()
      } catch {
        /* already closed */
      }
    },
  }
}

/** Kick off a runner and close the stream once it settles (never reject). */
function launch(promise: Promise<void>, finish: () => void) {
  promise
    .catch((err) => console.error('[agent] unhandled runner error:', err))
    .finally(finish)
}

export async function chatRoutes(app: FastifyInstance) {
  app.post('/api/chat', async (req, reply) => {
    const body = (req.body ?? {}) as { message?: unknown }
    if (typeof body.message !== 'string' || !body.message.trim()) {
      return reply.status(400).send({ error: 'message is required' })
    }
    const { emit, finish } = beginNdjson(reply)
    launch(runResearchAgent(body.message, emit), finish)
  })

  app.post('/api/action', async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: unknown
      surfaceId?: unknown
      sourceComponentId?: unknown
      context?: unknown
    }
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return reply.status(400).send({ error: 'name is required' })
    }
    const { emit, finish } = beginNdjson(reply)
    launch(
      runResearchAgentAction(
        {
          name: body.name,
          surfaceId: typeof body.surfaceId === 'string' ? body.surfaceId : undefined,
          sourceComponentId: typeof body.sourceComponentId === 'string' ? body.sourceComponentId : undefined,
          context:
            typeof body.context === 'object' && body.context !== null
              ? (body.context as Record<string, unknown>)
              : {},
        },
        emit,
      ),
      finish,
    )
  })
}
