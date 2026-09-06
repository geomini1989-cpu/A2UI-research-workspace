import { createResearchClient } from '../mcp/client.js'
import { RESEARCH_SOURCE_LABEL, type CompanyProfile } from '../mcp/tools/researchTools.js'
import type { SpecialistActivity, SpecialistResult } from '../orchestration/types.js'
import { companiesInRequest } from './specialistUtils.js'

export async function runMarketAgent(request: string, onActivity: (activity: SpecialistActivity) => void = () => {}): Promise<SpecialistResult> {
  const companies = companiesInRequest(request)
  if (companies.length === 0) throw new Error('No supported company found in the market research request')
  const activities: SpecialistActivity[] = []
  const report = (activity: SpecialistActivity) => { activities.push(activity); onActivity(activity) }
  const profiles: CompanyProfile[] = []
  const client = await createResearchClient()
  try {
    report({ stage: 'working', message: 'Analyzing market, news, and competitive context' })
    for (const company of companies) {
      report({ stage: 'tool', message: `Calling MCP get_company_profile for ${company}` })
      const outcome = await client.callTool('get_company_profile', { company })
      const profile = (outcome.data as { profile?: CompanyProfile } | undefined)?.profile
      if (profile) profiles.push(profile)
    }
  } finally { await client.close().catch(() => {}) }
  const names = profiles.map((profile) => profile.name)
  return {
    agentId: 'market-news', taskType: 'market', subject: names.join(' vs '), activities,
    summary: `${names.join('、')} 的市场与竞争动态摘要基于 Demo MCP 公司资料，并非实时新闻。`,
    insights: profiles.flatMap((profile) => [
      { title: `${profile.name} industry position`, detail: `${profile.industry}; ${profile.highlights[0] ?? profile.description}`, sentiment: 'positive' as const },
      { title: `${profile.name} competitive dynamics`, detail: profile.highlights.slice(1).join('；') || 'Competitive landscape requires monitoring.', sentiment: 'neutral' as const },
    ]),
    risks: [{ title: 'News freshness', detail: 'No live news feed is connected; market events are illustrative Demo Data.', level: 'high' }],
    metrics: profiles.map((profile) => ({ label: 'Industry', value: profile.industry, company: profile.name, category: 'market' })),
    sources: [{ name: RESEARCH_SOURCE_LABEL, type: 'demo', description: 'Demo company profile data accessed through MCP.' }],
  }
}
