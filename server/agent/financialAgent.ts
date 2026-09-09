import { z } from 'zod'

import { chatComplete, LlmError, type LlmMessage } from '../llm/deepseek.js'
import { createResearchClient } from '../mcp/client.js'
import type { CompanyProfile, FinancialSummary } from '../mcp/tools/researchTools.js'
import type { SpecialistActivity, StructuredResearchResult } from '../orchestration/types.js'
import { assertStructuredResearchResult } from '../orchestration/researchResultSchema.js'
import { companiesInRequest } from './specialistUtils.js'
import {
  compactFinding,
  evidenceFor,
  financialMetrics,
  financialTrends,
  profileRisks,
} from './structuredResultUtils.js'

export type FinancialActivity = SpecialistActivity

const FinancialReasoningSchema = z.object({
  findings: z.array(z.object({
    category: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    detail: z.string().min(1).max(360),
    importance: z.enum(['low', 'medium', 'high']),
    sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']).optional(),
    company: z.string().min(1).max(100),
  })).max(12).default([]),
})

const FINANCIAL_SYSTEM_PROMPT = `You are the Financial Research Agent.
Reason only over the supplied MCP demo data. Return one strict JSON object:
{"findings":[{"category":"...","title":"...","detail":"...","importance":"low|medium|high","sentiment":"positive|neutral|negative|mixed","company":"..."}]}
Do not return metrics, UI, A2UI, React, markdown, executable code, or unsupported facts.
Keep findings concise and evidence-grounded. The server builds authoritative metrics, trends, risks and evidence from MCP data.`

function parseReasoning(text: string) {
  try {
    return FinancialReasoningSchema.parse(JSON.parse(text))
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return FinancialReasoningSchema.parse(JSON.parse(text.slice(start, end + 1)))
    } catch {
      return null
    }
  }
}

export async function runFinancialAgent(
  request: string,
  onActivity: (activity: FinancialActivity) => void = () => {},
): Promise<StructuredResearchResult> {
  const companies = companiesInRequest(request)
  if (companies.length === 0) throw new Error('No supported company found in the financial research request')

  const activities: FinancialActivity[] = []
  const report = (activity: FinancialActivity) => { activities.push(activity); onActivity(activity) }
  const profiles: CompanyProfile[] = []
  const financials = new Map<string, FinancialSummary>()
  const client = await createResearchClient()

  try {
    report({ stage: 'working', message: 'Analyzing fundamentals, valuation and financial risk' })
    for (const company of companies) {
      report({ stage: 'tool', message: `Calling MCP get_company_profile for ${company}` })
      const profileOutcome = await client.callTool('get_company_profile', { company })
      const profile = (profileOutcome.data as { profile?: CompanyProfile } | undefined)?.profile
      if (profile) profiles.push(profile)

      report({ stage: 'tool', message: `Calling MCP get_financial_summary for ${company}` })
      const financialOutcome = await client.callTool('get_financial_summary', { company })
      const data = financialOutcome.data as { company?: string; financial?: FinancialSummary } | undefined
      if (data?.financial) financials.set(data.company ?? profile?.name ?? company, data.financial)
    }
  } finally {
    await client.close().catch(() => {})
  }

  if (financials.size === 0) throw new Error('Financial Agent received no usable financial data')

  const agentId = 'financial'
  const entities = profiles.length > 0
    ? profiles.map((profile) => ({ name: profile.name, ticker: profile.ticker }))
    : companies.map((name) => ({ name }))

  const financialEvidence = [...financials.keys()].map((company) =>
    evidenceFor(agentId, company, 'get_financial_summary', 'Demo financial summary and history accessed through MCP.'),
  )
  const financialEvidenceByCompany = new Map([...financials.keys()].map((company, index) => [company, financialEvidence[index].id]))
  const profileEvidenceItems = profiles.map((profile) =>
    evidenceFor(agentId, profile.name, 'get_company_profile', 'Demo company profile and risk data accessed through MCP.'),
  )
  const profileEvidence = new Map(profiles.map((profile, index) => [profile.name, profileEvidenceItems[index].id]))
  const evidence = [...financialEvidence, ...profileEvidenceItems]

  const metrics = [...financials.entries()].flatMap(([company, financial]) =>
    financialMetrics(company, financial, financialEvidenceByCompany.get(company)!),
  )
  const trends = [...financials.entries()].flatMap(([company, financial]) =>
    financialTrends(company, financial, financialEvidenceByCompany.get(company)!),
  )

  let findings = metrics.slice(0, 4).map((metric, index) =>
    compactFinding(
      agentId,
      metric.company ?? companies[0],
      'headline-metric',
      metric.label,
      `${metric.company ?? ''} ${metric.label}: ${metric.value}`.trim(),
      index < 2 ? 'high' : 'medium',
      metric.evidenceIds[0],
      index,
      'neutral',
    ),
  )

  const reasoningPayload = {
    request,
    entities,
    financials: Object.fromEntries(financials),
  }
  const messages: LlmMessage[] = [
    { role: 'system', content: FINANCIAL_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(reasoningPayload) },
  ]

  try {
    const reasoning = parseReasoning(await chatComplete(messages))
    if (reasoning && reasoning.findings.length > 0) {
      findings = reasoning.findings.flatMap((finding, index) => {
        const evidenceId = financialEvidenceByCompany.get(finding.company)
        if (!evidenceId) return []
        return [compactFinding(
          agentId,
          finding.company,
          finding.category,
          finding.title,
          finding.detail,
          finding.importance,
          evidenceId,
          index,
          finding.sentiment,
        )]
      })
    }
  } catch (error) {
    if (!(error instanceof LlmError) || error.code !== 'NO_API_KEY') {
      console.warn('[financial-agent] structured reasoning fallback:', error)
    }
  }

  const result = {
    schemaVersion: 'research-result/v2' as const,
    agentId,
    dimension: 'financial' as const,
    subject: entities.map((entity) => entity.name).join(' vs '),
    entities,
    metrics,
    trends,
    findings,
    risks: profileRisks(
      agentId,
      profiles,
      ['valuation', 'competition', 'concentration', 'regulation', 'execution'],
      profileEvidence,
    ),
    evidence,
    activities,
    note: 'Financial metrics are authoritative MCP demo values; LLM reasoning is optional, structured and contract-validated.',
  }

  return assertStructuredResearchResult(result)
}

/** A2A runner retained for the Financial Agent endpoint. */
export const runFinancialSpecialist = runFinancialAgent
