import { describe, it, expect, beforeEach } from 'vitest'
import type { A2uiMessage } from '@a2ui/web_core/v0_9'

import { processA2uiMessages, getActiveSurfaceId, getSurface, clearSurfaces } from './a2uiEngine'

const MESSAGES: A2uiMessage[] = [
  {
    version: 'v0.9',
    createSurface: { surfaceId: 'research', catalogId: 'research.v0.9', theme: {} },
  },
  {
    version: 'v0.9',
    updateComponents: {
      surfaceId: 'research',
      components: [
        {
          component: 'Column',
          id: 'root',
          gap: 16,
          children: [{ id: 'title' }, { id: 'tag' }, { id: 'btn1' }, { id: 'tbl' }],
        },
      ],
    },
  },
  {
    version: 'v0.9',
    updateComponents: {
      surfaceId: 'research',
      components: [
        { component: 'Text', id: 'title', variant: 'h1', text: 'NVIDIA' },
        { component: 'Badge', id: 'tag', label: 'Demo Data', variant: 'secondary' },
      ],
    },
  },
  {
    version: 'v0.9',
    updateComponents: {
      surfaceId: 'research',
      components: [
        {
          component: 'Button',
          id: 'btn1',
          label: '生成报告',
          action: { event: { name: 'generate_report', context: {} } },
          variant: 'primary',
        },
        {
          component: 'Table',
          id: 'tbl',
          columns: [
            { key: 'm', label: '指标' },
            { key: 'v', label: '数值' },
          ],
          rows: [
            { m: '营收', v: '$XXX B' },
            { m: '增速', v: 'XX%' },
          ],
        },
      ],
    },
  },
]

describe('A2UI renderer', () => {
  beforeEach(() => clearSurfaces())

  it('creates a surface and makes it active', () => {
    processA2uiMessages(MESSAGES)
    expect(getActiveSurfaceId()).toBe('research')
    const surface = getSurface('research')
    expect(surface).toBeDefined()
    expect(surface!.componentsModel.get('title')).toBeDefined()
    expect(surface!.componentsModel.get('btn1')).toBeDefined()
  })

  it('registers every allowed component on the surface (including the root container)', () => {
    processA2uiMessages(MESSAGES)
    const surface = getSurface('research')!
    for (const id of ['root', 'title', 'tag', 'btn1', 'tbl']) {
      expect(surface.componentsModel.get(id)).toBeDefined()
    }
  })

  it('keeps known components across multiple update batches', () => {
    processA2uiMessages([
      ...MESSAGES,
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'research',
          components: [
            { component: 'Text', id: 'ok', variant: 'body', text: 'hello' },
            { component: 'Button', id: 'btn2', label: '比较', action: { event: { name: 'compare_company', context: {} } } },
          ],
        },
      },
    ])
    const surface = getSurface('research')!
    expect(surface.componentsModel.get('ok')).toBeDefined()
    expect(surface.componentsModel.get('btn2')).toBeDefined()
    expect(surface.componentsModel.get('btn1')).toBeDefined() // from the earlier batch
  })

  it('clears surfaces on reset', () => {
    processA2uiMessages(MESSAGES)
    clearSurfaces()
    expect(getSurface('research')).toBeUndefined()
    expect(getActiveSurfaceId()).toBeNull()
  })

  it('registers business components from the Component Catalog on the surface', () => {
    processA2uiMessages([
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'biz', catalogId: 'research.v0.9', theme: {} },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'biz',
          components: [
            { component: 'Column', id: 'root', children: [{ id: 'ov' }, { id: 'mc' }, { id: 'rs' }, { id: 'rb' }, { id: 'il' }, { id: 'cc' }] },
          ],
        },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'biz',
          components: [
            { component: 'StockOverview', id: 'ov', company: 'NVIDIA', ticker: 'NVDA', price: '$910' },
            { component: 'MetricCard', id: 'mc', title: 'Revenue', value: '$91.5B', change: '+114%' },
            { component: 'ResearchSummary', id: 'rs', title: 'Summary', summary: 's', keyPoints: ['a'] },
            { component: 'RiskBadge', id: 'rb', level: 'HIGH', label: 'Concentration' },
            { component: 'InsightList', id: 'il', items: ['x'] },
            {
              component: 'ComparisonCard',
              id: 'cc',
              left: 'NVIDIA',
              right: 'AMD',
              rows: [{ metric: 'Revenue', left: '$91.5B', right: '$12.6B' }],
            },
          ],
        },
      },
    ])
    const surface = getSurface('biz')
    expect(surface).toBeDefined()
    for (const id of ['root', 'ov', 'mc', 'rs', 'rb', 'il', 'cc']) {
      expect(surface!.componentsModel.get(id)).toBeDefined()
    }
  })
})
