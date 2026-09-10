import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { config } from './config.js'
import { db } from './storage/database.js'

let app: Awaited<ReturnType<typeof buildApp>>
const accessKey = config.accessKey
beforeAll(async () => { config.accessKey = 'test-access'; app = await buildApp() })
afterAll(async () => { await app.close(); config.accessKey = accessKey })
async function login() {
  const response = await app.inject({ method: 'POST', url: '/api/session', payload: { accessKey: 'test-access' } })
  return { cookie: response.cookies[0].name + '=' + response.cookies[0].value }
}
it('protects sessions and internal agents; signed refreshes do not exhaust login quota', async () => {
  expect((await app.inject('/api/history')).statusCode).toBe(401)
  const headers = await login()
  for (let i = 0; i < 12; i++) expect((await app.inject({ method: 'POST', url: '/api/session', headers, payload: {} })).statusCode).toBe(200)
  expect((await app.inject({ method: 'POST', url: '/a2a/financial', payload: {} })).statusCode).toBe(401)
  expect((await app.inject({ method: 'DELETE', url: '/api/history', headers: { ...headers, origin: 'https://untrusted.example' } })).statusCode).toBe(403)
  expect((await app.inject({ method: 'POST', url: '/api/action', headers, payload: { name: 'start_research_job', sourceComponentId: 'start', surfaceId: 'another-owner' } })).statusCode).toBe(403)
})
it('clearing history cannot reset the workspace model budget', async () => {
  const headers = await login()
  db.prepare('INSERT INTO daily_usage VALUES (?, ?)').run(new Date().toISOString().slice(0, 10), config.maxDailyRuns)
  expect((await app.inject({ method: 'DELETE', url: '/api/history', headers })).statusCode).toBe(200)
  expect((await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { message: '分析 NVIDIA' } })).statusCode).toBe(429)
})
