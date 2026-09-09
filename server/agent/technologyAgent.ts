import { createResearchClient } from '../mcp/client.js'
import type { CompanyProfile } from '../mcp/tools/researchTools.js'
import type { SpecialistActivity, StructuredResearchResult } from '../orchestration/types.js'
import { assertStructuredResearchResult } from '../orchestration/researchResultSchema.js'
import { companiesInRequest } from './specialistUtils.js'
import { compactFinding, evidenceFor, profileEntities, profileRisks } from './structuredResultUtils.js'

export async function runTechnologyAgent(
  request: string,
  onActivity: (activity: SpecialistActivity) => void = () => {},
): Promise<StructuredResearchResult> {
  const companies = companiesInRequest(request)
  if (companies.length === 0) throw new Error('No supported company found in the technology research request')

  const activities: SpecialistActivity[] = []
  const report = (activity: SpecialistActivity) => { activities.push(activity); onActivity(activity) }
  const profiles: CompanyProfile[] = []
  const client = await createResearchClient()

  try {
    report({ stage: 'working', message: 'Analyzing technology roadmap, products and competitive moat' })
    for (const company of companies) {
      report({ stage: 'tool', message: `Calling MCP get_company_profile for ${company}` })
      const outcome = await client.callTool('get_company_profile', { company })
      const profile = (outcome.data as { profile?: CompanyProfile } | undefined)?.profile
      if (profile) profiles.push(profile)
    }
  } finally {
    await client.close().catch(() => {})
  }

  if (profiles.length === 0) throw new Error('Technology Agent received no usable company profiles')

  const agentId = 'technology-product'
  const evidence = profiles.map((profile) =>
    evidenceFor(agentId, profile.name, 'get_company_profile', 'Demo product, roadmap and technology data accessed through MCP.'),
  )
  const evidenceByCompany = new Map(profiles.map((profile, index) => [profile.name, evidence[index].id]))

  const metrics = profiles.flatMap((profile) => {
    const evidenceId = evidenceByCompany.get(profile.name)!
    return [
      {
        key: `${profile.name.toLowerCase()}:rd-intensity`,
        label: 'R&D intensity',
        value: profile.technology.rdIntensity,
        company: profile.name,
        category: 'technology',
        evidenceIds: [evidenceId],
      },
      {
        key: `${profile.name.toLowerCase()}:product-count`,
        label: 'Product count',
        value: String(profile.technology.products.length),
        company: profile.name,
        category: 'technology',
        evidenceIds: [evidenceId],
      },
      {
        key: `${profile.name.toLowerCase()}:roadmap-milestones`,
        label: 'Roadmap milestones',
        value: String(profile.technology.roadmap.length),
        company: profile.name,
        category: 'technology',
        evidenceIds: [evidenceId],
      },
      ...profile.technology.products.map((product) => ({
        key: `${profile.name.toLowerCase()}:product:${product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: product.name,
        value: `${product.category} · ${product.stage}`,
        company: profile.name,
        category: 'product',
        evidenceIds: [evidenceId],
      })),
    ]
  })

  const findings = profiles.flatMap((profile) => {
    const evidenceId = evidenceByCompany.get(profile.name)!
    return [
      compactFinding(agentId, profile.name, 'technology-moat', `${profile.name} technology moat`, profile.technology.moat, 'high', evidenceId, 0, 'positive'),
      ...profile.technology.strengths.map((detail, index) =>
        compactFinding(agentId, profile.name, 'technology-strength', `${profile.name} strength ${index + 1}`, detail, 'high', evidenceId, index, 'positive'),
      ),
      ...profile.technology.roadmap.map((item, index) =>
        compactFinding(agentId, profile.name, 'roadmap', `${profile.name} roadmap ${item.period}`, item.milestone, 'medium', evidenceId, index, 'neutral'),
      ),
      compactFinding(agentId, profile.name, 'ecosystem', `${profile.name} ecosystem`, profile.technology.ecosystem.join('、'), 'high', evidenceId, 0, 'positive'),
    ]
  })

  return assertStructuredResearchResult({
    schemaVersion: 'research-result/v2',
    agentId,
    dimension: 'technology',
    subject: profiles.map((profile) => profile.name).join(' vs '),
    entities: profileEntities(profiles),
    metrics,
    trends: [],
    findings,
    risks: profileRisks(agentId, profiles, ['competition', 'supply-chain', 'execution', 'regulation'], evidenceByCompany),
    evidence,
    activities,
    note: 'Technology research is based on Demo MCP business data.',
  })
}
