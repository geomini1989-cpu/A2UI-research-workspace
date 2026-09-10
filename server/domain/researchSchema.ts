import { z } from 'zod'

import type {
  CompanyFinancialData,
  CompanyProfile,
  CompanySearchResult,
  FinancialSummary,
} from './research.js'

const DataSource = z.object({ url: z.string().url(), retrievedAt: z.string().datetime(), period: z.string().max(80).optional() })

const MarketShare = z.object({
  segment: z.string().min(1).max(160),
  value: z.number().finite(),
  unit: z.literal('%'),
})

const Geography = z.object({
  region: z.string().min(1).max(120),
  exposure: z.string().min(1).max(360),
})

const MarketEvent = z.object({
  date: z.string().min(1).max(80),
  title: z.string().min(1).max(240),
  impact: z.enum(['positive', 'neutral', 'negative']),
})

const MarketSnapshotSchema = z.object({
  position: z.string().min(1).max(500),
  sentiment: z.enum(['positive', 'neutral', 'mixed']),
  competitors: z.array(z.string().min(1).max(120)).max(40),
  marketShare: z.array(MarketShare).max(30),
  geographies: z.array(Geography).max(30),
  recentEvents: z.array(MarketEvent).max(50),
})

const TechnologySnapshotSchema = z.object({
  products: z.array(z.object({
    name: z.string().min(1).max(160),
    category: z.string().min(1).max(160),
    stage: z.enum(['current', 'next']),
  })).max(60),
  roadmap: z.array(z.object({
    period: z.string().min(1).max(80),
    milestone: z.string().min(1).max(360),
  })).max(40),
  strengths: z.array(z.string().min(1).max(240)).max(40),
  ecosystem: z.array(z.string().min(1).max(160)).max(60),
  rdIntensity: z.string().min(1).max(80),
  moat: z.string().min(1).max(500),
})

const CompanyRiskSchema = z.object({
  category: z.enum(['valuation', 'competition', 'supply-chain', 'regulation', 'concentration', 'execution']),
  level: z.enum(['low', 'medium', 'high']),
  detail: z.string().min(1).max(500),
})

export const CompanyProfileSchema = z.object({
  source: DataSource.optional(),
  availableDimensions: z.array(z.string()).optional(),
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  ticker: z.string().min(1).max(32),
  sector: z.string().min(1).max(120),
  industry: z.string().min(1).max(160),
  headquarters: z.string().min(1).max(160),
  founded: z.number().int().min(1600).max(2200).nullable(),
  employees: z.string().min(1).max(80),
  description: z.string().min(1).max(800),
  highlights: z.array(z.string().min(1).max(240)).max(40),
  market: MarketSnapshotSchema,
  technology: TechnologySnapshotSchema,
  risks: z.array(CompanyRiskSchema).max(40),
})

const LabelValue = z.object({
  label: z.string().min(1).max(160),
  value: z.string().min(1).max(160),
})

const FinancialHistoryPointSchema = z.object({
  period: z.string().min(1).max(80),
  revenueB: z.number().finite(),
  grossMarginPct: z.number().finite().optional(),
  operatingMarginPct: z.number().finite().optional(),
  eps: z.number().finite().optional(),
})

export const FinancialSummarySchema = z.object({
  currency: z.string().min(1).max(16),
  fiscalYear: z.string().min(1).max(80),
  revenue: z.array(LabelValue).max(60),
  growth: z.array(LabelValue).max(40),
  profitability: z.array(LabelValue).max(40),
  valuation: z.array(LabelValue).max(40),
  history: z.array(FinancialHistoryPointSchema).max(80),
  cashFlow: z.array(LabelValue).max(40),
  capitalAllocation: z.array(LabelValue).max(40),
  comment: z.string().max(500),
})

export const CompanySearchResultSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  ticker: z.string().min(1).max(32),
  sector: z.string().min(1).max(120),
  industry: z.string().min(1).max(160),
})

export const CompanyFinancialDataSchema = z.object({
  source: DataSource.optional(),
  company: z.string().min(1).max(120),
  ticker: z.string().min(1).max(32).optional(),
  financial: FinancialSummarySchema,
})

export function assertCompanyProfile(value: unknown): CompanyProfile {
  return CompanyProfileSchema.parse(value) as CompanyProfile
}

export function assertFinancialSummary(value: unknown): FinancialSummary {
  return FinancialSummarySchema.parse(value) as FinancialSummary
}

export function assertCompanySearchResults(value: unknown): CompanySearchResult[] {
  return z.array(CompanySearchResultSchema).parse(value) as CompanySearchResult[]
}

export function assertCompanyFinancialData(value: unknown): CompanyFinancialData {
  return CompanyFinancialDataSchema.parse(value) as CompanyFinancialData
}
