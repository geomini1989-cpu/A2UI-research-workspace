import { describe, expect, it } from 'vitest'
import type { A2uiMessage } from '@a2ui/web_core/v0_9'

import { StreamingA2uiState } from './streamingA2ui.js'

const update = (components: Record<string, unknown>[]): A2uiMessage => ({
  version: 'v0.9',
  updateComponents: { surfaceId: 's', components },
} as A2uiMessage)

const rootIds = (message: A2uiMessage) => {
  if (!('updateComponents' in message)) return []
  const root = (message.updateComponents.components as Record<string, unknown>[]).find((component) => component.id === 'root')
  return ((root?.children ?? []) as { id: string }[]).map((child) => child.id)
}

describe('StreamingA2uiState', () => {
  it('accumulates partial root updates instead of replacing visible blocks', () => {
    const state = new StreamingA2uiState()

    const first = state.prepareMessage(update([
      { component: 'Text', id: 'title', text: '研究' },
      { component: 'Column', id: 'root', children: [{ id: 'title' }] },
    ]))
    expect(rootIds(first)).toEqual(['title'])

    const second = state.prepareMessage(update([
      { component: 'Chart', id: 'chart', data: [] },
      { component: 'Column', id: 'root', children: [{ id: 'chart' }] },
    ]))
    expect(rootIds(second)).toEqual(['title', 'chart'])
  })

  it('preserves multiple instances of the same component type by id', () => {
    const state = new StreamingA2uiState()
    const message = state.prepareMessage(update([
      { component: 'MetricCard', id: 'revenue', title: '营收', value: '1' },
      { component: 'MetricCard', id: 'margin', title: '毛利率', value: '2' },
      { component: 'MetricCard', id: 'pe', title: 'P/E', value: '3' },
      { component: 'Column', id: 'root', children: [{ id: 'revenue' }, { id: 'margin' }, { id: 'pe' }] },
    ]))

    expect(rootIds(message)).toEqual(['revenue', 'margin', 'pe'])
    expect(state.hasSubstantiveContent).toBe(true)
  })

  it('does not treat empty research shells as substantive content', () => {
    const state = new StreamingA2uiState()
    state.prepareMessage(update([
      { component: 'Chart', id: 'empty-chart', data: [] },
      { component: 'Table', id: 'empty-table', columns: [], rows: [] },
      { component: 'ResearchSummary', id: 'empty-summary', summary: '', keyPoints: [] },
      { component: 'Column', id: 'root', children: [{ id: 'empty-chart' }, { id: 'empty-table' }, { id: 'empty-summary' }] },
    ]))

    expect(state.hasSubstantiveContent).toBe(false)
  })

  it('accepts populated analysis components as substantive content', () => {
    const state = new StreamingA2uiState()
    state.prepareMessage(update([
      { component: 'Chart', id: 'chart', data: [{ period: 'Q1', value: 1 }] },
      { component: 'Column', id: 'root', children: [{ id: 'chart' }] },
    ]))

    expect(state.hasSubstantiveContent).toBe(true)
  })

  it('caps long generated body text while preserving cards', () => {
    const state = new StreamingA2uiState()
    const message = state.prepareMessage(update([
      { component: 'Text', id: 'essay', variant: 'body', text: '这是一段非常长的研究说明。'.repeat(20) },
      { component: 'MetricCard', id: 'metric', title: '营收', value: '1' },
      { component: 'Column', id: 'root', children: [{ id: 'essay' }, { id: 'metric' }] },
    ]))
    const components = 'updateComponents' in message
      ? message.updateComponents.components as Record<string, unknown>[]
      : []
    const body = components.find((component) => component.id === 'essay')
    expect(String(body?.text ?? '').length).toBeLessThanOrEqual(97)
    expect(components.some((component) => component.id === 'metric')).toBe(true)
  })

  it('keeps peer metric cards on the same interaction mode', () => {
    const state = new StreamingA2uiState()
    const message = state.prepareMessage(update([
      { component: 'MetricCard', id: 'nvda', interactionGroup: 'data-center-revenue', title: 'NVIDIA 数据中心营收', value: '91.5', detail: { summary: '补充解释' } },
      { component: 'MetricCard', id: 'amd', interactionGroup: 'data-center-revenue', title: 'AMD 数据中心营收', value: '12.6' },
      { component: 'Row', id: 'metrics', children: [{ id: 'nvda' }, { id: 'amd' }] },
      { component: 'Column', id: 'root', children: [{ id: 'metrics' }] },
    ]))
    const components = 'updateComponents' in message
      ? message.updateComponents.components as Record<string, unknown>[]
      : []
    expect(components.find((component) => component.id === 'nvda')?.detail).toBeUndefined()
    expect(components.find((component) => component.id === 'amd')?.detail).toBeUndefined()
  })

  it('stabilizes root order across mixed generation order', () => {
    const state = new StreamingA2uiState()
    const message = state.prepareMessage(update([
      { component: 'RiskBadge', id: 'risk', level: 'HIGH', label: '风险' },
      { component: 'Chart', id: 'chart', data: [{ x: 'Q1', y: 1 }] },
      { component: 'MetricCard', id: 'metric', title: '营收', value: '1' },
      { component: 'StockOverview', id: 'overview', company: 'NVIDIA' },
      { component: 'Text', id: 'title', variant: 'h2', text: 'NVIDIA 研究' },
      { component: 'Table', id: 'table', columns: [{ key: 'm', label: '指标' }], rows: [{ m: '营收' }] },
      { component: 'Column', id: 'root', children: [{ id: 'risk' }, { id: 'chart' }, { id: 'metric' }, { id: 'overview' }, { id: 'title' }, { id: 'table' }] },
    ]))

    expect(rootIds(message)).toEqual(['title', 'overview', 'metric', 'table', 'chart', 'risk'])
  })

  it('keeps nested children out of the authoritative final root', () => {
    const state = new StreamingA2uiState()
    state.prepareMessage(update([
      { component: 'MetricCard', id: 'revenue', title: '营收', value: '1' },
      { component: 'MetricCard', id: 'margin', title: '毛利率', value: '2' },
      { component: 'Row', id: 'metrics', children: [{ id: 'revenue' }, { id: 'margin' }] },
      { component: 'Column', id: 'root', children: [{ id: 'metrics' }] },
    ]))

    const finalRoot = state.finalRootComponent()
    expect(((finalRoot?.children ?? []) as { id: string }[]).map((child) => child.id)).toEqual(['metrics'])
  })
})
