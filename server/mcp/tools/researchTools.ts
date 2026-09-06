/**
 * Research MCP tool definitions, allow-list and mock handlers.
 *
 * This whole module serves DEMO / MOCK data. There is no real market feed — the
 * dataset below is hard-coded sample data. Every tool result is explicitly
 * labelled so the UI can render a "Demo / MCP Research Tool" data source block.
 *
 * The SAME `executeResearchTool` handler is used by:
 *   - the MCP server (`server.ts`) as the registered tool callback, and
 *   - the backend agent (`researchAgent.ts`) so execution is always the same
 *     and always server-controlled.
 */
import { z } from 'zod'

/** The exact set of tools the backend will allow. Anything else is rejected. */
export const RESEARCH_TOOL_NAMES = [
  'search_company',
  'get_company_profile',
  'get_financial_summary',
] as const

export type ResearchToolName = (typeof RESEARCH_TOOL_NAMES)[number]

/** Human-readable label shown to the user. */
export const RESEARCH_SOURCE_LABEL = 'MCP Research Tool (Demo Data)'

/** Raised whenever a tool is unknown, mis-used or fails — never crashes Node. */
export class ResearchToolError extends Error {
  readonly code: string
  constructor(message: string, code = 'TOOL_ERROR') {
    super(message)
    this.name = 'ResearchToolError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Mock dataset
// ---------------------------------------------------------------------------

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
}

export interface FinancialSummary {
  currency: string
  fiscalYear: string
  revenue: { label: string; value: string }[]
  growth: { label: string; value: string }[]
  profitability: { label: string; value: string }[]
  valuation: { label: string; value: string }[]
  comment: string
}

interface ResearchCompany {
  profile: CompanyProfile
  financial: FinancialSummary
}

const COMPANIES: Record<string, ResearchCompany> = {
  nvidia: {
    profile: {
      id: 'nvidia',
      name: 'NVIDIA',
      ticker: 'NVDA',
      sector: 'Technology',
      industry: 'Semiconductors',
      headquarters: 'Santa Clara, CA',
      founded: 1993,
      employees: '~30,000',
      description:
        'Designer of GPU and AI accelerators, the dominant supplier of compute for AI training and inference.',
      highlights: ['AI accelerator market leader', 'CUDA software ecosystem', 'Data-center revenue growth'],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2025 (demo)',
      revenue: [
        { label: 'Data Center', value: '$91.5B' },
        { label: 'Gaming', value: '$13.2B' },
        { label: 'Others', value: '$3.5B' },
      ],
      growth: [
        { label: 'Revenue YoY', value: '+114%' },
        { label: 'EPS YoY', value: '+150%' },
      ],
      profitability: [
        { label: 'Gross Margin', value: '73%' },
        { label: 'Operating Margin', value: '61%' },
      ],
      valuation: [
        { label: 'P/E (fwd)', value: '48x' },
        { label: 'Market Cap', value: '$3.4T' },
      ],
      comment: 'Demo values, not a live data feed.',
    },
  },
  amd: {
    profile: {
      id: 'amd',
      name: 'Advanced Micro Devices',
      ticker: 'AMD',
      sector: 'Technology',
      industry: 'Semiconductors',
      headquarters: 'Santa Clara, CA',
      founded: 1969,
      employees: '~26,000',
      description:
        'Fabless maker of CPUs (EPYC/Ryzen) and GPUs (Instinct/Radeon), NVIDIA’s closest rival in AI accelerators.',
      highlights: ['EPYC server CPU share gains', 'Instinct AI GPUs', 'Xilinx embedded portfolio'],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2024 (demo)',
      revenue: [
        { label: 'Data Center', value: '$12.6B' },
        { label: 'Client', value: '$6.2B' },
        { label: 'Gaming + Embedded', value: '$5.9B' },
      ],
      growth: [
        { label: 'Revenue YoY', value: '+13%' },
        { label: 'EPS YoY', value: '+24%' },
      ],
      profitability: [
        { label: 'Gross Margin', value: '52%' },
        { label: 'Operating Margin', value: '21%' },
      ],
      valuation: [
        { label: 'P/E (fwd)', value: '62x' },
        { label: 'Market Cap', value: '$270B' },
      ],
      comment: 'Demo values, not a live data feed.',
    },
  },
  apple: {
    profile: {
      id: 'apple',
      name: 'Apple',
      ticker: 'AAPL',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      headquarters: 'Cupertino, CA',
      founded: 1976,
      employees: '~160,000',
      description: 'Designer of iPhone, Mac, iPad, wearables and services ecosystem.',
      highlights: ['Services growth', 'Large installed base', 'Premium hardware'],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2025 (demo)',
      revenue: [
        { label: 'Products', value: '$320B' },
        { label: 'Services', value: '$95B' },
      ],
      growth: [
        { label: 'Revenue YoY', value: '+7%' },
        { label: 'EPS YoY', value: '+9%' },
      ],
      profitability: [
        { label: 'Gross Margin', value: '46%' },
        { label: 'Operating Margin', value: '31%' },
      ],
      valuation: [
        { label: 'P/E (fwd)', value: '34x' },
        { label: 'Market Cap', value: '$3.6T' },
      ],
      comment: 'Demo values, not a live data feed.',
    },
  },
  microsoft: {
    profile: {
      id: 'microsoft',
      name: 'Microsoft',
      ticker: 'MSFT',
      sector: 'Technology',
      industry: 'Software & Cloud',
      headquarters: 'Redmond, WA',
      founded: 1975,
      employees: '~228,000',
      description: 'Cloud (Azure), productivity (Office/Copilot) and gaming (Xbox) platforms.',
      highlights: ['Azure growth', 'Copilot monetization', 'AI capex'],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2025 (demo)',
      revenue: [
        { label: 'Intelligent Cloud', value: '$112B' },
        { label: 'Productivity & Business', value: '$78B' },
        { label: 'More Personal Computing', value: '$54B' },
      ],
      growth: [
        { label: 'Revenue YoY', value: '+15%' },
        { label: 'EPS YoY', value: '+20%' },
      ],
      profitability: [
        { label: 'Gross Margin', value: '70%' },
        { label: 'Operating Margin', value: '45%' },
      ],
      valuation: [
        { label: 'P/E (fwd)', value: '40x' },
        { label: 'Market Cap', value: '$3.5T' },
      ],
      comment: 'Demo values, not a live data feed.',
    },
  },
  tesla: {
    profile: {
      id: 'tesla',
      name: 'Tesla',
      ticker: 'TSLA',
      sector: 'Consumer Discretionary',
      industry: 'Automotive / Energy',
      headquarters: 'Austin, TX',
      founded: 2003,
      employees: '~140,000',
      description: 'Electric vehicles, energy storage and a growing robotics/AI ambition.',
      highlights: ['EV delivery volume', 'Energy storage growth', 'Full self-driving'],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2025 (demo)',
      revenue: [
        { label: 'Automotive', value: '$78B' },
        { label: 'Energy generation', value: '$9B' },
        { label: 'Services & other', value: '$8B' },
      ],
      growth: [
        { label: 'Revenue YoY', value: '+4%' },
        { label: 'EPS YoY', value: '-15%' },
      ],
      profitability: [
        { label: 'Gross Margin', value: '18%' },
        { label: 'Operating Margin', value: '7%' },
      ],
      valuation: [
        { label: 'P/E (fwd)', value: '110x' },
        { label: 'Market Cap', value: '$1.1T' },
      ],
      comment: 'Demo values, not a live data feed.',
    },
  },
}

// ---------------------------------------------------------------------------
// Argument schemas (zod raw shapes used to register MCP tools)
// ---------------------------------------------------------------------------

export const searchCompanyArgs = { query: z.string().min(1) }
export const getCompanyProfileArgs = { company: z.string().min(1) }
export const getFinancialSummaryArgs = { company: z.string().min(1) }

function findCompany(raw: unknown): ResearchCompany {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!key) throw new ResearchToolError('Missing company name / ticker', 'BAD_ARGS')
  const hit = COMPANIES[key]
  if (hit) return hit
  const fuzzy = Object.values(COMPANIES).find(
    (c) => c.profile.name.toLowerCase().includes(key) || c.profile.ticker.toLowerCase().includes(key),
  )
  if (fuzzy) return fuzzy
  throw new ResearchToolError(`Unknown company: "${raw}"`, 'NOT_FOUND')
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export interface ResearchToolResult {
  /** Human- / LLM-readable text (goes into MCP content[0].text). */
  text: string
  /** Structured payload (goes into MCP structuredContent). */
  data: unknown
}

function searchCompanies(query: string): ResearchToolResult {
  const q = query.trim().toLowerCase()
  const matches = Object.values(COMPANIES).filter(
    (c) =>
      c.profile.name.toLowerCase().includes(q) ||
      c.profile.ticker.toLowerCase().includes(q) ||
      c.profile.sector.toLowerCase().includes(q),
  )
  const list = matches.map((c) => ({
    id: c.profile.id,
    name: c.profile.name,
    ticker: c.profile.ticker,
    sector: c.profile.sector,
    industry: c.profile.industry,
  }))
  const text = [
    `Source: ${RESEARCH_SOURCE_LABEL}`,
    `Search results for "${query}":`,
    ...list.map((c) => `- ${c.name} (${c.ticker}) — ${c.industry}`),
  ].join('\n')
  return { text, data: { source: RESEARCH_SOURCE_LABEL, query, results: list } }
}

function companyProfile(company: string): ResearchToolResult {
  const c = findCompany(company)
  const p = c.profile
  const text = [
    `Source: ${RESEARCH_SOURCE_LABEL}`,
    `# ${p.name} (${p.ticker})`,
    `Sector: ${p.sector} | Industry: ${p.industry}`,
    `HQ: ${p.headquarters} | Founded: ${p.founded} | Employees: ${p.employees}`,
    p.description,
    'Highlights:',
    ...p.highlights.map((h) => `- ${h}`),
  ].join('\n')
  return { text, data: { source: RESEARCH_SOURCE_LABEL, profile: p } }
}

function financialSummary(company: string): ResearchToolResult {
  const c = findCompany(company)
  const f = c.financial
  const rows = (label: string, items: { label: string; value: string }[]) =>
    items.map((i) => `${label} ${i.label}: ${i.value}`).join('\n')
  const text = [
    `Source: ${RESEARCH_SOURCE_LABEL}`,
    `Financial summary for ${c.profile.name} (${c.profile.ticker}) — ${f.fiscalYear}`,
    rows('Revenue', f.revenue),
    rows('Growth', f.growth),
    rows('Profitability', f.profitability),
    rows('Valuation', f.valuation),
    f.comment,
  ].join('\n')
  return { text, data: { source: RESEARCH_SOURCE_LABEL, company: c.profile.name, financial: f } }
}

/**
 * Validate the raw tool name against the allow-list and execute the handler.
 * This is the single backend-controlled execution point — the LLM never runs it.
 */
export function executeResearchTool(name: string, args: unknown): ResearchToolResult {
  if (!(RESEARCH_TOOL_NAMES as readonly string[]).includes(name)) {
    throw new ResearchToolError(`Unknown tool: "${name}"`, 'UNKNOWN_TOOL')
  }
  const argObj = (args ?? {}) as Record<string, unknown>
  if (name === 'search_company') return searchCompanies(String(argObj.query ?? ''))
  if (name === 'get_company_profile') return companyProfile(String(argObj.company ?? ''))
  if (name === 'get_financial_summary') return financialSummary(String(argObj.company ?? ''))
  throw new ResearchToolError(`No handler for: "${name}"`, 'NO_HANDLER')
}

// ---------------------------------------------------------------------------
// DeepSeek (OpenAI-compatible) function definitions
// ---------------------------------------------------------------------------
// These just describe the tool to the LLM so it can pick a tool + args. The
// backend, NOT the LLM, actually executes the call.
export const RESEARCH_TOOL_FUNCTIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_company',
      description:
        'Search the mock research company universe by name or ticker. Call this when the user mentions a company or asks you to identify one.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Company name or ticker, e.g. "NVIDIA" or "NVDA"' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_company_profile',
      description:
        'Get the business profile (sector, industry, HQ, description) for a company by name or ticker.',
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
      description:
        'Get financial metrics (revenue breakdown, growth, profitability, valuation) for a company by name or ticker.',
      parameters: {
        type: 'object',
        properties: { company: { type: 'string', description: 'Company name or ticker' } },
        required: ['company'],
      },
    },
  },
] as const

export type ResearchFunction = (typeof RESEARCH_TOOL_FUNCTIONS)[number]
