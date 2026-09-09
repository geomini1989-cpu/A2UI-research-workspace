import { describe, it, expect } from 'vitest'
import {
  executeResearchTool,
  ResearchToolError,
  RESEARCH_TOOL_NAMES,
  RESEARCH_SOURCE_LABEL,
  type CompanyProfile,
} from './researchTools.js'

describe('RESEARCH_TOOL_NAMES (allow-list)', () => {
  it('exposes exactly the three allowed tools', () => {
    expect(RESEARCH_TOOL_NAMES).toEqual(['search_company', 'get_company_profile', 'get_financial_summary'])
  })
})

describe('executeResearchTool', () => {
  it('searches companies by name and ticker', async () => {
    const res = await executeResearchTool('search_company', { query: 'nvidia' })
    expect(res.text).toContain('NVIDIA')
    expect(res.data).toMatchObject({ source: RESEARCH_SOURCE_LABEL })
    const results = (res.data as { results: { name: string }[] }).results
    expect(results[0].name).toBe('NVIDIA')
  })

  it('returns a company profile, resolving fuzzy tickers', async () => {
    const res = await executeResearchTool('get_company_profile', { company: 'nvda' })
    const profile = (res.data as { profile: { name: string; sector: string } }).profile
    expect(profile.name).toBe('NVIDIA')
    expect(profile.sector).toBe('Technology')
    expect(res.text).toContain(RESEARCH_SOURCE_LABEL)
  })

  it('returns a rich financial summary with 8-quarter history for AMD', async () => {
    const res = await executeResearchTool('get_financial_summary', { company: 'AMD' })
    const fin = (res.data as { financial: { revenue: { label: string; value: string }[]; currency: string; history: unknown[]; cashFlow: unknown[] } }).financial
    expect(fin.currency).toBe('USD')
    expect(fin.revenue.length).toBeGreaterThan(0)
    expect(fin.history).toHaveLength(8)
    expect(fin.cashFlow.length).toBeGreaterThan(0)
    expect(res.text).toContain('Quarterly history')
  })

  it('returns market, technology and risk dimensions from the company profile', async () => {
    const res = await executeResearchTool('get_company_profile', { company: 'NVIDIA' })
    const profile = (res.data as { profile: CompanyProfile }).profile
    expect(profile.market.competitors.length).toBeGreaterThan(0)
    expect(profile.market.recentEvents.length).toBeGreaterThan(0)
    expect(profile.technology.products.length).toBeGreaterThan(0)
    expect(profile.technology.roadmap.length).toBeGreaterThan(0)
    expect(profile.risks.length).toBeGreaterThan(0)
  })

  it('adds Intel as a supported deep mock company', async () => {
    const res = await executeResearchTool('get_company_profile', { company: 'INTC' })
    const profile = (res.data as { profile: { name: string; ticker: string } }).profile
    expect(profile).toMatchObject({ name: 'Intel', ticker: 'INTC' })
  })

  it('rejects an unknown tool (not on the allow-list)', async () => {
    await expect(executeResearchTool('get_stock_price', {})).rejects.toBeInstanceOf(ResearchToolError)
    try {
      await executeResearchTool('get_stock_price', {})
    } catch (err) {
      expect((err as ResearchToolError).code).toBe('UNKNOWN_TOOL')
    }
  })

  it('wraps an empty tool argument as a NOT_FOUND error, not a crash', async () => {
    await expect(executeResearchTool('get_company_profile', { company: '' })).rejects.toBeInstanceOf(ResearchToolError)
  })

  it('throws NOT_FOUND for an unknown company', async () => {
    try {
      await executeResearchTool('get_financial_summary', { company: 'definitely-not-a-company' })
    } catch (err) {
      expect((err as ResearchToolError).code).toBe('NOT_FOUND')
    }
  })

  it('always labels results as demo/mock', async () => {
    for (const name of RESEARCH_TOOL_NAMES) {
      const args =
        name === 'search_company'
          ? { query: 'tech' }
          : name === 'get_company_profile'
            ? { company: 'nvidia' }
            : { company: 'nvidia' }
      const res = await executeResearchTool(name, args)
      expect(res.text).toContain('Demo')
    }
  })
})
