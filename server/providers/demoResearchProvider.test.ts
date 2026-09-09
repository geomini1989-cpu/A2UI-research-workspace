import { describe, expect, it } from 'vitest'

import { createResearchProvider } from './index.js'
import { DemoResearchProvider } from './demoResearchProvider.js'
import { ResearchProviderError } from './researchProvider.js'

describe('DemoResearchProvider', () => {
  it('implements the provider-neutral research contract', async () => {
    const provider = new DemoResearchProvider()
    expect(provider.metadata).toMatchObject({
      id: 'demo-research',
      kind: 'demo',
    })

    const results = await provider.searchCompanies('NVDA')
    expect(results[0]).toMatchObject({ name: 'NVIDIA', ticker: 'NVDA' })

    const profile = await provider.getCompanyProfile('nvidia')
    expect(profile.market.recentEvents.length).toBeGreaterThan(0)
    expect(profile.technology.products.length).toBeGreaterThan(0)

    const financial = await provider.getFinancialSummary('NVDA')
    expect(financial).toMatchObject({
      company: 'NVIDIA',
      ticker: 'NVDA',
      financial: { currency: 'USD' },
    })
    expect(financial.financial.history).toHaveLength(8)
  })

  it('returns cloned normalized domain objects rather than mutable fixture references', async () => {
    const provider = new DemoResearchProvider()
    const first = await provider.getCompanyProfile('NVIDIA')
    first.name = 'mutated'
    const second = await provider.getCompanyProfile('NVIDIA')
    expect(second.name).toBe('NVIDIA')
  })

  it('uses provider-level errors for invalid queries and unknown companies', async () => {
    const provider = new DemoResearchProvider()
    await expect(provider.searchCompanies('')).rejects.toBeInstanceOf(ResearchProviderError)
    await expect(provider.getCompanyProfile('unknown-company')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('createResearchProvider', () => {
  it('creates the registered demo provider', () => {
    expect(createResearchProvider('demo').metadata.kind).toBe('demo')
  })

  it('fails closed for an unregistered provider id', () => {
    expect(() => createResearchProvider('mystery')).toThrowError(ResearchProviderError)
  })
})
