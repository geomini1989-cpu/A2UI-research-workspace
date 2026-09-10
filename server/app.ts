import Fastify, { type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import staticFiles from '@fastify/static'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from './config.js'
import { chatRoutes } from './routes/chat.js'
import { registerSpecialistA2aRoutes } from './a2a/server.js'
import { registerAgent } from './registry/agentRegistry.js'
import { getResearchProvider } from './providers/index.js'

declare module 'fastify' { interface FastifyRequest { ownerId: string } }

function sessionOwner(req: FastifyRequest): string | undefined {
  const signed = req.cookies.research_session && req.unsignCookie(req.cookies.research_session)
  return signed && signed.valid && signed.value ? signed.value : undefined
}

export async function buildApp() {
  if (config.production && (!config.accessKey || !process.env.SESSION_SECRET || !process.env.PUBLIC_ORIGIN)) {
    throw new Error('Production requires APP_ACCESS_KEY, SESSION_SECRET and PUBLIC_ORIGIN')
  }
  const app = Fastify({ logger: true, bodyLimit: 1_048_576 })
  app.decorateRequest('ownerId', '')
  await app.register(cookie, { secret: config.sessionSecret })
  await app.register(rateLimit, { global: false })
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0]
    if (['POST', 'DELETE'].includes(req.method) && req.headers.origin && !config.allowedOrigins.includes(req.headers.origin)) {
      return reply.code(403).send({ error: 'Origin is not allowed' })
    }
    if (path.startsWith('/a2a/')) {
      if (req.headers['x-agent-token'] !== config.agentToken) return reply.code(401).send({ error: 'Internal agent access required' })
      return
    }
    if (!path.startsWith('/api/') || path === '/api/health' || path === '/api/session') return
    const owner = sessionOwner(req)
    if (!owner) return reply.code(401).send({ error: '请先进入工作台' })
    req.ownerId = owner
  })
  app.post<{ Body: { accessKey?: string } }>('/api/session', {
    schema: { body: { type: 'object', properties: { accessKey: { type: 'string', maxLength: 256 } } } },
    config: { rateLimit: { max: 10, timeWindow: '1 minute', allowList: req => Boolean(sessionOwner(req)) } },
  }, async (req, reply) => {
    if (sessionOwner(req)) return { ok: true }
    if (config.accessKey) {
      const actual = Buffer.from(req.body?.accessKey ?? '')
      const expected = Buffer.from(config.accessKey)
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply.code(401).send({ error: '请输入工作台访问口令' })
    }
    reply.setCookie('research_session', config.accessKey ? randomUUID() : 'local', {
      path: '/', signed: true, httpOnly: true, sameSite: 'strict', secure: config.production, maxAge: 30 * 24 * 60 * 60,
    })
    return { ok: true }
  })
  app.get('/api/health', async () => ({ ok: true, model: config.deepseekModel, researchProvider: getResearchProvider().metadata }))
  await app.register(chatRoutes)
  const cards = await registerSpecialistA2aRoutes(app, {
    financial: config.financialAgentBaseUrl, market: config.marketAgentBaseUrl, technology: config.technologyAgentBaseUrl,
  })
  cards.forEach(registerAgent)
  const root = resolve('dist')
  if (existsSync(root)) await app.register(staticFiles, { root })
  return app
}
