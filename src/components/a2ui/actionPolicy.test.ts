import { describe, expect, it } from 'vitest'

import { hasInlineMetricDetail, isFollowUpAction, isResearchInteraction } from './actionPolicy'

describe('generated UI action policy', () => {
  it('keeps chart research explicit but recognizes card/table follow-up actions', () => {
    expect(isResearchInteraction({ event: { name: 'explore_metric', context: { company: 'NVIDIA' } } })).toBe(false)
    expect(isResearchInteraction({ event: { name: 'explore_metric', context: { company: 'NVIDIA', interactionMode: 'research' } } })).toBe(true)
    expect(isFollowUpAction({ event: { name: 'explore_metric', context: { company: 'NVIDIA' } } })).toBe(true)
    expect(isFollowUpAction({ event: { name: 'explore_risk', context: { company: 'NVIDIA' } } })).toBe(true)
    expect(isFollowUpAction({ event: { name: 'apply_filters', context: {} } })).toBe(false)
    expect(isFollowUpAction({ event: { name: 'change_time_range', context: {} } })).toBe(false)
  })

  it('does not make empty metric detail envelopes clickable', () => {
    expect(hasInlineMetricDetail(undefined)).toBe(false)
    expect(hasInlineMetricDetail({})).toBe(false)
    expect(hasInlineMetricDetail({ summary: '   ', keyPoints: [] })).toBe(false)
  })

  it('allows a small useful inline addition', () => {
    expect(hasInlineMetricDetail({ summary: '高增长主要来自数据中心需求。' })).toBe(true)
    expect(hasInlineMetricDetail({ keyPoints: ['毛利率保持稳定'] })).toBe(true)
  })
})
