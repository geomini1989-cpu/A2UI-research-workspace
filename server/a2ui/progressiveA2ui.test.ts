import { describe, expect, it } from 'vitest'
import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { createFinancialAgentCard, createMarketAgentCard } from '../a2a/agentCard.js'
import type { AgentMatch, DelegationResult, SpecialistResult } from '../orchestration/types.js'
import { createProgressiveResearchSurface, progressiveAgentActivity, progressiveAgentSettled, progressivePhase, progressiveRenderSteps } from './progressiveA2ui.js'
import { sanitizeMessage } from './a2uiSchema.js'

const matches: AgentMatch[] = [
  { card: createFinancialAgentCard('http://local'), matchedSkills: ['financial-analysis'], score: 100 },
  { card: createMarketAgentCard('http://local'), matchedSkills: ['market-research'], score: 100 },
]

function components(messages: ReturnType<typeof createProgressiveResearchSurface>) {
  return messages.flatMap((message) => 'updateComponents' in message ? message.updateComponents.components : []) as Record<string, unknown>[]
}

function result(): DelegationResult {
  const specialist: SpecialistResult = {
    schemaVersion: 'research-result/v2',
    agentId: 'financial',
    dimension: 'financial',
    subject: 'NVIDIA',
    entities: [{ name: 'NVIDIA', ticker: 'NVDA' }],
    findings: [],
    risks: [],
    metrics: [],
    trends: [],
    evidence: [{ id: 'financial:source:nvidia', sourceName: 'MCP Research Tool (Demo Data)', sourceType: 'demo' }],
    activities: [],
    note: '财务结果已返回',
  }
  return { agentName: matches[0].card.name, matchedSkills: ['financial-analysis'], status: 'completed', taskId: 'a2a-1', result: specialist }
}

describe('progressive A2UI', () => {
  it('creates a valid renderable surface before specialists complete', () => {
    const messages = createProgressiveResearchSurface('research-1', '全面分析 NVIDIA', matches)
    expect(messages[0]).toMatchObject({ createSurface: { surfaceId: 'research-1' } })
    expect(messages.every((message) => sanitizeMessage(message) !== null)).toBe(true)
    expect(components(messages).find((component) => component.id === 'root')).toBeDefined()
    expect(components(messages).filter((component) => String(component.id).startsWith('progress-card-'))).toHaveLength(2)
  })

  it('updates live activity, settled data, and synthesis on the same surface', () => {
    const messages = [
      ...progressiveAgentActivity('research-1', matches[0].card.name, 'tool_call', 'Calling MCP'),
      ...progressiveAgentSettled('research-1', result(), 1, 2),
      ...progressivePhase('research-1', 'synthesizing'),
    ]
    expect(messages.every((message) => sanitizeMessage(message) !== null)).toBe(true)
    const surfaceIds = messages.map((message) => 'updateComponents' in message
      ? message.updateComponents.surfaceId
      : 'updateDataModel' in message ? message.updateDataModel.surfaceId : '')
    expect(new Set(surfaceIds)).toEqual(new Set(['research-1']))
    expect(components(messages).some((component) => component.id === 'progress-phase' && String(component.label).includes('最终视图'))).toBe(true)
  })

  it('reveals final root children in dependency-safe paint steps', () => {
    const finalMessages = [
      { version: 'v0.9', createSurface: { surfaceId: 'research-1', catalogId: 'research.v0.9', theme: {} } },
      { version: 'v0.9', updateDataModel: { surfaceId: 'research-1', path: '/', value: { ready: true } } },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'research-1',
          components: [
            { component: 'Column', id: 'root', children: [{ id: 'title' }, { id: 'metrics' }, { id: 'summary' }] },
            { component: 'Text', id: 'title', variant: 'h2', text: '最终标题' },
            { component: 'Row', id: 'metrics', children: [{ id: 'metric-1' }] },
            { component: 'MetricCard', id: 'metric-1', title: '营收', value: 'Demo' },
            { component: 'ResearchSummary', id: 'summary', summary: '已完成', keyPoints: [] },
          ],
        },
      },
    ] as A2uiMessage[]

    const steps = progressiveRenderSteps(finalMessages, { existingSurface: true })
    expect(steps).toHaveLength(3)
    expect(steps.flat().some((message) => 'createSurface' in message)).toBe(false)
    expect(steps.flat().every((message) => sanitizeMessage(message) !== null)).toBe(true)

    const stepComponents = steps.map((step) => components(step))
    expect(stepComponents[1].map((component) => component.id)).toEqual(expect.arrayContaining(['metric-1', 'metrics', 'root']))
    const roots = stepComponents.map((items) => items.find((component) => component.id === 'root')!)
    expect(roots[0].children).toEqual([{ id: 'title' }, { id: 'progress-phase' }])
    expect(roots[1].children).toEqual([{ id: 'title' }, { id: 'metrics' }, { id: 'progress-phase' }])
    expect(roots[2].children).toEqual([{ id: 'title' }, { id: 'metrics' }, { id: 'summary' }])
  })

  it('creates a surface and first visible block in the same initial step when no skeleton exists', () => {
    const finalMessages = [
      { version: 'v0.9', createSurface: { surfaceId: 'new-surface', catalogId: 'research.v0.9', theme: {} } },
      { version: 'v0.9', updateComponents: { surfaceId: 'new-surface', components: [
        { component: 'Column', id: 'root', children: [{ id: 'title' }] },
        { component: 'Text', id: 'title', variant: 'h2', text: '首屏' },
      ] } },
    ] as A2uiMessage[]
    const steps = progressiveRenderSteps(finalMessages)
    expect(steps).toHaveLength(1)
    expect(steps[0][0]).toMatchObject({ createSurface: { surfaceId: 'new-surface' } })
    expect(steps[0].some((message) => 'updateComponents' in message)).toBe(true)
  })
})
