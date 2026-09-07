import { createResearchClient } from '../mcp/client.js'
import { RESEARCH_SOURCE_LABEL, type CompanyProfile } from '../mcp/tools/researchTools.js'
import type { SpecialistActivity, SpecialistResult } from '../orchestration/types.js'
import { companiesInRequest } from './specialistUtils.js'

export async function runMarketAgent(
  request: string,
  onActivity: (activity: SpecialistActivity) => void = () => {},
): Promise<SpecialistResult> {
  const companies = companiesInRequest(request)
  if (companies.length === 0) throw new Error('No supported company found in the market research request')
  const activities: SpecialistActivity[] = []
  const report = (activity: SpecialistActivity) => { activities.push(activity); onActivity(activity) }
  const profiles: CompanyProfile[] = []
  const client = await createResearchClient()
  try {
    report({ stage: 'working', message: 'Analyzing market, event, and competitive context' })
    for (const company of companies) {
      report({ stage: 'tool', message: `Calling MCP get_company_profile for ${company}` })
      const outcome = await client.callTool('get_company_profile', { company })
      const profile = (outcome.data as { profile?: CompanyProfile } | undefined)?.profile
      if (profile) profiles.push(profile)
    }
  } finally { await client.close().catch(() => {}) }

  const names = profiles.map((profile) => profile.name)
  return {
    agentId: 'market-news',
    taskType: 'market',
    subject: names.join(' vs '),
    activities,
    summary: `${names.join('、')} 的市场、竞争与事件分析基于 Demo MCP 数据，并非实时新闻。`,
    insights: profiles.flatMap((profile) => [
      { title: `${profile.name} market position`, detail: profile.market.position, sentiment: profile.market.sentiment === 'positive' ? 'positive' as const : 'neutral' as const },
      ...profile.market.marketShare.map((item) => ({ title: `${profile.name} ${item.segment}`, detail: `Demo share: ${item.value}${item.unit}`, sentiment: 'neutral' as const })),
      ...profile.market.recentEvents.map((event) => ({ title: `${profile.name} · ${event.date}`, detail: event.title, sentiment: event.impact === 'positive' ? 'positive' as const : event.impact === 'negative' ? 'negative' as const : 'neutral' as const })),
      { title: `${profile.name} competitors`, detail: profile.market.competitors.join('、'), sentiment: 'neutral' as const },
    ]),
    risks: profiles.flatMap((profile) =>
      profile.risks
        .filter((risk) => ['competition', 'regulation', 'concentration', 'valuation'].includes(risk.category))
        .map((risk) => ({ title: `${profile.name} ${risk.category}`, detail: risk.detail, level: risk.level }))),
    metrics: profiles.flatMap((profile) => [
      ...profile.market.marketShare.map((item) => ({ label: item.segment, value: `${item.value}${item.unit}`, company: profile.name, category: 'market-share' })),
      ...profile.market.geographies.map((item) => ({ label: item.region, value: item.exposure, company: profile.name, category: 'geography' })),
      { label: 'Sentiment', value: profile.market.sentiment, company: profile.name, category: 'market' },
    ]),
    sources: [{ name: RESEARCH_SOURCE_LABEL, type: 'demo', description: 'Demo market, competitor and event data accessed through MCP.' }],
  }
}
