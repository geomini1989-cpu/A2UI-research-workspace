/**
 * Research MCP tool contract + provider adapter.
 *
 * This layer no longer owns research data. It exposes a stable MCP vocabulary
 * and translates provider-neutral domain data into MCP text/structured content.
 */
import { z } from 'zod'

import type {
  CompanyProfile,
  FinancialSummary,
} from '../../domain/research.js'
import { getResearchProvider } from '../../providers/index.js'
import {
  ResearchProviderError,
  type ResearchDataProvider,
} from '../../providers/researchProvider.js'

export type {
  CompanyFinancialData,
  CompanyProfile,
  CompanyRisk,
  CompanySearchResult,
  FinancialHistoryPoint,
  FinancialSummary,
  MarketSnapshot,
  TechnologySnapshot,
} from '../../domain/research.js'

export const RESEARCH_TOOL_NAMES = [
  'search_company',
  'get_company_profile',
  'get_financial_summary',
] as const

export type ResearchToolName = (typeof RESEARCH_TOOL_NAMES)[number]

/** Compatibility label for the provider selected at process startup. */
export const RESEARCH_SOURCE_LABEL = getResearchProvider().metadata.sourceLabel

export class ResearchToolError extends Error {
  readonly code: string

  constructor(message: string, code = 'TOOL_ERROR') {
    super(message)
    this.name = 'ResearchToolError'
    this.code = code
  }
}

export const searchCompanyArgs = { query: z.string().min(1) }
export const getCompanyProfileArgs = { company: z.string().min(1) }
export const getFinancialSummaryArgs = { company: z.string().min(1) }

export interface ResearchToolResult {
  text: string
  data: Record<string, unknown>
}

function rows(label: string, items: { label: string; value: string }[]): string {
  return items.map((item) => `${label} ${item.label}: ${item.value}`).join('\n')
}

function profileText(sourceLabel: string, profile: CompanyProfile): string {
  return [
    `Source: ${sourceLabel}`,
    `# ${profile.name} (${profile.ticker})`,
    `Sector: ${profile.sector} | Industry: ${profile.industry}`,
    `HQ: ${profile.headquarters} | Founded: ${profile.founded} | Employees: ${profile.employees}`,
    profile.description,
    `Market position: ${profile.market.position}`,
    `Market sentiment: ${profile.market.sentiment}`,
    `Competitors: ${profile.market.competitors.join(', ')}`,
    `Technology moat: ${profile.technology.moat}`,
    `Products: ${profile.technology.products.map((item) => item.name).join(', ')}`,
    'Risks:',
    ...profile.risks.map((risk) => `- [${risk.level}] ${risk.category}: ${risk.detail}`),
    'Highlights:',
    ...profile.highlights.map((highlight) => `- ${highlight}`),
  ].join('\n')
}

function financialText(
  sourceLabel: string,
  company: string,
  ticker: string | undefined,
  financial: FinancialSummary,
): string {
  const history = financial.history.map(
    (point) =>
      `${point.period}: revenue $${point.revenueB}B | gross margin ${point.grossMarginPct}% | operating margin ${point.operatingMarginPct}% | EPS ${point.eps}`,
  )
  return [
    `Source: ${sourceLabel}`,
    `Financial summary for ${company}${ticker ? ` (${ticker})` : ''} — ${financial.fiscalYear}`,
    rows('Revenue', financial.revenue),
    rows('Growth', financial.growth),
    rows('Profitability', financial.profitability),
    rows('Valuation', financial.valuation),
    'Quarterly history:',
    ...history,
    rows('Cash flow', financial.cashFlow),
    rows('Capital allocation', financial.capitalAllocation),
    financial.comment,
  ].join('\n')
}

function translateProviderError(error: unknown): never {
  if (error instanceof ResearchProviderError) {
    throw new ResearchToolError(error.message, error.code)
  }
  throw new ResearchToolError(
    error instanceof Error ? error.message : 'Research provider failed',
    'PROVIDER_ERROR',
  )
}

/**
 * Provider-injected tool executor. This is the core seam used by tests and
 * future live providers.
 */
export async function executeResearchToolWithProvider(
  name: string,
  args: unknown,
  provider: ResearchDataProvider,
): Promise<ResearchToolResult> {
  if (!(RESEARCH_TOOL_NAMES as readonly string[]).includes(name)) {
    throw new ResearchToolError(`Unknown tool: "${name}"`, 'UNKNOWN_TOOL')
  }

  const argObj = (args ?? {}) as Record<string, unknown>
  const metadata = provider.metadata

  try {
    if (name === 'search_company') {
      const query = String(argObj.query ?? '')
      const results = await provider.searchCompanies(query)
      return {
        text: [
          `Source: ${metadata.sourceLabel}`,
          `Search results for "${query}":`,
          ...results.map((company) => `- ${company.name} (${company.ticker}) — ${company.industry}`),
        ].join('\n'),
        data: {
          source: metadata.sourceLabel,
          provider: metadata,
          query,
          results,
        },
      }
    }

    if (name === 'get_company_profile') {
      const profile = await provider.getCompanyProfile(String(argObj.company ?? ''))
      return {
        text: profileText(metadata.sourceLabel, profile),
        data: {
          source: metadata.sourceLabel,
          provider: metadata,
          profile,
        },
      }
    }

    if (name === 'get_financial_summary') {
      const result = await provider.getFinancialSummary(String(argObj.company ?? ''))
      let ticker: string | undefined
      try {
        ticker = (await provider.getCompanyProfile(result.company)).ticker
      } catch {
        // Profile lookup is presentation-only here; the financial payload remains valid.
      }
      return {
        text: financialText(metadata.sourceLabel, result.company, ticker, result.financial),
        data: {
          source: metadata.sourceLabel,
          provider: metadata,
          company: result.company,
          financial: result.financial,
        },
      }
    }
  } catch (error) {
    translateProviderError(error)
  }

  throw new ResearchToolError(`No handler for: ${name}`, 'NO_HANDLER')
}

export async function executeResearchTool(
  name: string,
  args: unknown,
): Promise<ResearchToolResult> {
  return executeResearchToolWithProvider(name, args, getResearchProvider())
}

export const RESEARCH_TOOL_FUNCTIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_company',
      description: 'Search the configured research provider by company name, ticker, sector or industry.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Company name or ticker, e.g. "NVIDIA", "INTC" or "MSFT"',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_company_profile',
      description: 'Get the normalized company profile, market context, technology/product data and risks.',
      parameters: {
        type: 'object',
        properties: { company: { type: 'string', description: 'Company name or ticker' } },
        required: ['company'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_financial_summary',
      description: 'Get normalized financial metrics, history, cash flow and capital-allocation data.',
      parameters: {
        type: 'object',
        properties: { company: { type: 'string', description: 'Company name or ticker' } },
        required: ['company'],
      },
    },
  },
] as const

export type ResearchFunction = (typeof RESEARCH_TOOL_FUNCTIONS)[number]
