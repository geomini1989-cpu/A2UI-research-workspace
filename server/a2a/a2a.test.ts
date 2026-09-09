import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { AgentCard } from '@a2a-js/sdk'
import { createFinancialAgentCard, createMarketAgentCard, createTechnologyAgentCard, AGENT_CARD_PATH, FINANCIAL_A2A_PATH, MARKET_AGENT_CARD_PATH, TECHNOLOGY_AGENT_CARD_PATH } from './agentCard.js'
import { dispatchFinancialTask, discoverAgentCard } from './client.js'
import { registerFinancialA2aRoutes, registerSpecialistA2aRoutes } from './server.js'
import { classifyResearchRoute } from '../agent/researchAgent.js'
import { clearAgentRegistry, findAgentsBySkill, getAgent, listAgents, registerAgent } from '../registry/agentRegistry.js'

let app: FastifyInstance | undefined
afterEach(async () => { clearAgentRegistry(); await app?.close(); app = undefined })

describe('Agent Card and registry', () => {
  it('publishes a valid v1 card with the required skills and JSON-RPC endpoint', () => {
    const card = createFinancialAgentCard('http://127.0.0.1:3001')
    expect(() => AgentCard.fromJSON(AgentCard.toJSON(card))).not.toThrow()
    expect(card.supportedInterfaces[0]).toMatchObject({ url: `http://127.0.0.1:3001${FINANCIAL_A2A_PATH}`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' })
    expect(card.capabilities?.streaming).toBe(true)
    expect(card.skills.map((skill) => skill.id)).toEqual(expect.arrayContaining(['company-analysis', 'financial-analysis', 'company-comparison', 'valuation-analysis', 'risk-analysis']))
  })

  it('registers, lists, gets, and discovers cards by skill match count', () => {
    const card = createFinancialAgentCard('http://127.0.0.1:3001')
    registerAgent(card)
    expect(listAgents()).toHaveLength(1)
    expect(getAgent(card.name)).toBe(card)
    expect(findAgentsBySkill(['company-comparison', 'risk-analysis'])[0]).toBe(card)
    expect(findAgentsBySkill(['unavailable-skill'])).toEqual([])
  })
})

describe('Coordinator routing', () => {
  it('keeps a simple page request on direct A2UI', () => expect(classifyResearchRoute('帮我创建一个公司研究页面').route).toBe('direct-a2ui'))
  it('routes a simple company fact request to direct MCP', () => expect(classifyResearchRoute('查一下 NVIDIA 的公司基础信息').route).toBe('direct-mcp'))
  it('routes complex analysis and comparison to A2A', () => {
    expect(classifyResearchRoute('分析 NVIDIA 的增长、估值和风险').route).toBe('a2a-financial')
    expect(classifyResearchRoute('比较 NVIDIA 和 AMD').route).toBe('a2a-financial')
  })
})

describe('real A2A HTTP transport', () => {
  it('discovers the card and returns a completed structured Task artifact', async () => {
    app = Fastify()
    await registerFinancialA2aRoutes(app, 'http://127.0.0.1:32191')
    await app.ready()
    const injectedFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const response = await app!.inject({ method: (init?.method ?? 'GET') as 'GET' | 'POST', url: url.pathname, headers: init?.headers as Record<string, string>, payload: init?.body ? String(init.body) : undefined })
      return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> })
    }
    const card = await discoverAgentCard('http://127.0.0.1:32191', injectedFetch)
    const activities: string[] = []
    const outcome = await dispatchFinancialTask(card, '比较 NVIDIA 和 AMD 的增长、估值和风险', 30_000, injectedFetch, (activity) => activities.push(activity.message))
    expect(outcome.taskId).toBeTruthy()
    expect(outcome.result).toMatchObject({ schemaVersion: 'research-result/v2', dimension: 'financial', subject: 'NVIDIA vs AMD', evidence: expect.arrayContaining([expect.objectContaining({ sourceName: expect.stringContaining('MCP') })]) })
    expect(outcome.result.metrics.length).toBeGreaterThan(0)
    expect(activities.some((activity) => activity.includes('MCP'))).toBe(true)
    const cardResponse = await injectedFetch(`http://127.0.0.1:32191${AGENT_CARD_PATH}`)
    expect(cardResponse.ok).toBe(true)
  })

  it('builds independent valid Market and Technology cards', () => {
    for (const card of [createMarketAgentCard('http://127.0.0.1:3001'), createTechnologyAgentCard('http://127.0.0.1:3001')]) {
      expect(() => AgentCard.fromJSON(AgentCard.toJSON(card))).not.toThrow()
      expect(card.skills).toHaveLength(5)
      expect(card.supportedInterfaces[0]?.protocolVersion).toBe('1.0')
    }
    expect(MARKET_AGENT_CARD_PATH).not.toBe(TECHNOLOGY_AGENT_CARD_PATH)
  })

  it('surfaces an unreachable specialist as a protocol failure', async () => {
    const card = createFinancialAgentCard('http://127.0.0.1:32192')
    await expect(dispatchFinancialTask(card, '比较 NVIDIA 和 AMD', 250)).rejects.toMatchObject({ code: 'REMOTE_FAILED' })
  })

  it('serves all three cards and executes Market and Technology over A2A', async () => {
    app = Fastify()
    const baseUrl = 'http://specialists.local'
    const cards = await registerSpecialistA2aRoutes(app, { financial: baseUrl, market: baseUrl, technology: baseUrl })
    await app.ready()
    const injectedFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const response = await app!.inject({ method: (init?.method ?? 'GET') as 'GET' | 'POST', url: url.pathname, headers: init?.headers as Record<string, string>, payload: init?.body ? String(init.body) : undefined })
      return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> })
    }
    for (const path of [AGENT_CARD_PATH, MARKET_AGENT_CARD_PATH, TECHNOLOGY_AGENT_CARD_PATH]) {
      const response = await injectedFetch(`${baseUrl}${path}`)
      expect(response.ok).toBe(true)
      const json = await response.json()
      expect(() => AgentCard.fromJSON(json)).not.toThrow()
    }
    const market = await dispatchFinancialTask(cards[1], '总结 NVIDIA 最近的市场变化', 30_000, injectedFetch)
    const technology = await dispatchFinancialTask(cards[2], '分析 NVIDIA 的产品和技术竞争力', 30_000, injectedFetch)
    expect(market.result.dimension).toBe('market')
    expect(technology.result.dimension).toBe('technology')
  })
})
