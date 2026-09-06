import { chatComplete, LlmError, type LlmMessage } from '../llm/deepseek.js'
import { createResearchClient } from '../mcp/client.js'
import { RESEARCH_SOURCE_LABEL } from '../mcp/tools/researchTools.js'
import type { SpecialistResult } from '../orchestration/types.js'

export type FinancialAnalysisType =
  | 'company-analysis'
  | 'financial-analysis'
  | 'company-comparison'
  | 'valuation-analysis'
  | 'risk-analysis'

export interface FinancialMetric {
  company: string
  category: string
  label: string
  value: string
}

export interface FinancialResearchResult {
  subject: string
  analysisType: FinancialAnalysisType
  companies: string[]
  metrics: FinancialMetric[]
  risks: string[]
  insights: string[]
  summary: string
  dataSource: typeof RESEARCH_SOURCE_LABEL
  activities?: FinancialActivity[]
}

export interface FinancialActivity {
  stage: 'working' | 'tool'
  message: string
}

const COMPANY_ALIASES: Record<string, string> = {
  nvidia: 'NVIDIA', nvda: 'NVIDIA', amd: 'AMD', apple: 'Apple', aapl: 'Apple',
  microsoft: 'Microsoft', msft: 'Microsoft', tesla: 'Tesla', tsla: 'Tesla',
}

function companiesIn(text: string): string[] {
  const lower = text.toLowerCase()
  return [...new Set(Object.entries(COMPANY_ALIASES).filter(([key]) => lower.includes(key)).map(([, name]) => name))]
}

function analysisType(text: string, companyCount: number): FinancialAnalysisType {
  const lower = text.toLowerCase()
  if (companyCount > 1 || /比较|对比|compare|versus|\bvs\b/.test(lower)) return 'company-comparison'
  if (/风险|risk/.test(lower) && !/增长|估值|财务|growth|valuation|financial/.test(lower)) return 'risk-analysis'
  if (/估值|valuation|p\/e|pe\b/.test(lower)) return 'valuation-analysis'
  if (/增长|财务|利润|营收|growth|financial|margin|revenue/.test(lower)) return 'financial-analysis'
  return 'company-analysis'
}

function isFinancialResearchResult(value: unknown): value is FinancialResearchResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return typeof v.subject === 'string' && Array.isArray(v.companies) && Array.isArray(v.metrics)
    && Array.isArray(v.risks) && Array.isArray(v.insights) && typeof v.summary === 'string'
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Financial Agent returned invalid JSON')
  return JSON.parse(text.slice(start, end + 1))
}

function deterministicResult(request: string, companies: string[], toolData: Record<string, unknown>[]): FinancialResearchResult {
  const metrics: FinancialMetric[] = []
  for (const item of toolData) {
    const company = typeof item.company === 'string' ? item.company : 'Company'
    const financial = item.financial as Record<string, unknown> | undefined
    if (!financial) continue
    for (const category of ['growth', 'profitability', 'valuation'] as const) {
      const rows = financial[category]
      if (Array.isArray(rows)) for (const row of rows as { label?: string; value?: string }[]) {
        if (row.label && row.value) metrics.push({ company, category, label: row.label, value: row.value })
      }
    }
  }
  const subject = companies.join(' vs ') || 'Requested companies'
  const type = analysisType(request, companies.length)
  return {
    subject,
    analysisType: type,
    companies,
    metrics,
    risks: ['估值与市场预期波动风险', '行业竞争及技术迭代风险', 'Demo 数据不代表实时市场状况'],
    insights: metrics.slice(0, 4).map((m) => `${m.company} ${m.label}: ${m.value}`),
    summary: `${subject} 的${type === 'company-comparison' ? '对比研究' : '专业研究'}已完成；结论基于 Demo MCP 数据，仅供架构演示。`,
    dataSource: RESEARCH_SOURCE_LABEL,
  }
}

const FINANCIAL_SYSTEM_PROMPT = `You are the Financial Research Agent. Analyze fundamentals, financial metrics, company comparisons, valuation and risks. Use only the supplied MCP tool data. Return one JSON object with subject, analysisType, companies, metrics, risks, insights, summary, dataSource. Never output React, JSX, HTML, JavaScript, A2UI, markdown, or executable code. Clearly state that figures are demo data.`

export async function runFinancialAgent(
  request: string,
  onActivity: (activity: FinancialActivity) => void = () => {},
): Promise<FinancialResearchResult> {
  const activities: FinancialActivity[] = []
  const report = (activity: FinancialActivity) => { activities.push(activity); onActivity(activity) }
  const companies = companiesIn(request)
  if (companies.length === 0) throw new Error('No supported company found in the request')
  const client = await createResearchClient()
  const toolData: Record<string, unknown>[] = []
  try {
    report({ stage: 'working', message: 'Analyzing financial research request' })
    for (const company of companies) {
      report({ stage: 'tool', message: `Calling MCP get_company_profile for ${company}` })
      await client.callTool('get_company_profile', { company })
      report({ stage: 'tool', message: `Calling MCP get_financial_summary for ${company}` })
      const result = await client.callTool('get_financial_summary', { company })
      if (result.data && typeof result.data === 'object') toolData.push(result.data as Record<string, unknown>)
    }
  } finally {
    await client.close().catch(() => {})
  }

  const fallback = deterministicResult(request, companies, toolData)
  const messages: LlmMessage[] = [
    { role: 'system', content: FINANCIAL_SYSTEM_PROMPT },
    { role: 'user', content: `Request: ${request}\nMCP data: ${JSON.stringify(toolData)}\nReturn strict JSON.` },
  ]
  try {
    const parsed = extractJsonObject(await chatComplete(messages))
    if (!isFinancialResearchResult(parsed)) throw new Error('Structured result schema validation failed')
    return { ...parsed, analysisType: analysisType(request, companies.length), companies, dataSource: RESEARCH_SOURCE_LABEL, activities }
  } catch (err) {
    if (!(err instanceof LlmError) || err.code !== 'NO_API_KEY') {
      console.warn('[financial-agent] structured synthesis fallback:', err)
    }
    return { ...fallback, activities }
  }
}

export async function runFinancialSpecialist(request: string, onActivity: (activity: FinancialActivity) => void = () => {}): Promise<SpecialistResult> {
  const result = await runFinancialAgent(request, onActivity)
  return {
    agentId: 'financial', taskType: 'financial', subject: result.subject, summary: result.summary,
    insights: result.insights.map((detail, index) => ({ title: `Financial insight ${index + 1}`, detail, sentiment: 'neutral' })),
    risks: result.risks.map((detail, index) => ({ title: `Financial risk ${index + 1}`, detail, level: index === 0 ? 'high' : 'medium' })),
    metrics: result.metrics.map((metric) => ({ label: metric.label, value: metric.value, company: metric.company, category: metric.category })),
    sources: [{ name: result.dataSource, type: 'demo', description: 'Demo financial and company data accessed through MCP.' }],
    activities: result.activities ?? [],
  }
}
