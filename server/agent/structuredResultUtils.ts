import type { CompanyProfile, FinancialSummary } from '../domain/research.js'
import type {
  ResearchEvidence,
  ResearchFinding,
  ResearchMetric,
  ResearchRisk,
  ResearchTrend,
} from '../orchestration/types.js'

export function evidenceFor(
  agentId: string,
  company: string,
  tool: string,
  description: string,
): ResearchEvidence {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return {
    id: `${agentId}:${tool}:${slug}`,
    sourceName: 'MCP Research Tool (Demo Data)',
    sourceType: 'demo',
    tool,
    ref: `${tool}:${slug}`,
    description,
  }
}

export function riskId(agentId: string, company: string, category: string, index: number) {
  return `${agentId}:risk:${company.toLowerCase()}:${category}:${index + 1}`
}

export function findingId(agentId: string, company: string, category: string, index: number) {
  return `${agentId}:finding:${company.toLowerCase()}:${category}:${index + 1}`
}

export function profileEntities(profiles: CompanyProfile[]) {
  return profiles.map((profile) => ({ name: profile.name, ticker: profile.ticker }))
}

export function profileRisks(
  agentId: string,
  profiles: CompanyProfile[],
  categories: readonly string[],
  evidenceByCompany: ReadonlyMap<string, string>,
): ResearchRisk[] {
  return profiles.flatMap((profile) =>
    profile.risks
      .filter((risk) => categories.includes(risk.category))
      .map((risk, index) => ({
        id: riskId(agentId, profile.name, risk.category, index),
        category: risk.category,
        title: `${profile.name} · ${risk.category}`,
        detail: risk.detail,
        severity: risk.level,
        evidenceIds: evidenceByCompany.has(profile.name) ? [evidenceByCompany.get(profile.name)!] : [],
      })),
  )
}

export function financialMetrics(
  company: string,
  financial: FinancialSummary,
  evidenceId: string,
): ResearchMetric[] {
  const groups = [
    ['revenue', financial.revenue],
    ['growth', financial.growth],
    ['profitability', financial.profitability],
    ['valuation', financial.valuation],
    ['cash-flow', financial.cashFlow],
    ['capital-allocation', financial.capitalAllocation],
  ] as const

  return groups.flatMap(([category, rows]) =>
    rows.map((row) => ({
      key: `${company.toLowerCase()}:${category}:${row.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: row.label,
      value: row.value,
      company,
      category,
      period: financial.fiscalYear,
      evidenceIds: [evidenceId],
    })),
  )
}

export function financialTrends(
  company: string,
  financial: FinancialSummary,
  evidenceId: string,
): ResearchTrend[] {
  const definitions = [
    { key: 'revenue', label: 'Revenue', unit: 'USD B', field: 'revenueB' },
    { key: 'gross-margin', label: 'Gross Margin', unit: '%', field: 'grossMarginPct' },
    { key: 'operating-margin', label: 'Operating Margin', unit: '%', field: 'operatingMarginPct' },
    { key: 'eps', label: 'EPS', unit: undefined, field: 'eps' },
  ] as const

  return definitions.map((definition) => ({
    key: `${company.toLowerCase()}:${definition.key}`,
    label: definition.label,
    company,
    unit: definition.unit,
    points: financial.history.map((point) => ({
      period: point.period,
      value: point[definition.field],
    })),
    evidenceIds: [evidenceId],
  }))
}

export function compactFinding(
  agentId: string,
  company: string,
  category: string,
  title: string,
  detail: string,
  importance: 'low' | 'medium' | 'high',
  evidenceId: string,
  index = 0,
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed',
): ResearchFinding {
  return {
    id: findingId(agentId, company, category, index),
    category,
    title,
    detail,
    importance,
    sentiment,
    evidenceIds: [evidenceId],
  }
}
