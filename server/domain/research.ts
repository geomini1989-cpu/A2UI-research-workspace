/**
 * Provider-neutral research domain model.
 *
 * No MCP, A2A, LLM or UI concepts belong in this layer. External/demo providers
 * normalize their data into these types before the rest of the system consumes it.
 */
export interface CompanyProfile {
  id: string
  name: string
  ticker: string
  sector: string
  industry: string
  headquarters: string
  founded: number
  employees: string
  description: string
  highlights: string[]
  market: MarketSnapshot
  technology: TechnologySnapshot
  risks: CompanyRisk[]
}

export interface MarketSnapshot {
  position: string
  sentiment: 'positive' | 'neutral' | 'mixed'
  competitors: string[]
  marketShare: { segment: string; value: number; unit: '%' }[]
  geographies: { region: string; exposure: string }[]
  recentEvents: { date: string; title: string; impact: 'positive' | 'neutral' | 'negative' }[]
}

export interface TechnologySnapshot {
  products: { name: string; category: string; stage: 'current' | 'next' }[]
  roadmap: { period: string; milestone: string }[]
  strengths: string[]
  ecosystem: string[]
  rdIntensity: string
  moat: string
}

export interface CompanyRisk {
  category: 'valuation' | 'competition' | 'supply-chain' | 'regulation' | 'concentration' | 'execution'
  level: 'low' | 'medium' | 'high'
  detail: string
}

export interface FinancialHistoryPoint {
  period: string
  revenueB: number
  grossMarginPct: number
  operatingMarginPct: number
  eps: number
}

export interface FinancialSummary {
  currency: string
  fiscalYear: string
  revenue: { label: string; value: string }[]
  growth: { label: string; value: string }[]
  profitability: { label: string; value: string }[]
  valuation: { label: string; value: string }[]
  history: FinancialHistoryPoint[]
  cashFlow: { label: string; value: string }[]
  capitalAllocation: { label: string; value: string }[]
  comment: string
}

export interface CompanySearchResult {
  id: string
  name: string
  ticker: string
  sector: string
  industry: string
}

export interface CompanyFinancialData {
  company: string
  ticker?: string
  financial: FinancialSummary
}
