/**
 * Research MCP tool definitions, allow-list and mock handlers.
 *
 * This module intentionally serves DEMO / MOCK data. The dataset is richer than
 * a simple company profile so the Generative UI can exercise time-series charts,
 * comparisons, segment analysis, technology/product views, market context and
 * risk summaries without pretending to be a live market feed.
 */
import { z } from 'zod'

export const RESEARCH_TOOL_NAMES = [
  'search_company',
  'get_company_profile',
  'get_financial_summary',
] as const

export type ResearchToolName = (typeof RESEARCH_TOOL_NAMES)[number]
export const RESEARCH_SOURCE_LABEL = 'MCP Research Tool (Demo Data)'

export class ResearchToolError extends Error {
  readonly code: string
  constructor(message: string, code = 'TOOL_ERROR') {
    super(message)
    this.name = 'ResearchToolError'
    this.code = code
  }
}

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
      description: 'Designer of GPU and AI accelerators with a broad accelerated-computing software ecosystem.',
      highlights: ['AI accelerator market leader', 'CUDA software ecosystem', 'Data-center revenue growth'],
      market: {
        position: 'Leader in data-center AI accelerators; expanding from chips into rack-scale systems.',
        sentiment: 'positive',
        competitors: ['AMD', 'Intel', 'Google TPU', 'AWS Trainium', 'custom ASIC vendors'],
        marketShare: [
          { segment: 'AI accelerator (demo)', value: 82, unit: '%' },
          { segment: 'Discrete GPU (demo)', value: 78, unit: '%' },
        ],
        geographies: [
          { region: 'North America', exposure: 'Very high cloud and hyperscaler demand' },
          { region: 'Asia', exposure: 'Important demand with export-control constraints' },
          { region: 'Europe', exposure: 'Growing sovereign-AI and enterprise demand' },
        ],
        recentEvents: [
          { date: '2025-Q1', title: 'Blackwell production ramp', impact: 'positive' },
          { date: '2025-Q2', title: 'Rack-scale GB200 adoption broadens', impact: 'positive' },
          { date: '2025-Q3', title: 'Export-control uncertainty remains', impact: 'negative' },
        ],
      },
      technology: {
        products: [
          { name: 'H200', category: 'AI accelerator', stage: 'current' },
          { name: 'B200', category: 'Blackwell GPU', stage: 'current' },
          { name: 'GB200 NVL72', category: 'rack-scale system', stage: 'current' },
          { name: 'Rubin', category: 'next-gen platform', stage: 'next' },
        ],
        roadmap: [
          { period: '2025', milestone: 'Blackwell and GB200 platform scale-out' },
          { period: '2026', milestone: 'Rubin platform transition (demo roadmap)' },
          { period: '2027', milestone: 'Higher-density rack-scale systems (demo roadmap)' },
        ],
        strengths: ['CUDA developer ecosystem', 'NVLink / networking integration', 'Full-stack hardware + software platform'],
        ecosystem: ['CUDA', 'TensorRT', 'NCCL', 'DGX / HGX', 'Spectrum-X'],
        rdIntensity: 'High',
        moat: 'Developer lock-in plus rapid platform cadence and integrated networking.',
      },
      risks: [
        { category: 'valuation', level: 'high', detail: 'Premium valuation leaves little room for AI demand disappointment.' },
        { category: 'competition', level: 'medium', detail: 'AMD and custom accelerators continue to improve.' },
        { category: 'regulation', level: 'high', detail: 'Export controls can restrict access to selected markets.' },
        { category: 'concentration', level: 'medium', detail: 'Large hyperscalers represent an important demand concentration.' },
      ],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2025 (demo)',
      revenue: [
        { label: 'Data Center', value: '$91.5B' },
        { label: 'Gaming', value: '$13.2B' },
        { label: 'Professional Visualization', value: '$1.9B' },
        { label: 'Automotive + OEM', value: '$1.6B' },
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
      history: [
        { period: '2024 Q1', revenueB: 26.0, grossMarginPct: 78.4, operatingMarginPct: 59.3, eps: 5.98 },
        { period: '2024 Q2', revenueB: 30.0, grossMarginPct: 75.1, operatingMarginPct: 62.1, eps: 6.12 },
        { period: '2024 Q3', revenueB: 35.1, grossMarginPct: 74.6, operatingMarginPct: 62.8, eps: 6.81 },
        { period: '2024 Q4', revenueB: 39.3, grossMarginPct: 73.0, operatingMarginPct: 61.0, eps: 7.25 },
        { period: '2025 Q1', revenueB: 44.1, grossMarginPct: 72.5, operatingMarginPct: 60.5, eps: 7.91 },
        { period: '2025 Q2', revenueB: 47.0, grossMarginPct: 72.8, operatingMarginPct: 61.2, eps: 8.34 },
        { period: '2025 Q3', revenueB: 51.2, grossMarginPct: 73.2, operatingMarginPct: 62.0, eps: 8.90 },
        { period: '2025 Q4', revenueB: 55.0, grossMarginPct: 73.5, operatingMarginPct: 62.5, eps: 9.40 },
      ],
      cashFlow: [
        { label: 'Free cash flow', value: '$60B (demo)' },
        { label: 'Cash & investments', value: '$43B (demo)' },
      ],
      capitalAllocation: [
        { label: 'Share repurchases', value: '$25B (demo)' },
        { label: 'Dividend', value: 'Small / symbolic (demo)' },
      ],
      comment: 'Demo values for UI and workflow testing; not a live feed.',
    },
  },
  amd: {
    profile: {
      id: 'amd',
      name: 'AMD',
      ticker: 'AMD',
      sector: 'Technology',
      industry: 'Semiconductors',
      headquarters: 'Santa Clara, CA',
      founded: 1969,
      employees: '~26,000',
      description: 'Fabless semiconductor company spanning server CPUs, client CPUs, GPUs and embedded products.',
      highlights: ['EPYC server CPU share gains', 'Instinct AI accelerator expansion', 'Broad CPU/GPU portfolio'],
      market: {
        position: 'Strong challenger across server CPU and AI accelerator markets.',
        sentiment: 'positive',
        competitors: ['NVIDIA', 'Intel', 'custom cloud accelerators'],
        marketShare: [
          { segment: 'Server CPU (demo)', value: 24, unit: '%' },
          { segment: 'AI accelerator (demo)', value: 11, unit: '%' },
        ],
        geographies: [
          { region: 'North America', exposure: 'Strong hyperscaler and enterprise demand' },
          { region: 'Asia', exposure: 'Important OEM and cloud exposure' },
          { region: 'Europe', exposure: 'Growing data-center footprint' },
        ],
        recentEvents: [
          { date: '2025-Q1', title: 'MI300 platform adoption expands', impact: 'positive' },
          { date: '2025-Q2', title: 'EPYC gains additional cloud instances', impact: 'positive' },
          { date: '2025-Q3', title: 'AI software ecosystem remains a key execution focus', impact: 'neutral' },
        ],
      },
      technology: {
        products: [
          { name: 'EPYC Turin', category: 'server CPU', stage: 'current' },
          { name: 'MI300X', category: 'AI accelerator', stage: 'current' },
          { name: 'Ryzen AI', category: 'client CPU/NPU', stage: 'current' },
          { name: 'MI400 family', category: 'next-gen AI accelerator', stage: 'next' },
        ],
        roadmap: [
          { period: '2025', milestone: 'Broaden MI300 software and customer deployments' },
          { period: '2026', milestone: 'MI400 generation (demo roadmap)' },
          { period: '2027', milestone: 'Higher integration across CPU + GPU systems (demo roadmap)' },
        ],
        strengths: ['Chiplet architecture', 'Strong server CPU performance', 'Open ROCm software direction'],
        ecosystem: ['ROCm', 'EPYC platform', 'Xilinx adaptive compute', 'Ryzen AI'],
        rdIntensity: 'High',
        moat: 'Execution across chiplets, CPUs and accelerators with a broad x86 customer base.',
      },
      risks: [
        { category: 'competition', level: 'high', detail: 'Competes against NVIDIA in AI and Intel in CPUs simultaneously.' },
        { category: 'execution', level: 'medium', detail: 'ROCm ecosystem maturity is critical for AI accelerator adoption.' },
        { category: 'supply-chain', level: 'medium', detail: 'Advanced foundry and packaging capacity remains strategically important.' },
        { category: 'valuation', level: 'medium', detail: 'AI expectations can make valuation sensitive to execution.' },
      ],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2025 (demo)',
      revenue: [
        { label: 'Data Center', value: '$12.6B' },
        { label: 'Client', value: '$6.2B' },
        { label: 'Gaming', value: '$3.1B' },
        { label: 'Embedded', value: '$2.8B' },
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
      history: [
        { period: '2024 Q1', revenueB: 5.5, grossMarginPct: 50.0, operatingMarginPct: 16.0, eps: 0.62 },
        { period: '2024 Q2', revenueB: 5.8, grossMarginPct: 50.5, operatingMarginPct: 17.2, eps: 0.69 },
        { period: '2024 Q3', revenueB: 6.1, grossMarginPct: 51.0, operatingMarginPct: 18.0, eps: 0.74 },
        { period: '2024 Q4', revenueB: 6.5, grossMarginPct: 51.3, operatingMarginPct: 18.8, eps: 0.81 },
        { period: '2025 Q1', revenueB: 6.8, grossMarginPct: 51.6, operatingMarginPct: 19.3, eps: 0.88 },
        { period: '2025 Q2', revenueB: 7.2, grossMarginPct: 52.0, operatingMarginPct: 20.0, eps: 0.96 },
        { period: '2025 Q3', revenueB: 7.7, grossMarginPct: 52.4, operatingMarginPct: 20.8, eps: 1.04 },
        { period: '2025 Q4', revenueB: 8.1, grossMarginPct: 52.8, operatingMarginPct: 21.5, eps: 1.12 },
      ],
      cashFlow: [
        { label: 'Free cash flow', value: '$3.4B (demo)' },
        { label: 'Cash & investments', value: '$6.0B (demo)' },
      ],
      capitalAllocation: [
        { label: 'Share repurchases', value: '$1.0B (demo)' },
        { label: 'M&A / ecosystem investment', value: 'Moderate (demo)' },
      ],
      comment: 'Demo values for UI and workflow testing; not a live feed.',
    },
  },
  intel: {
    profile: {
      id: 'intel',
      name: 'Intel',
      ticker: 'INTC',
      sector: 'Technology',
      industry: 'Semiconductors',
      headquarters: 'Santa Clara, CA',
      founded: 1968,
      employees: '~125,000',
      description: 'Integrated semiconductor company spanning CPUs, foundry services, networking and accelerators.',
      highlights: ['Large x86 installed base', 'Foundry turnaround strategy', 'Packaging and manufacturing assets'],
      market: {
        position: 'Incumbent CPU leader defending share while building an external foundry business.',
        sentiment: 'mixed',
        competitors: ['AMD', 'NVIDIA', 'TSMC', 'Arm-based server vendors'],
        marketShare: [
          { segment: 'Server CPU (demo)', value: 66, unit: '%' },
          { segment: 'PC CPU (demo)', value: 72, unit: '%' },
        ],
        geographies: [
          { region: 'North America', exposure: 'Large enterprise and government footprint' },
          { region: 'Europe', exposure: 'Manufacturing expansion and policy support' },
          { region: 'Asia', exposure: 'Large PC/OEM supply chain exposure' },
        ],
        recentEvents: [
          { date: '2025-Q1', title: 'Foundry execution remains central to turnaround', impact: 'neutral' },
          { date: '2025-Q2', title: 'Xeon product cadence improves', impact: 'positive' },
          { date: '2025-Q3', title: 'Margin pressure remains elevated', impact: 'negative' },
        ],
      },
      technology: {
        products: [
          { name: 'Xeon 6', category: 'server CPU', stage: 'current' },
          { name: 'Core Ultra', category: 'client CPU', stage: 'current' },
          { name: 'Gaudi 3', category: 'AI accelerator', stage: 'current' },
          { name: '18A', category: 'foundry process', stage: 'next' },
        ],
        roadmap: [
          { period: '2025', milestone: 'Ramp Xeon 6 and advanced packaging' },
          { period: '2026', milestone: '18A process scale-up (demo roadmap)' },
          { period: '2027', milestone: 'External foundry mix expansion (demo roadmap)' },
        ],
        strengths: ['x86 ecosystem', 'Advanced packaging', 'Domestic manufacturing footprint'],
        ecosystem: ['oneAPI', 'Xeon', 'Intel Foundry', 'Gaudi'],
        rdIntensity: 'Very high',
        moat: 'Manufacturing footprint and entrenched enterprise CPU ecosystem, offset by execution complexity.',
      },
      risks: [
        { category: 'execution', level: 'high', detail: 'Foundry roadmap execution is the central strategic risk.' },
        { category: 'competition', level: 'high', detail: 'Share pressure from AMD, Arm and accelerator-centric architectures.' },
        { category: 'valuation', level: 'medium', detail: 'Turnaround valuation depends on margin recovery.' },
        { category: 'concentration', level: 'medium', detail: 'PC and server cycles remain important to results.' },
      ],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2025 (demo)',
      revenue: [
        { label: 'Client Computing', value: '$29.0B' },
        { label: 'Data Center & AI', value: '$13.5B' },
        { label: 'Network & Edge', value: '$5.5B' },
        { label: 'Foundry', value: '$4.8B' },
      ],
      growth: [
        { label: 'Revenue YoY', value: '+3%' },
        { label: 'EPS YoY', value: '+8%' },
      ],
      profitability: [
        { label: 'Gross Margin', value: '43%' },
        { label: 'Operating Margin', value: '9%' },
      ],
      valuation: [
        { label: 'P/E (fwd)', value: '31x' },
        { label: 'Market Cap', value: '$140B' },
      ],
      history: [
        { period: '2024 Q1', revenueB: 12.7, grossMarginPct: 41.0, operatingMarginPct: 6.0, eps: 0.18 },
        { period: '2024 Q2', revenueB: 12.8, grossMarginPct: 41.5, operatingMarginPct: 6.8, eps: 0.20 },
        { period: '2024 Q3', revenueB: 13.0, grossMarginPct: 42.0, operatingMarginPct: 7.3, eps: 0.22 },
        { period: '2024 Q4', revenueB: 13.2, grossMarginPct: 42.2, operatingMarginPct: 7.8, eps: 0.24 },
        { period: '2025 Q1', revenueB: 13.4, grossMarginPct: 42.5, operatingMarginPct: 8.1, eps: 0.26 },
        { period: '2025 Q2', revenueB: 13.6, grossMarginPct: 42.8, operatingMarginPct: 8.5, eps: 0.28 },
        { period: '2025 Q3', revenueB: 13.9, grossMarginPct: 43.0, operatingMarginPct: 8.9, eps: 0.30 },
        { period: '2025 Q4', revenueB: 14.2, grossMarginPct: 43.4, operatingMarginPct: 9.3, eps: 0.33 },
      ],
      cashFlow: [
        { label: 'Free cash flow', value: '-$1.5B (demo)' },
        { label: 'Cash & investments', value: '$24B (demo)' },
      ],
      capitalAllocation: [
        { label: 'Manufacturing capex', value: 'Very high (demo)' },
        { label: 'Dividend', value: 'Reduced payout (demo)' },
      ],
      comment: 'Demo values for UI and workflow testing; not a live feed.',
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
      description: 'Cloud, productivity, developer tools and gaming platform company with broad enterprise distribution.',
      highlights: ['Azure growth', 'Copilot monetization', 'Large enterprise installed base'],
      market: {
        position: 'Leading enterprise software and cloud platform with broad AI distribution.',
        sentiment: 'positive',
        competitors: ['Amazon AWS', 'Google Cloud', 'Salesforce', 'Oracle'],
        marketShare: [
          { segment: 'Cloud infrastructure (demo)', value: 25, unit: '%' },
          { segment: 'Enterprise productivity (demo)', value: 46, unit: '%' },
        ],
        geographies: [
          { region: 'North America', exposure: 'Largest enterprise and cloud market' },
          { region: 'Europe', exposure: 'Large enterprise installed base' },
          { region: 'Asia', exposure: 'Growing cloud and productivity demand' },
        ],
        recentEvents: [
          { date: '2025-Q1', title: 'Copilot seats expand across enterprise', impact: 'positive' },
          { date: '2025-Q2', title: 'AI infrastructure capex remains elevated', impact: 'neutral' },
          { date: '2025-Q3', title: 'Azure AI services broaden monetization', impact: 'positive' },
        ],
      },
      technology: {
        products: [
          { name: 'Azure AI', category: 'cloud AI platform', stage: 'current' },
          { name: 'Microsoft 365 Copilot', category: 'productivity AI', stage: 'current' },
          { name: 'GitHub Copilot', category: 'developer AI', stage: 'current' },
          { name: 'Custom AI silicon', category: 'cloud infrastructure', stage: 'next' },
        ],
        roadmap: [
          { period: '2025', milestone: 'Broaden Copilot distribution and Azure AI capacity' },
          { period: '2026', milestone: 'Deeper agentic workflows across Microsoft 365 (demo roadmap)' },
          { period: '2027', milestone: 'More vertically integrated cloud AI infrastructure (demo roadmap)' },
        ],
        strengths: ['Enterprise distribution', 'Azure cloud footprint', 'Developer ecosystem'],
        ecosystem: ['Azure', 'Microsoft 365', 'GitHub', 'Windows', 'Power Platform'],
        rdIntensity: 'High',
        moat: 'Enterprise distribution and cross-product data/workflow integration.',
      },
      risks: [
        { category: 'regulation', level: 'medium', detail: 'Cloud and AI market power attracts regulatory scrutiny.' },
        { category: 'competition', level: 'medium', detail: 'AWS and Google compete aggressively in cloud and AI.' },
        { category: 'valuation', level: 'medium', detail: 'AI monetization must justify elevated infrastructure spending.' },
        { category: 'execution', level: 'medium', detail: 'Large AI capex program must translate into durable revenue.' },
      ],
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
      history: [
        { period: '2024 Q1', revenueB: 61.9, grossMarginPct: 69.0, operatingMarginPct: 44.0, eps: 2.94 },
        { period: '2024 Q2', revenueB: 64.7, grossMarginPct: 69.3, operatingMarginPct: 44.2, eps: 3.08 },
        { period: '2024 Q3', revenueB: 65.6, grossMarginPct: 69.5, operatingMarginPct: 44.4, eps: 3.18 },
        { period: '2024 Q4', revenueB: 69.6, grossMarginPct: 69.8, operatingMarginPct: 44.6, eps: 3.27 },
        { period: '2025 Q1', revenueB: 71.0, grossMarginPct: 70.0, operatingMarginPct: 44.8, eps: 3.36 },
        { period: '2025 Q2', revenueB: 73.4, grossMarginPct: 70.1, operatingMarginPct: 45.0, eps: 3.45 },
        { period: '2025 Q3', revenueB: 76.1, grossMarginPct: 70.2, operatingMarginPct: 45.2, eps: 3.56 },
        { period: '2025 Q4', revenueB: 79.0, grossMarginPct: 70.4, operatingMarginPct: 45.5, eps: 3.68 },
      ],
      cashFlow: [
        { label: 'Free cash flow', value: '$76B (demo)' },
        { label: 'Cash & investments', value: '$80B (demo)' },
      ],
      capitalAllocation: [
        { label: 'AI / cloud capex', value: '$62B (demo)' },
        { label: 'Dividend + buybacks', value: '$35B (demo)' },
      ],
      comment: 'Demo values for UI and workflow testing; not a live feed.',
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
      description: 'Premium device and services ecosystem spanning iPhone, Mac, iPad, wearables and digital services.',
      highlights: ['Large installed base', 'Services monetization', 'Vertical hardware/software integration'],
      market: {
        position: 'Premium consumer-device ecosystem with unusually strong monetization per user.',
        sentiment: 'neutral',
        competitors: ['Samsung', 'Google', 'Microsoft', 'Huawei'],
        marketShare: [
          { segment: 'Premium smartphones (demo)', value: 61, unit: '%' },
          { segment: 'Tablets (demo)', value: 36, unit: '%' },
        ],
        geographies: [
          { region: 'Americas', exposure: 'Largest revenue region' },
          { region: 'Greater China', exposure: 'Large but competitively sensitive market' },
          { region: 'Europe', exposure: 'Large installed base and services demand' },
        ],
        recentEvents: [
          { date: '2025-Q1', title: 'Services mix continues to rise', impact: 'positive' },
          { date: '2025-Q2', title: 'AI-device positioning remains a key narrative', impact: 'neutral' },
          { date: '2025-Q3', title: 'China competition remains intense', impact: 'negative' },
        ],
      },
      technology: {
        products: [
          { name: 'iPhone', category: 'smartphone', stage: 'current' },
          { name: 'Apple Silicon', category: 'custom processor', stage: 'current' },
          { name: 'Vision Pro', category: 'spatial computing', stage: 'current' },
          { name: 'On-device AI stack', category: 'AI platform', stage: 'next' },
        ],
        roadmap: [
          { period: '2025', milestone: 'Expand on-device AI features' },
          { period: '2026', milestone: 'Broader custom-silicon integration (demo roadmap)' },
          { period: '2027', milestone: 'Deeper services + device AI integration (demo roadmap)' },
        ],
        strengths: ['Custom silicon', 'Vertical OS/hardware integration', 'Large developer and services ecosystem'],
        ecosystem: ['iOS', 'macOS', 'App Store', 'Apple Silicon', 'iCloud'],
        rdIntensity: 'High',
        moat: 'Installed base, premium brand and vertically integrated hardware/software ecosystem.',
      },
      risks: [
        { category: 'regulation', level: 'high', detail: 'App-store rules and platform economics face regulatory pressure.' },
        { category: 'concentration', level: 'high', detail: 'iPhone remains the largest product family.' },
        { category: 'competition', level: 'medium', detail: 'China smartphone competition and AI differentiation are important.' },
        { category: 'valuation', level: 'medium', detail: 'Premium multiple depends on services growth and ecosystem durability.' },
      ],
    },
    financial: {
      currency: 'USD',
      fiscalYear: 'FY2025 (demo)',
      revenue: [
        { label: 'iPhone', value: '$205B' },
        { label: 'Services', value: '$95B' },
        { label: 'Mac + iPad', value: '$58B' },
        { label: 'Wearables + Home', value: '$37B' },
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
      history: [
        { period: '2024 Q1', revenueB: 90.8, grossMarginPct: 45.5, operatingMarginPct: 30.2, eps: 1.53 },
        { period: '2024 Q2', revenueB: 85.8, grossMarginPct: 45.8, operatingMarginPct: 30.4, eps: 1.40 },
        { period: '2024 Q3', revenueB: 94.9, grossMarginPct: 46.0, operatingMarginPct: 30.7, eps: 1.64 },
        { period: '2024 Q4', revenueB: 124.3, grossMarginPct: 46.2, operatingMarginPct: 31.0, eps: 2.05 },
        { period: '2025 Q1', revenueB: 96.0, grossMarginPct: 46.2, operatingMarginPct: 31.0, eps: 1.68 },
        { period: '2025 Q2', revenueB: 89.0, grossMarginPct: 46.4, operatingMarginPct: 31.1, eps: 1.55 },
        { period: '2025 Q3', revenueB: 99.0, grossMarginPct: 46.5, operatingMarginPct: 31.3, eps: 1.75 },
        { period: '2025 Q4', revenueB: 130.0, grossMarginPct: 46.7, operatingMarginPct: 31.5, eps: 2.18 },
      ],
      cashFlow: [
        { label: 'Free cash flow', value: '$105B (demo)' },
        { label: 'Net cash / debt', value: 'Near neutral (demo)' },
      ],
      capitalAllocation: [
        { label: 'Share repurchases', value: '$90B (demo)' },
        { label: 'Dividend', value: '$15B (demo)' },
      ],
      comment: 'Demo values for UI and workflow testing; not a live feed.',
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
      description: 'Electric vehicles, energy storage and robotics/AI ambitions.',
      highlights: ['EV scale', 'Energy storage growth', 'Vertical software integration'],
      market: {
        position: 'Large EV and energy-storage brand with high investor sensitivity to future autonomy/robotics.',
        sentiment: 'mixed',
        competitors: ['BYD', 'Volkswagen', 'Hyundai/Kia', 'traditional OEMs'],
        marketShare: [{ segment: 'Global BEV (demo)', value: 15, unit: '%' }],
        geographies: [{ region: 'Global', exposure: 'Large US, China and Europe exposure' }],
        recentEvents: [{ date: '2025-Q2', title: 'Energy storage growth offsets softer auto mix', impact: 'neutral' }],
      },
      technology: {
        products: [
          { name: 'Model 3/Y', category: 'EV', stage: 'current' },
          { name: 'Megapack', category: 'energy storage', stage: 'current' },
          { name: 'FSD', category: 'autonomy software', stage: 'current' },
          { name: 'Optimus', category: 'robotics', stage: 'next' },
        ],
        roadmap: [{ period: '2026', milestone: 'Broader autonomy and robotics deployment (demo roadmap)' }],
        strengths: ['Vehicle software integration', 'Manufacturing scale', 'Energy + charging ecosystem'],
        ecosystem: ['Supercharger', 'FSD', 'Megapack', 'Tesla Energy'],
        rdIntensity: 'High',
        moat: 'Brand, charging footprint and vertically integrated software/data loop.',
      },
      risks: [
        { category: 'competition', level: 'high', detail: 'EV pricing and product competition remain intense.' },
        { category: 'valuation', level: 'high', detail: 'Valuation embeds meaningful autonomy and robotics expectations.' },
      ],
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
      history: [
        { period: '2024 Q1', revenueB: 21.3, grossMarginPct: 17.4, operatingMarginPct: 5.5, eps: 0.45 },
        { period: '2024 Q2', revenueB: 25.5, grossMarginPct: 18.0, operatingMarginPct: 6.3, eps: 0.52 },
        { period: '2024 Q3', revenueB: 25.2, grossMarginPct: 18.2, operatingMarginPct: 6.5, eps: 0.56 },
        { period: '2024 Q4', revenueB: 27.0, grossMarginPct: 18.4, operatingMarginPct: 6.8, eps: 0.61 },
        { period: '2025 Q1', revenueB: 23.0, grossMarginPct: 18.0, operatingMarginPct: 6.4, eps: 0.50 },
        { period: '2025 Q2', revenueB: 25.8, grossMarginPct: 18.2, operatingMarginPct: 6.7, eps: 0.55 },
        { period: '2025 Q3', revenueB: 26.5, grossMarginPct: 18.5, operatingMarginPct: 7.0, eps: 0.59 },
        { period: '2025 Q4', revenueB: 28.2, grossMarginPct: 18.8, operatingMarginPct: 7.3, eps: 0.64 },
      ],
      cashFlow: [{ label: 'Free cash flow', value: '$6B (demo)' }],
      capitalAllocation: [{ label: 'Growth capex', value: '$11B (demo)' }],
      comment: 'Demo values for UI and workflow testing; not a live feed.',
    },
  },
}

export const searchCompanyArgs = { query: z.string().min(1) }
export const getCompanyProfileArgs = { company: z.string().min(1) }
export const getFinancialSummaryArgs = { company: z.string().min(1) }

function findCompany(raw: unknown): ResearchCompany {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!key) throw new ResearchToolError('Missing company name / ticker', 'BAD_ARGS')
  const aliases: Record<string, string> = {
    nvda: 'nvidia', amd: 'amd', intc: 'intel', intel: 'intel',
    msft: 'microsoft', microsoft: 'microsoft', aapl: 'apple', apple: 'apple',
    tsla: 'tesla', tesla: 'tesla',
  }
  const hit = COMPANIES[aliases[key] ?? key]
  if (hit) return hit
  const fuzzy = Object.values(COMPANIES).find(
    (c) => c.profile.name.toLowerCase().includes(key) || c.profile.ticker.toLowerCase().includes(key),
  )
  if (fuzzy) return fuzzy
  throw new ResearchToolError(`Unknown company: "${raw}"`, 'NOT_FOUND')
}

export interface ResearchToolResult {
  text: string
  data: unknown
}

function searchCompanies(query: string): ResearchToolResult {
  const q = query.trim().toLowerCase()
  const matches = Object.values(COMPANIES).filter(
    (c) =>
      c.profile.name.toLowerCase().includes(q) ||
      c.profile.ticker.toLowerCase().includes(q) ||
      c.profile.sector.toLowerCase().includes(q) ||
      c.profile.industry.toLowerCase().includes(q),
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
    `Market position: ${p.market.position}`,
    `Market sentiment: ${p.market.sentiment}`,
    `Competitors: ${p.market.competitors.join(', ')}`,
    `Technology moat: ${p.technology.moat}`,
    `Products: ${p.technology.products.map((item) => item.name).join(', ')}`,
    'Risks:',
    ...p.risks.map((risk) => `- [${risk.level}] ${risk.category}: ${risk.detail}`),
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
  const history = f.history.map((point) =>
    `${point.period}: revenue $${point.revenueB}B | gross margin ${point.grossMarginPct}% | operating margin ${point.operatingMarginPct}% | EPS ${point.eps}`)
  const text = [
    `Source: ${RESEARCH_SOURCE_LABEL}`,
    `Financial summary for ${c.profile.name} (${c.profile.ticker}) — ${f.fiscalYear}`,
    rows('Revenue', f.revenue),
    rows('Growth', f.growth),
    rows('Profitability', f.profitability),
    rows('Valuation', f.valuation),
    'Quarterly history:',
    ...history,
    rows('Cash flow', f.cashFlow),
    rows('Capital allocation', f.capitalAllocation),
    f.comment,
  ].join('\n')
  return { text, data: { source: RESEARCH_SOURCE_LABEL, company: c.profile.name, financial: f } }
}

export function executeResearchTool(name: string, args: unknown): ResearchToolResult {
  if (!(RESEARCH_TOOL_NAMES as readonly string[]).includes(name)) {
    throw new ResearchToolError(`Unknown tool: "${name}"`, 'UNKNOWN_TOOL')
  }
  const argObj = (args ?? {}) as Record<string, unknown>
  if (name === 'search_company') return searchCompanies(String(argObj.query ?? ''))
  if (name === 'get_company_profile') return companyProfile(String(argObj.company ?? ''))
  if (name === 'get_financial_summary') return financialSummary(String(argObj.company ?? ''))
  throw new ResearchToolError(`No handler for: ${name}`, 'NO_HANDLER')
}

export const RESEARCH_TOOL_FUNCTIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_company',
      description: 'Search the mock research company universe by name, ticker, sector or industry.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Company name or ticker, e.g. "NVIDIA", "INTC" or "MSFT"' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_company_profile',
      description: 'Get the demo business profile plus market context, competitors, technology/product data, events and risks for a company.',
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
      description: 'Get demo segment revenue, growth, profitability, valuation, 8-quarter history, cash flow and capital allocation for a company.',
      parameters: {
        type: 'object',
        properties: { company: { type: 'string', description: 'Company name or ticker' } },
        required: ['company'],
      },
    },
  },
] as const

export type ResearchFunction = (typeof RESEARCH_TOOL_FUNCTIONS)[number]
