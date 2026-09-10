import { describe, expect, it } from 'vitest'
import { normalizeSecFinancials, type SecCompanyFacts, type SecFact } from './secResearchProvider.js'

const fact = (val: number, end: string, filed: string, start: string): SecFact => ({ val, end, filed, start, accn: '0000000000-25-000001', form: '10-K' })
describe('SEC annual financial mapping', () => {
  it('uses annual periods and restatements without inventing missing metrics', () => {
    const data: SecCompanyFacts = { cik: 1045810, entityName: 'NVIDIA', facts: { 'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
        fact(100e9, '2023-12-31', '2024-02-01', '2023-01-01'),
        fact(180e9, '2024-12-31', '2025-02-01', '2024-01-01'),
        fact(200e9, '2024-12-31', '2026-02-01', '2024-01-01'),
        fact(90e9, '2024-12-31', '2026-02-01', '2024-10-01'),
      ] } },
    } } }
    const result = normalizeSecFinancials(data, 'NVDA', '2026-09-10T00:00:00.000Z')
    expect(result.financial.history.map(point => point.revenueB)).toEqual([100, 200])
    expect(result.financial.growth[0].value).toBe('100.00%')
    expect(result.financial.history[1].eps).toBeUndefined()
    expect(result.financial.valuation).toEqual([])
    expect(result.source?.url).toContain('CIK0001045810')
    expect(result.source?.period).toBe('2024-01-01 — 2024-12-31')
  })
  it('reports unsupported filings as unavailable', () => {
    expect(() => normalizeSecFinancials({ cik: 1, entityName: 'Test', facts: {} }, 'TEST', '2026-09-10T00:00:00.000Z')).toThrow('未生成估计值')
  })
})
