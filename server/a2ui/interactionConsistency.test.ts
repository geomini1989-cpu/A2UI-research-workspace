import { describe, expect, it } from 'vitest'
import { normalizeMetricInteractionGroups } from './interactionConsistency.js'

describe('normalizeMetricInteractionGroups', () => {
  it('keeps different semantic metric groups independent', () => {
    const out = normalizeMetricInteractionGroups([
      { component: 'MetricCard', id: 'nvda-dc', interactionGroup: 'data-center-revenue', title: 'NVIDIA 数据中心营收', value: '$91.5B', detail: { summary: '由 AI 需求驱动' } },
      { component: 'MetricCard', id: 'amd-dc', interactionGroup: 'data-center-revenue', title: 'AMD 数据中心营收', value: '$12.6B', detail: { summary: 'MI300 放量' } },
      { component: 'MetricCard', id: 'nvda-share', interactionGroup: 'accelerator-share', title: 'NVIDIA AI 加速器份额', value: '82%', action: { event: { name: 'explore_metric', context: { company: 'NVIDIA' } } } },
      { component: 'MetricCard', id: 'amd-share', interactionGroup: 'accelerator-share', title: 'AMD AI 加速器份额', value: '11%', action: { event: { name: 'explore_metric', context: { company: 'AMD' } } } },
    ])

    expect(out[0].detail).toBeDefined()
    expect(out[1].detail).toBeDefined()
    expect(out[2].action).toBeDefined()
    expect(out[3].action).toBeDefined()
  })

  it('downgrades an inconsistent group instead of fabricating missing interaction data', () => {
    const out = normalizeMetricInteractionGroups([
      { component: 'MetricCard', id: 'a', interactionGroup: 'revenue', title: 'NVIDIA 营收', value: '1', detail: { summary: '解释' } },
      { component: 'MetricCard', id: 'b', interactionGroup: 'revenue', title: 'AMD 营收', value: '2' },
    ])

    expect(out[0].detail).toBeUndefined()
    expect(out[0].action).toBeUndefined()
    expect(out[1].detail).toBeUndefined()
    expect(out[1].action).toBeUndefined()
  })

  it('prefers a complete follow-up mode when every card has an action', () => {
    const out = normalizeMetricInteractionGroups([
      { component: 'MetricCard', id: 'a', interactionGroup: 'revenue', title: 'NVIDIA 营收', value: '1', detail: { summary: '解释' }, action: { event: { name: 'explore_metric' } } },
      { component: 'MetricCard', id: 'b', interactionGroup: 'revenue', title: 'AMD 营收', value: '2', action: { event: { name: 'explore_metric' } } },
    ])

    expect(out[0].detail).toBeUndefined()
    expect(out[1].detail).toBeUndefined()
    expect(out[0].action).toBeDefined()
    expect(out[1].action).toBeDefined()
  })
})
