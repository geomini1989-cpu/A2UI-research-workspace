import { describe, expect, it } from 'vitest'

import { hasInlineMetricDetail, isResearchInteraction } from './actionPolicy'

describe('generated UI action policy', () => {
  it('keeps ordinary semantic actions local/static unless research is explicit', () => {
    expect(isResearchInteraction({ event: { context: { company: 'NVIDIA' } } })).toBe(false)
    expect(isResearchInteraction({ event: { context: { company: 'NVIDIA', interactionMode: 'research' } } })).toBe(true)
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
