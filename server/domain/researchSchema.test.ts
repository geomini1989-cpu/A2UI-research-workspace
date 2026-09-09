import { describe, expect, it } from 'vitest'

import {
  CompanyFinancialDataSchema,
  CompanyProfileSchema,
} from './researchSchema.js'

describe('research domain schemas', () => {
  it('rejects malformed provider data at the domain boundary', () => {
    expect(CompanyProfileSchema.safeParse({
      id: 'broken',
      name: 'Broken',
      ticker: 'BRK',
    }).success).toBe(false)
  })

  it('rejects non-finite financial history values', () => {
    const result = CompanyFinancialDataSchema.safeParse({
      company: 'Test',
      ticker: 'TST',
      financial: {
        currency: 'USD',
        fiscalYear: 'FY',
        revenue: [],
        growth: [],
        profitability: [],
        valuation: [],
        history: [{
          period: 'Q1',
          revenueB: Number.NaN,
          grossMarginPct: 10,
          operatingMarginPct: 5,
          eps: 1,
        }],
        cashFlow: [],
        capitalAllocation: [],
        comment: '',
      },
    })
    expect(result.success).toBe(false)
  })
})
