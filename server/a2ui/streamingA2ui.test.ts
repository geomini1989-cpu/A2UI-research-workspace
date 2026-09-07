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
