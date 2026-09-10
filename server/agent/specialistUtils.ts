import { getResearchProvider } from '../providers/index.js'

const COMPANY_ALIASES: Record<string, string> = {
  '英伟达': 'NVIDIA', '超微': 'AMD', '苹果': 'Apple', '微软': 'Microsoft', '英特尔': 'Intel', '特斯拉': 'Tesla',
  '亚马逊': 'AMZN', '谷歌': 'GOOGL', '博通': 'AVGO', '奈飞': 'NFLX', '甲骨文': 'ORCL',
  nvidia: 'NVIDIA', nvda: 'NVIDIA', amd: 'AMD', apple: 'Apple', aapl: 'Apple',
  microsoft: 'Microsoft', msft: 'Microsoft', intel: 'Intel', intc: 'Intel',
  tesla: 'Tesla', tsla: 'Tesla',
}

export function companiesInRequest(text: string): string[] {
  const lower = text.toLowerCase()
  const matches = Object.entries(COMPANY_ALIASES).filter(([key]) => /[\u4e00-\u9fff]/.test(key) ? lower.includes(key) : new RegExp('\\b' + key + '\\b').test(lower))
  return [...new Set(matches.map(([, name]) => name))]
}

export async function resolveCompaniesInRequest(text: string): Promise<string[]> {
  const provider = getResearchProvider()
  const hints = companiesInRequest(text)
  if (provider.metadata.kind === 'demo' && hints.length) return hints
  const searches = hints.length ? hints : [text]
  const matches = (await Promise.all(searches.map(query => provider.searchCompanies(query)))).flat()
  return [...new Set(matches.map(company => company.ticker))].slice(0, 8)
}
