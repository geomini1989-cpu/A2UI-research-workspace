import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { chatRoutes } from './routes/chat.js'
import { registerSpecialistA2aRoutes } from './a2a/server.js'
import { registerAgent } from './registry/agentRegistry.js'

const app = Fastify({ logger: true })

async function main() {
  // The browser (Vite dev server) talks to this backend on a different Origin.
  await app.register(cors, {
    origin: true, // dev only — allow the Vite dev origin. Lock down in production.
  })

  await app.register(chatRoutes)
  const specialistCards = await registerSpecialistA2aRoutes(app, {
    financial: config.financialAgentBaseUrl,
    market: config.marketAgentBaseUrl,
    technology: config.technologyAgentBaseUrl,
  })
  for (const card of specialistCards) registerAgent(card)

  app.get('/api/health', async () => ({ ok: true, model: config.deepseekModel }))

  await app.listen({ port: config.port, host: '127.0.0.1' })
  app.log.info(`Research Agent backend listening on http://127.0.0.1:${config.port}`)
}

main().catch((err) => {
  app.log.error(err)
  process.exit(1)
})
