import { describe, expect, it } from 'vitest'
import { buildStableLayoutPlan, stableTopLevelOrder } from './layoutPolicy.js'

describe('stableTopLevelOrder', () => {
  it('keeps the same page rhythm regardless of model emission order', () => {
    const byId = new Map<string, Record<string, unknown>>([
      ['risk', { component: 'RiskBadge', id: 'risk', level: 'HIGH' }],
      ['chart', { component: 'Chart', id: 'chart', data: [{ x: 1, y: 2 }] }],
      ['metrics', { component: 'Row', id: 'metrics', children: [{ id: 'revenue' }, { id: 'pe' }] }],
      ['revenue', { component: 'MetricCard', id: 'revenue', title: '营收', value: '1' }],
      ['pe', { component: 'MetricCard', id: 'pe', title: 'P/E', value: '2' }],
      ['overview', { component: 'StockOverview', id: 'overview', company: 'NVIDIA' }],
      ['title', { component: 'Text', id: 'title', variant: 'h2', text: 'NVIDIA 研究' }],
      ['table', { component: 'Table', id: 'table', rows: [{ metric: '营收' }] }],
      ['ds-badge', { component: 'Badge', id: 'ds-badge', label: 'Demo / MCP Research Tool' }],
    ])

    expect(stableTopLevelOrder(
      ['risk', 'ds-badge', 'chart', 'table', 'metrics', 'overview', 'title'],
      byId,
    )).toEqual(['title', 'overview', 'metrics', 'table', 'chart', 'risk', 'ds-badge'])
  })
})


describe('buildStableLayoutPlan', () => {
  it('groups top-level MetricCards into one deterministic server-owned row', () => {
    const byId = new Map<string, Record<string, unknown>>([
      ['risk', { component: 'RiskBadge', id: 'risk', level: 'HIGH' }],
      ['metric-b', { component: 'MetricCard', id: 'metric-b', title: '毛利率', value: '2' }],
      ['overview', { component: 'StockOverview', id: 'overview', company: 'NVIDIA' }],
      ['metric-a', { component: 'MetricCard', id: 'metric-a', title: '营收', value: '1' }],
      ['chart', { component: 'Chart', id: 'chart', data: [{ x: 1, y: 2 }] }],
    ])

    const plan = buildStableLayoutPlan(
      ['risk', 'metric-b', 'overview', 'metric-a', 'chart'],
      byId,
    )

    expect(plan.generated).toEqual([
      {
        component: 'Row',
        id: '__layout-metrics',
        gap: 16,
        children: [{ id: 'metric-b' }, { id: 'metric-a' }],
      },
    ])
    expect(plan.rootChildren).toEqual(['overview', '__layout-metrics', 'chart', 'risk'])
  })
})
