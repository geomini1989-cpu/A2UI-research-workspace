import { describe, it, expect, afterEach } from 'vitest'
import { createResearchClient, type ResearchClient } from './client.js'
import { ResearchToolError, RESEARCH_TOOL_NAMES, RESEARCH_SOURCE_LABEL } from './tools/researchTools.js'

let client: ResearchClient | null = null

afterEach(async () => {
  await client?.close().catch(() => {})
  client = null
})

describe('createResearchClient (real MCP protocol over in-memory transport)', () => {
  it('lists exactly the three demo tools', async () => {
    client = await createResearchClient()
    const tools = await client.listTools()
    expect(tools.sort()).toEqual([...RESEARCH_TOOL_NAMES].sort())
  })

  it('executes a tool through the MCP boundary and returns text + structured data', async () => {
    client = await createResearchClient()
    const out = await client.callTool('get_company_profile', { company: 'nvidia' })
    expect(out.text).toContain('NVIDIA')
    expect(out.text).toContain(RESEARCH_SOURCE_LABEL)
    const profile = (out.data as { profile: { name: string } }).profile
    expect(profile.name).toBe('NVIDIA')
  })

  it('calls financial summary and gets structured financial data', async () => {
    client = await createResearchClient()
    const out = await client.callTool('get_financial_summary', { company: 'AMD' })
    expect(out.data).toMatchObject({ financial: { currency: 'USD' } })
  })

  it('rejects a tool not on the allow-list without executing it', async () => {
    client = await createResearchClient()
    await expect(client.callTool('get_stock_price', {})).rejects.toBeInstanceOf(ResearchToolError)
    try {
      await client.callTool('get_stock_price', {})
    } catch (err) {
      expect((err as ResearchToolError).code).toBe('UNKNOWN_TOOL')
    }
  })

  it('surfaces a tool error as a rejection, not an unhandled throw', async () => {
    client = await createResearchClient()
    await expect(client.callTool('get_company_profile', { company: '' })).rejects.toBeInstanceOf(ResearchToolError)
  })
})
