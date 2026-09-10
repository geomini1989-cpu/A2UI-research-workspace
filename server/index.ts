import { config } from './config.js'
import { buildApp } from './app.js'
import { recoverInterruptedRuns } from './storage/database.js'

recoverInterruptedRuns()
const app = await buildApp()
await app.listen({ port: config.port, host: config.host })
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); process.exit(0) })
}
