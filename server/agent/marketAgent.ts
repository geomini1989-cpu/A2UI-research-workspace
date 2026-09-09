import { createResearchClient } from '../mcp/client.js'
import type { CompanyProfile } from '../domain/research.js'
import type { SpecialistActivity, StructuredResearchResult } from '../orchestration/types.js'
import { assertStructuredResearchResult } from '../orchestration/researchResultSchema.js'
import { companiesInRequest } from './specialistUtils.js'
import { compactFinding, evidenceFor, profileEntities, profileRisks } from './structuredResultUtils.js'

export async function runMarketAgent(
  request: string,
  onActivity: (activity: SpecialistActivity) => void = () => {},
): Promise<StructuredResearchResult> {
  const companies = companiesInRequest(request)
  if (companies.length === 0) throw new Error('No supported company found in the market research request')

  const activities: SpecialistActivity[] = []
  const report = (activity: SpecialistActivity) => { activities.push(activity); onActivity(activity) }
  const profiles: CompanyProfile[] = []
  const client = await createResearchClient()

  try {
    report({ stage: 'working', message: 'Analyzing market structure, events and competitive context' })
    for (const company of companies) {
      report({ stage: 'tool', message: `Calling MCP get_company_profile for ${company}` })
      const outcome = await client.callTool('get_company_profile', { company })
      const profile = (outcome.data as { profile?: CompanyProfile } | undefined)?.profile
      if (profile) profiles.push(profile)
    }
  } finally {
    await client.close().catch(() => {})
  }

  if (profiles.length === 0) throw new Error('Market Agent received no usable company profiles')

  const agentId = 'market-news'
  const evidence = profiles.map((profile) =>
    evidenceFor(agentId, profile.name, 'get_company_profile', 'Demo market, competitor and event data accessed through MCP.'),
  )
  const evidenceByCompany = new Map(profiles.map((profile, index) => [profile.name, evidence[index].id]))

  const metrics = profiles.flatMap((profile) => {
    const evidenceId = evidenceByCompany.get(profile.name)!
    return [
      ...profile.market.marketShare.map((item) => ({
        key: `${profile.name.toLowerCase()}:market-share:${item.segment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: item.segment,
        value: `${item.value}${item.unit}`,
        company: profile.name,
        category: 'market-share',
        unit: item.unit,
        evidenceIds: [evidenceId],
      })),
      ...profile.market.geographies.map((item) => ({
        key: `${profile.name.toLowerCase()}:geography:${item.region.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: item.region,
        value: item.exposure,
        company: profile.name,
        category: 'geography',
        evidenceIds: [evidenceId],
      })),
      {
        key: `${profile.name.toLowerCase()}:market-sentiment`,
        label: 'Market sentiment',
        value: profile.market.sentiment,
        company: profile.name,
        category: 'market',
        evidenceIds: [evidenceId],
      },
    ]
  })

  const findings = profiles.flatMap((profile) => {
    const evidenceId = evidenceByCompany.get(profile.name)!
    const events = profile.market.recentEvents.map((event, index) =>
      compactFinding(
        agentId,
        profile.name,
        'market-event',
        `${profile.name} · ${event.date}`,
        event.title,
        event.impact === 'negative' ? 'high' : 'medium',
        evidenceId,
        index,
        event.impact,
      ),
    )
    return [
      compactFinding(agentId, profile.name, 'market-position', `${profile.name} market position`, profile.market.position, 'high', evidenceId, 0, profile.market.sentiment),
      compactFinding(agentId, profile.name, 'competition', `${profile.name} competitors`, profile.market.competitors.join('、'), 'high', evidenceId, 0, 'neutral'),
      ...events,
    ]
  })

  return assertStructuredResearchResult({
    schemaVersion: 'research-result/v2',
    agentId,
    dimension: 'market',
    subject: profiles.map((profile) => profile.name).join(' vs '),
    entities: profileEntities(profiles),
    metrics,
    trends: [],
    findings,
    risks: profileRisks(agentId, profiles, ['competition', 'regulation', 'concentration', 'valuation'], evidenceByCompany),
    evidence,
    activities,
    note: 'Market research is based on Demo MCP data and is not a live news feed.',
  })
}
