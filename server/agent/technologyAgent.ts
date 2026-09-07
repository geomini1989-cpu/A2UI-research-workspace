import { createResearchClient } from '../mcp/client.js'
import { RESEARCH_SOURCE_LABEL, type CompanyProfile } from '../mcp/tools/researchTools.js'
import type { SpecialistActivity, SpecialistResult } from '../orchestration/types.js'
import { companiesInRequest } from './specialistUtils.js'

export async function runTechnologyAgent(
  request: string,
  onActivity: (activity: SpecialistActivity) => void = () => {},
): Promise<SpecialistResult> {
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
  } finally { await client.close().catch(() => {}) }

  const names = profiles.map((profile) => profile.name)
  return {
    agentId: 'technology-product',
    taskType: 'technology',
    subject: names.join(' vs '),
    activities,
    summary: `${names.join('、')} 的技术、产品路线与竞争壁垒分析基于 Demo MCP 业务资料。`,
    insights: profiles.flatMap((profile) => [
      { title: `${profile.name} technology moat`, detail: profile.technology.moat, sentiment: 'positive' as const },
      ...profile.technology.strengths.map((detail, index) => ({ title: `${profile.name} strength ${index + 1}`, detail, sentiment: 'positive' as const })),
      ...profile.technology.roadmap.map((item) => ({ title: `${profile.name} roadmap ${item.period}`, detail: item.milestone, sentiment: 'neutral' as const })),
      { title: `${profile.name} ecosystem`, detail: profile.technology.ecosystem.join('、'), sentiment: 'positive' as const },
    ]),
    risks: profiles.flatMap((profile) =>
      profile.risks
        .filter((risk) => ['competition', 'supply-chain', 'execution', 'regulation'].includes(risk.category))
        .map((risk) => ({ title: `${profile.name} ${risk.category}`, detail: risk.detail, level: risk.level }))),
    metrics: profiles.flatMap((profile) => [
      { label: 'R&D intensity', value: profile.technology.rdIntensity, company: profile.name, category: 'technology' },
      { label: 'Product count', value: String(profile.technology.products.length), company: profile.name, category: 'technology' },
      { label: 'Roadmap milestones', value: String(profile.technology.roadmap.length), company: profile.name, category: 'technology' },
      ...profile.technology.products.map((product) => ({ label: product.name, value: `${product.category} · ${product.stage}`, company: profile.name, category: 'product' })),
    ]),
    sources: [{ name: RESEARCH_SOURCE_LABEL, type: 'demo', description: 'Demo product, roadmap and technology data accessed through MCP.' }],
  }
}
