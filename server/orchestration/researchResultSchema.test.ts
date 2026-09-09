import { describe, expect, it } from 'vitest'

import { parseStructuredResearchResult, StructuredResearchResultSchema } from './researchResultSchema.js'

function validResult() {
  return {
    schemaVersion: 'research-result/v2',
    agentId: 'financial',
    dimension: 'financial',
    subject: 'NVIDIA',
    entities: [{ name: 'NVIDIA', ticker: 'NVDA' }],
    metrics: [{
      key: 'nvda:revenue',
      label: 'Revenue',
      value: '$55B',
      company: 'NVIDIA',
      category: 'revenue',
      evidenceIds: ['financial:get_financial_summary:nvidia'],
    }],
    trends: [{
      key: 'nvda:revenue-trend',
      label: 'Revenue',
      company: 'NVIDIA',
      unit: 'USD B',
      points: [{ period: '2025 Q4', value: 55 }],
      evidenceIds: ['financial:get_financial_summary:nvidia'],
    }],
    findings: [{
      id: 'financial:finding:nvidia:headline:1',
      category: 'headline',
      title: 'Revenue growth',
      detail: 'Revenue remains elevated in demo data.',
      importance: 'high',
      sentiment: 'positive',
      evidenceIds: ['financial:get_financial_summary:nvidia'],
    }],
    risks: [{
      id: 'financial:risk:nvidia:valuation:1',
      category: 'valuation',
      title: 'Valuation risk',
      detail: 'Premium expectations raise sensitivity to disappointment.',
      severity: 'high',
      evidenceIds: ['financial:get_company_profile:nvidia'],
    }],
    evidence: [
      {
        id: 'financial:get_financial_summary:nvidia',
        sourceName: 'MCP Research Tool (Demo Data)',
        sourceType: 'demo',
        tool: 'get_financial_summary',
      },
      {
        id: 'financial:get_company_profile:nvidia',
        sourceName: 'MCP Research Tool (Demo Data)',
        sourceType: 'demo',
        tool: 'get_company_profile',
      },
    ],
    activities: [],
  }
}

describe('StructuredResearchResultSchema', () => {
  it('accepts a complete evidence-linked research-result/v2 artifact', () => {
    expect(StructuredResearchResultSchema.safeParse(validResult()).success).toBe(true)
  })

  it('rejects dangling evidence references', () => {
    const result = validResult()
    result.metrics[0].evidenceIds = ['missing-evidence']
    expect(parseStructuredResearchResult(result)).toBeNull()
  })

  it('rejects duplicate evidence ids', () => {
    const result = validResult()
    result.evidence.push({ ...result.evidence[0] })
    expect(parseStructuredResearchResult(result)).toBeNull()
  })

  it('rejects legacy prose-first specialist artifacts', () => {
    expect(parseStructuredResearchResult({
      agentId: 'financial',
      taskType: 'financial',
      subject: 'NVIDIA',
      summary: 'legacy prose summary',
      insights: [],
      risks: [],
      metrics: [],
      sources: [],
      activities: [],
    })).toBeNull()
  })
})
