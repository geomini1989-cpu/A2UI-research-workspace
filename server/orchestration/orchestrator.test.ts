import { beforeEach, describe, expect, it } from 'vitest'
import { createFinancialAgentCard, createMarketAgentCard, createTechnologyAgentCard } from '../a2a/agentCard.js'
import { clearAgentRegistry, registerAgent } from '../registry/agentRegistry.js'
import { aggregateSpecialistResults, analyzeTaskRequirements, createDelegationPlan, executeDelegationPlan, findSpecialistNeedInput } from './orchestrator.js'
import type { SpecialistResult } from './types.js'

beforeEach(() => {
  clearAgentRegistry()
  for (const card of [createFinancialAgentCard('http://local'), createMarketAgentCard('http://local'), createTechnologyAgentCard('http://local')]) registerAgent(card)
})

describe('six dynamic selection scenarios', () => {
  const selected = (request: string) => createDelegationPlan(analyzeTaskRequirements(request)).delegations.map((item) => item.card.name)

  it('selects 0 specialists for a UI-only request', () => expect(selected('帮我创建一个公司研究页面')).toEqual([]))
  it('selects only Financial for valuation and financial risk', () => expect(selected('分析 NVIDIA 的估值和财务风险')).toEqual(['Financial Research Agent']))
  it('selects only Market for market changes and competitive dynamics', () => expect(selected('总结 NVIDIA 最近的市场变化和竞争动态')).toEqual(['Market & News Research Agent']))
  it('selects only Technology for products and technology competitiveness', () => expect(selected('分析 NVIDIA 的产品和技术竞争力')).toEqual(['Technology & Product Research Agent']))
  it('selects Financial + Technology from skills, not agent-name branches', () => expect(selected('分析 NVIDIA 的财务表现和技术竞争力')).toEqual(expect.arrayContaining(['Financial Research Agent', 'Technology & Product Research Agent'])))
  it('selects all three specialists for comprehensive analysis', () => expect(selected('全面分析 NVIDIA，包含财务、市场和技术')).toEqual(expect.arrayContaining(['Financial Research Agent', 'Market & News Research Agent', 'Technology & Product Research Agent'])))
})

function result(taskType: SpecialistResult['taskType']): SpecialistResult {
  return { agentId: taskType, taskType, subject: 'NVIDIA', summary: `${taskType} summary`, insights: [], risks: [], metrics: [], sources: [], activities: [] }
}

describe('parallel delegation, partial failure, and aggregation', () => {
  it('starts all selected A2A calls before any completes', async () => {
    const plan = createDelegationPlan(analyzeTaskRequirements('全面分析 NVIDIA'))
    const started: string[] = []
    const releases = new Map<string, () => void>()
    const execution = executeDelegationPlan(plan, '全面分析 NVIDIA', () => {}, async (card) => {
      started.push(card.name)
      await new Promise<void>((resolve) => releases.set(card.name, resolve))
      const taskType = card.name.startsWith('Financial') ? 'financial' : card.name.startsWith('Market') ? 'market' : 'technology'
      return { taskId: card.name, result: result(taskType) }
    })
    await Promise.resolve()
    expect(started).toHaveLength(3)
    for (const release of releases.values()) release()
    expect((await execution).every((item) => item.status === 'completed')).toBe(true)
  })

  it('keeps successful agents when Market fails and records unavailability', async () => {
    const plan = createDelegationPlan(analyzeTaskRequirements('全面分析 NVIDIA'))
    const results = await executeDelegationPlan(plan, '全面分析 NVIDIA', () => {}, async (card) => {
      if (card.name.startsWith('Market')) throw new Error('Market endpoint unavailable')
      const taskType = card.name.startsWith('Financial') ? 'financial' : 'technology'
      return { taskId: card.name, result: result(taskType) }
    })
    const aggregated = aggregateSpecialistResults(results, plan, 'NVIDIA')
    expect(aggregated.completedAgents).toHaveLength(2)
    expect(aggregated.dimensions.financial).toBeDefined()
    expect(aggregated.dimensions.technology).toBeDefined()
    expect(aggregated.dimensions.market).toBeUndefined()
    expect(aggregated.unavailable[0]?.agentName).toContain('Market')
  })

  it('forwards live specialist activity and settles each result independently', async () => {
    const plan = createDelegationPlan(analyzeTaskRequirements('全面分析 NVIDIA'))
    const activities: string[] = []
    const settled: string[] = []
    const results = await executeDelegationPlan(
      plan,
      '全面分析 NVIDIA',
      (event) => { if (event.stage === 'tool_call') activities.push(event.actor) },
      async (card, _request, _timeout, onActivity) => {
        onActivity?.({ stage: 'tool', message: `MCP for ${card.name}` })
        const taskType = card.name.startsWith('Financial') ? 'financial' : card.name.startsWith('Market') ? 'market' : 'technology'
        return { taskId: card.name, result: result(taskType) }
      },
      30_000,
      (item) => settled.push(item.agentName),
    )
    expect(activities).toHaveLength(3)
    expect(settled).toHaveLength(3)
    expect(results).toHaveLength(3)
  })

  it('reports unmatched skills without crashing', () => {
    clearAgentRegistry()
    const requirement = analyzeTaskRequirements('分析 NVIDIA 的产品和技术竞争力')
    const plan = createDelegationPlan(requirement)
    expect(plan.delegations).toEqual([])
    expect(plan.unmatchedSkills).toContain('product-analysis')
  })

  it('forwards a structured Specialist NeedUserInput to the Coordinator boundary', () => {
    const specialist = result('financial')
    specialist.needUserInput = { reason: 'Need target comparison company', fields: [{ id: 'companyB', label: 'Company B', type: 'text', required: true }] }
    expect(findSpecialistNeedInput([{ agentName: 'Financial', matchedSkills: ['financial-analysis'], status: 'completed', result: specialist }])).toEqual(specialist.needUserInput)
  })
})
