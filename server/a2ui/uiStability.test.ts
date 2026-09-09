import { describe, expect, it } from 'vitest'

import { buildA2uiMessages } from './a2uiGenerator.js'
import type { A2uiMessage } from '@a2ui/web_core/v0_9'

function components(messages: A2uiMessage[]) {
  return messages.flatMap((message) =>
    'updateComponents' in message
      ? message.updateComponents.components as Record<string, unknown>[]
      : [],
  )
}

function rootIds(messages: A2uiMessage[]) {
  const root = components(messages).find((component) => component.id === 'root')
  return ((root?.children ?? []) as { id: string }[]).map((item) => item.id)
}

describe('generated UI stability', () => {
  it('produces the same page-level rhythm regardless of Agent emission order', () => {
    const setA = [
      { component: 'RiskCard', id: 'risk', level: 'HIGH', label: '估值风险' },
      { component: 'TrendChartCard', id: 'trend', title: '营收趋势', xKey: 'period', yKey: 'value', data: [{ period: 'Q1', value: 1 }] },
      { component: 'MetricCard', id: 'metric-1', title: '营收', value: '1' },
      { component: 'StockOverviewCard', id: 'overview', company: 'NVIDIA' },
      { component: 'InsightCard', id: 'insight', items: ['数据中心仍是主要驱动'] },
    ]
    const setB = [setA[4], setA[2], setA[0], setA[3], setA[1]]

    const make = (cards: unknown[]) => buildA2uiMessages([
      { version: 'v0.9', updateComponents: { surfaceId: 's', components: cards } },
    ], { dataSource: false }).messages

    expect(rootIds(make(setA))).toEqual(['overview', '__layout-metrics', 'trend', 'risk', 'insight'])
    expect(rootIds(make(setB))).toEqual(['overview', '__layout-metrics', 'trend', 'risk', 'insight'])
  })

  it('never lets Agent layout/style primitives survive into the rendered result', () => {
    const out = buildA2uiMessages([
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 's',
          components: [
            { component: 'Row', id: 'agent-row', gap: 99, children: [] },
            { component: 'Text', id: 'agent-title', variant: 'h1', text: '自由标题' },
            { component: 'MetricCard', id: 'metric', title: '营收', value: '1', weight: 99, color: 'red' },
          ],
        },
      },
    ], { dataSource: false })

    const all = components(out.messages)
    expect(all.some((item) => item.id === 'agent-row')).toBe(false)
    expect(all.some((item) => item.id === 'agent-title')).toBe(false)
    const metric = all.find((item) => item.id === 'metric')!
    expect(metric.weight).toBeUndefined()
    expect(metric.color).toBeUndefined()
    expect(all.some((item) => item.id === '__layout-metrics' && item.component === 'Row')).toBe(true)
  })
})
