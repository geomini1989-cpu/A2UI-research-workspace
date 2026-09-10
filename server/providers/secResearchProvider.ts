import { setTimeout as delay } from 'node:timers/promises'
import { config } from '../config.js'
import { requestSignal } from '../runtime/context.js'
import type { CompanyFinancialData, CompanyProfile, CompanySearchResult, FinancialHistoryPoint } from '../domain/research.js'
import { assertCompanyFinancialData, assertCompanyProfile } from '../domain/researchSchema.js'
import { ResearchProviderError, type ResearchDataProvider } from './researchProvider.js'

interface Company { cik_str: number; ticker: string; title: string }
export interface SecFact { start?: string; end: string; val: number; accn: string; form: string; filed: string; fy?: number; fp?: string }
export interface SecCompanyFacts { cik: number; entityName: string; facts: Record<string, Record<string, { units: Record<string, SecFact[]> }>> }
interface Submissions {
  name: string; sicDescription: string; description: string; tickers: string[];
  addresses: { business: { city: string; stateOrCountryDescription: string } };
  filings: { recent: { form: string[]; filingDate: string[]; reportDate: string[]; accessionNumber: string[] } };
}
const REVENUE = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax']
const CACHE_TTL = 6 * 60 * 60 * 1000
const annual = (fact: SecFact) => fact.start !== undefined && ['10-K', '10-K/A', '20-F', '20-F/A'].includes(fact.form)
  && (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000 >= 300
  && (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000 <= 400

// 同一报告期选最新披露，优先使用标准营收概念；不混入累计季度值。 / Use latest annual disclosures per period and preferred revenue concepts, excluding YTD quarters.
export function normalizeSecFinancials(data: SecCompanyFacts, ticker: string, retrievedAt: string): CompanyFinancialData {
  const facts = data.facts['us-gaap'] ?? {}
  const values = (tags: string[], unit = 'USD') => tags.flatMap(tag => (facts[tag]?.units[unit] ?? []).filter(annual))
  const lookup = (tags: string[], period: SecFact, unit = 'USD') => {
    for (const tag of tags) {
      const hit = values([tag], unit).filter(item => item.end === period.end && item.start === period.start).sort((a, b) => b.filed.localeCompare(a.filed))[0]
      if (hit) return hit.val
    }
    return undefined
  }
  const periods = [...new Set(values(REVENUE).map(item => item.end))].sort().slice(-5)
  const revenue = periods.map(end => {
    for (const tag of REVENUE) {
      const fact = values([tag]).filter(item => item.end === end).sort((a, b) => b.filed.localeCompare(a.filed))[0]
      if (fact) return fact
    }
    throw new Error('Annual revenue period not found')
  })
  if (revenue.length === 0) throw new ResearchProviderError('该公司暂无支持的 US-GAAP 年度营收披露，未生成估计值。', 'NOT_FOUND')
  const latest = revenue[revenue.length - 1]
  const history: FinancialHistoryPoint[] = revenue.map(period => {
    const gross = lookup(['GrossProfit'], period)
    const cost = lookup(['CostOfRevenue', 'CostOfGoodsAndServicesSold'], period)
    const operating = lookup(['OperatingIncomeLoss'], period)
    const grossValue = gross ?? (cost === undefined ? undefined : period.val - cost)
    return {
      period: period.end, revenueB: period.val / 1e9,
      grossMarginPct: grossValue === undefined || period.val === 0 ? undefined : grossValue / period.val * 100,
      operatingMarginPct: operating === undefined || period.val === 0 ? undefined : operating / period.val * 100,
      eps: lookup(['EarningsPerShareDiluted', 'EarningsPerShareBasic'], period, 'USD/shares'),
    }
  })
  const usd = (value: number) => '$' + (value / 1e9).toFixed(2) + 'B'
  const netIncome = lookup(['NetIncomeLoss', 'ProfitLoss'], latest)
  const cash = lookup(['NetCashProvidedByUsedInOperatingActivities'], latest)
  const capex = lookup(['PaymentsToAcquirePropertyPlantAndEquipment'], latest)
  const prior = revenue[revenue.length - 2]
  const point = history[history.length - 1]
  return assertCompanyFinancialData({
    company: data.entityName, ticker,
    source: { url: 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + String(data.cik).padStart(10, '0') + '.json', retrievedAt, period: latest.start + ' — ' + latest.end },
    financial: {
      currency: 'USD', fiscalYear: latest.start + ' — ' + latest.end,
      revenue: [{ label: 'Revenue', value: usd(latest.val) }],
      growth: prior && prior.val !== 0 ? [{ label: 'Revenue growth', value: ((latest.val - prior.val) / Math.abs(prior.val) * 100).toFixed(2) + '%' }] : [],
      profitability: [
        ...(netIncome === undefined ? [] : [{ label: 'Net income', value: usd(netIncome) }]),
        ...(point.grossMarginPct === undefined ? [] : [{ label: 'Gross margin', value: point.grossMarginPct.toFixed(2) + '%' }]),
        ...(point.operatingMarginPct === undefined ? [] : [{ label: 'Operating margin', value: point.operatingMarginPct.toFixed(2) + '%' }]),
      ],
      history, valuation: [],
      cashFlow: cash === undefined ? [] : [{ label: 'Operating cash flow', value: usd(cash) }, ...(capex === undefined ? [] : [{ label: 'Free cash flow', value: usd(cash - capex) }])],
      capitalAllocation: capex === undefined ? [] : [{ label: 'Capital expenditure', value: usd(capex) }],
      comment: 'SEC 年度财报；采用最新披露的同报告期数值。市场价格、估值、新闻和技术判断不在此数据源中，缺失项未填零。',
    },
  })
}

export class SecResearchProvider implements ResearchDataProvider {
  readonly metadata = { id: 'sec-edgar', name: 'SEC EDGAR', kind: 'live' as const, sourceLabel: 'SEC EDGAR 公开财报' }
  private readonly cache = new Map<string, { expires: number; value: unknown; retrievedAt: string }>()
  private nextRequestAt = 0
  private readonly fetchImpl: typeof fetch
  constructor(fetchImpl: typeof fetch = fetch) { this.fetchImpl = fetchImpl }
  private async json<T>(url: string): Promise<{ value: T; retrievedAt: string }> {
    const cached = this.cache.get(url)
    if (cached && cached.expires > Date.now()) return { value: cached.value as T, retrievedAt: cached.retrievedAt }
    const signal = requestSignal(30_000)
    const wait = Math.max(0, this.nextRequestAt - Date.now())
    this.nextRequestAt = Date.now() + wait + 200
    if (wait > 0) await delay(wait, undefined, { signal })
    const response = await this.fetchImpl(url, { headers: { 'User-Agent': config.secUserAgent, Accept: 'application/json' }, signal })
    if (!response.ok) throw new ResearchProviderError('SEC 请求失败（' + response.status + '），请检查访问标识或稍后重试。', 'UPSTREAM_ERROR')
    const value = await response.json() as T
    const retrievedAt = new Date().toISOString()
    if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(url, { expires: Date.now() + CACHE_TTL, value, retrievedAt })
    return { value, retrievedAt }
  }
  private async directory(): Promise<Company[]> {
    return Object.values((await this.json<Record<string, Company>>('https://www.sec.gov/files/company_tickers.json')).value)
  }
  async searchCompanies(query: string): Promise<CompanySearchResult[]> {
    const q = query.trim().toUpperCase()
    const tokens = new Set(query.match(/\$?[A-Z][A-Z0-9.-]{1,5}\b/g)?.map(item => item.replace('$', '')))
    return (await this.directory()).filter(company => company.ticker === q || company.title.toUpperCase().includes(q) || q.includes(company.title.toUpperCase()) || tokens.has(company.ticker))
      .slice(0, 8).map(company => ({ id: String(company.cik_str), name: company.title, ticker: company.ticker, sector: '未提供', industry: '未提供' }))
  }
  private async company(query: string): Promise<Company> {
    const q = query.trim().toUpperCase()
    const companies = await this.directory()
    const exact = companies.find(item => item.ticker === q || item.title.toUpperCase() === q)
    if (exact) return exact
    const matches = companies.filter(item => item.title.toUpperCase().includes(q))
    if (matches.length !== 1) throw new ResearchProviderError('公司名称未匹配或有歧义，请使用准确股票代码。', 'NOT_FOUND')
    return matches[0]
  }
  async getCompanyProfile(query: string): Promise<CompanyProfile> {
    const company = await this.company(query)
    const url = 'https://data.sec.gov/submissions/CIK' + String(company.cik_str).padStart(10, '0') + '.json'
    const { value: data, retrievedAt } = await this.json<Submissions>(url)
    return assertCompanyProfile({
      id: String(company.cik_str), name: data.name, ticker: company.ticker, sector: data.sicDescription || '未提供', industry: data.sicDescription || '未提供',
      headquarters: [data.addresses.business.city, data.addresses.business.stateOrCountryDescription].filter(Boolean).join(', ') || '未提供',
      founded: null, employees: '未提供', description: data.description || '公司信息来自 SEC 申报记录。',
      highlights: [], risks: [], availableDimensions: ['financial'], source: { url, retrievedAt },
      market: { position: '此来源未提供', sentiment: 'mixed', competitors: [], marketShare: [], geographies: [], recentEvents: [] },
      technology: { products: [], roadmap: [], strengths: [], ecosystem: [], rdIntensity: '此来源未提供', moat: '此来源未提供' },
    })
  }
  async getFinancialSummary(query: string): Promise<CompanyFinancialData> {
    const company = await this.company(query)
    const url = 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + String(company.cik_str).padStart(10, '0') + '.json'
    const data = await this.json<SecCompanyFacts>(url)
    return normalizeSecFinancials(data.value, company.ticker, data.retrievedAt)
  }
}
