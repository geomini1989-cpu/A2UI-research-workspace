import { createResearchClient } from '../mcp/client.js'
import { RESEARCH_SOURCE_LABEL, type CompanyProfile } from '../mcp/tools/researchTools.js'
import type { SpecialistActivity, SpecialistResult } from '../orchestration/types.js'
import { companiesInRequest } from './specialistUtils.js'

export async function runTechnologyAgent(request: string, onActivity: (activity: SpecialistActivity) => void = () => {}): Promise<SpecialistResult> {
  const companies = companiesInRequest(request)
  if (companies.length === 0) throw new Error('No supported company found in the technology research request')
  const activities: SpecialistActivity[] = []
  const report = (activity: SpecialistActivity) => { activities.push(activity); onActivity(activity) }
  const profiles: CompanyProfile[] = []
  const client = await createResearchClient()
  try {
    report({ stage: 'working', message: 'Analyzing technology roadmap and product competitiveness' })
    for (const company of companies) {
      report({ stage: 'tool', message: `Calling MCP get_company_profile for ${company}` })
      const outcome = await client.callTool('get_company_profile', { company })
      const profile = (outcome.data as { profile?: CompanyProfile } | undefined)?.profile
      if (profile) profiles.push(profile)
    }
  } finally { await client.close().catch(() => {}) }
  const names = profiles.map((profile) => profile.name)
  return {
    agentId: 'technology-product', taskType: 'technology', subject: names.join(' vs '), activities,
    summary: `${names.join('、')} 的技术与产品竞争力分析基于 Demo MCP 业务资料。`,
    insights: profiles.flatMap((profile) => profile.highlights.map((highlight, index) => ({ title: `${profile.name} ${index === 0 ? 'technology moat' : 'product strength'}`, detail: highlight, sentiment: 'positive' as const }))),
    risks: [{ title: 'Technology execution', detail: 'Rapid product cycles and competing architectures may erode the demonstrated positioning.', level: 'medium' }],
    metrics: profiles.map((profile) => ({ label: 'Product domain', value: profile.industry, company: profile.name, category: 'technology' })),
    sources: [{ name: RESEARCH_SOURCE_LABEL, type: 'demo', description: 'Demo product and company profile data accessed through MCP.' }],
  }
}
