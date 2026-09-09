import { describe, it, expect } from 'vitest'
import { extractJsonArray, buildA2uiMessages, attachRoot, JsonObjectStreamParser } from './a2uiGenerator.js'
import { sanitizeAgentMessage, sanitizeMessage, isAgentAllowedComponent, isAllowedComponent, RESEARCH_CATALOG_ID } from './a2uiSchema.js'
import type { A2uiMessage } from '@a2ui/web_core/v0_9'

function stripType(m: A2uiMessage) {
  // Make messages JSON-safe for expectations by omitting helper types.
  return JSON.parse(JSON.stringify(m)) as A2uiMessage
}

describe('extractJsonArray', () => {
  it('parses a bare JSON array', () => {
    expect(extractJsonArray('[{"a":1}]')).toEqual([{ a: 1 }])
  })

  it('strips a json code fence', () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }])
  })

  it('extracts an array wrapped in prose', () => {
    expect(extractJsonArray('Sure! Here: [{"a":1},{"b":2}] hope it helps')).toHaveLength(2)
  })

  it('parses line-delimited JSON message objects', () => {
    expect(extractJsonArray('{"a":1}\n{"b":{"nested":2}}\n')).toEqual([
      { a: 1 },
      { b: { nested: 2 } },
    ])
  })

  it('returns [] for garbage', () => {
    expect(extractJsonArray('no json here')).toEqual([])
  })
})

describe('JsonObjectStreamParser', () => {
  it('waits for a complete object before yielding it', () => {
    const parser = new JsonObjectStreamParser()
    expect(parser.push('{"version":"v0.9","update')).toEqual([])
    expect(parser.push('Components":{"surfaceId":"s","components":[]}')).toEqual([])
    expect(parser.push('}\n')).toEqual([
      { version: 'v0.9', updateComponents: { surfaceId: 's', components: [] } },
    ])
  })

  it('extracts multiple objects across arbitrary chunk boundaries', () => {
    const parser = new JsonObjectStreamParser()
    expect(parser.push('[{"a":1}, {"b":"x')).toEqual([{ a: 1 }])
    expect(parser.push('} y"}]')).toEqual([{ b: 'x} y' }])
  })
})

describe('sanitizeMessage', () => {
  it('forces the catalog id on createSurface', () => {
    const out = sanitizeMessage({
      version: 'v0.9',
      createSurface: { surfaceId: 's', catalogId: 'whatever', theme: {} },
    })
    expect(out).not.toBeNull()
    expect(out!.message).toMatchObject({ createSurface: { catalogId: RESEARCH_CATALOG_ID } })
  })

  it('drops non-allow-listed components and keeps allow-listed ones', () => {
    const out = sanitizeMessage({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 's',
        components: [
          { component: 'Text', id: 't1', variant: 'h1', text: 'ok' },
          { component: 'iframe', id: 'x', src: 'https://evil.example' },
        ],
      },
    })
    expect(out).not.toBeNull()
    const comps = (out!.message as A2uiMessage & { updateComponents: { components: unknown[] } }).updateComponents.components
    expect(comps).toHaveLength(1)
    expect(out!.dropped).toEqual(['iframe'])
  })

  it('rejects a message that is not a valid A2UI message', () => {
    expect(sanitizeMessage({ foo: 'bar' })).toBeNull()
  })
})


describe('sanitizeAgentMessage', () => {
  it('allows business components but rejects renderer-only primitives', () => {
    const out = sanitizeAgentMessage({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 's',
        components: [
          { component: 'MetricCard', id: 'm', title: '营收', value: '1' },
          { component: 'Row', id: 'r', children: [{ id: 'm' }] },
          { component: 'Text', id: 't', text: '自由文本' },
        ],
      },
    })
    expect(out).not.toBeNull()
    const comps = (out!.message as A2uiMessage & { updateComponents: { components: Record<string, unknown>[] } }).updateComponents.components
    expect(comps.map((item) => item.component)).toEqual(['MetricCard'])
    expect(out!.dropped).toEqual(expect.arrayContaining(['Row', 'Text']))
  })

  it('enforces business contracts, strips unknown presentation props and compiles semantic renderer names', () => {
    const out = sanitizeAgentMessage({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 's',
        components: [
          { component: 'MetricCard', id: 'm', title: '营收', value: '1', weight: 9, variant: 'hero', gap: 99 },
          { component: 'TrendChartCard', id: 'c', title: '趋势', type: 'area', height: 999, xKey: 'period', yKey: 'value', data: [{ period: 'Q1', value: 1 }] },
        ],
      },
    })
    expect(out).not.toBeNull()
    const comps = (out!.message as A2uiMessage & { updateComponents: { components: Record<string, unknown>[] } }).updateComponents.components
    const metric = comps.find((item) => item.id === 'm')!
    const chart = comps.find((item) => item.id === 'c')!
    expect(metric.weight).toBeUndefined()
    expect(metric.variant).toBeUndefined()
    expect(metric.gap).toBeUndefined()
    expect(chart.component).toBe('Chart')
    expect(chart.type).toBe('line')
    expect(chart.height).toBe(220)
  })

  it('drops a business component that violates its contract', () => {
    const out = sanitizeAgentMessage({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 's',
        components: [
          { component: 'MetricCard', id: 'bad', title: '', value: '' },
          { component: 'RiskCard', id: 'risk', level: 'CRITICAL', label: '非法等级' },
        ],
      },
    })
    expect(out).not.toBeNull()
    const comps = (out!.message as A2uiMessage & { updateComponents: { components: unknown[] } }).updateComponents.components
    expect(comps).toHaveLength(0)
    expect(out!.dropped).toEqual(['MetricCard', 'RiskCard'])
  })
})

describe('isAllowedComponent', () => {
  it('accepts the full component set', () => {
    for (const c of ['Text', 'Card', 'Button', 'Badge', 'TextField', 'Select', 'List', 'Row', 'Column', 'Divider', 'Table', 'Chart']) {
      expect(isAllowedComponent(c)).toBe(true)
    }
  })
  it('rejects unknown components', () => {
    expect(isAllowedComponent('iframe')).toBe(false)
    expect(isAllowedComponent('Script')).toBe(false)
    expect(isAllowedComponent(null)).toBe(false)
  })
})


describe('isAgentAllowedComponent', () => {
  it('exposes business presentation components only', () => {
    for (const component of ['StockOverviewCard', 'MetricCard', 'ComparisonCard', 'TrendChartCard', 'RiskCard', 'InsightCard', 'ResearchSummaryCard', 'FilterCard']) {
      expect(isAgentAllowedComponent(component)).toBe(true)
    }
    for (const component of ['Text', 'Card', 'Row', 'Column', 'Button', 'Table', 'Chart', 'RiskBadge', 'StockOverview']) {
      expect(isAgentAllowedComponent(component)).toBe(false)
    }
  })
})

describe('attachRoot', () => {
  const base: A2uiMessage[] = [
    { version: 'v0.9', createSurface: { surfaceId: 's', catalogId: 'x', theme: {} } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 's',
        components: [
          { component: 'Text', id: 'title', variant: 'h1', text: 'T' },
          { component: 'Row', id: 'metrics', children: [{ id: 'm1' }] },
          { component: 'Card', id: 'm1', title: 'M', child: 'm1t' },
          { component: 'Text', id: 'm1t', variant: 'body', text: 'x' },
          { component: 'Button', id: 'btn', label: 'go', action: { event: { name: 'add_watchlist', context: {} } } },
        ],
      },
    },
  ]

  it('injects a root Column that references every top-level child', () => {
    const out = attachRoot(base)
    const rootMsgs = out.flatMap((m) => ('updateComponents' in m ? m.updateComponents.components : [])) as Record<string, unknown>[]
    const root = rootMsgs.find((c) => c.id === 'root')
    expect(root).toBeDefined()
    expect(root!.component).toBe('Column')
    const childIds = (root!.children as { id: string }[]).map((c) => c.id)
    // referenced ids (m1, m1t) must NOT be top-level; title/metrics/btn must be
    expect(childIds).toEqual(expect.arrayContaining(['title', 'metrics', 'btn']))
    expect(childIds).not.toContain('m1')
    expect(childIds).not.toContain('m1t')
  })

  it('does not mutate the caller’s messages array', () => {
    attachRoot(base)
    const ids = base.flatMap((m) => ('updateComponents' in m ? m.updateComponents.components : [])) as Record<string, unknown>[]
    expect(ids.some((c) => c.id === 'root')).toBe(false)
  })

  it('respects an existing root and does not double-wrap', () => {
    const withRoot: A2uiMessage[] = [
      ...base,
      {
        version: 'v0.9',
        updateComponents: { surfaceId: 's', components: [{ component: 'Column', id: 'root', children: [{ id: 'title' }] }] },
      },
    ]
    const out = attachRoot(withRoot)
    const roots = out.flatMap((m) => ('updateComponents' in m ? m.updateComponents.components : [])) as Record<string, unknown>[]
    expect(roots.filter((c) => c.id === 'root')).toHaveLength(1)
  })
})

describe('buildA2uiMessages', () => {
  it('ignores model layout primitives and builds deterministic server layout', () => {
    const out = buildA2uiMessages([
      { version: 'v0.9', createSurface: { surfaceId: 's', catalogId: 'x', theme: {} } },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 's',
          components: [
            { component: 'RiskCard', id: 'risk', level: 'HIGH', label: '风险' },
            { component: 'TrendChartCard', id: 'chart', type: 'area', height: 999, data: [{ x: 'Q1', y: 1 }] },
            { component: 'MetricCard', id: 'metric-a', title: '营收', value: '1', weight: 9 },
            { component: 'MetricCard', id: 'metric-b', title: '毛利率', value: '2' },
            { component: 'StockOverviewCard', id: 'overview', company: 'NVIDIA' },
            { component: 'Text', id: 'model-title', variant: 'h2', text: '模型试图控制标题' },
            { component: 'Column', id: 'root', children: [{ id: 'risk' }, { id: 'chart' }] },
          ],
        },
      },
    ], { dataSource: false })

    const components = out.messages.flatMap((m) => 'updateComponents' in m ? m.updateComponents.components : []) as Record<string, unknown>[]
    expect(components.some((component) => component.id === 'model-title')).toBe(false)
    const metricRow = components.find((component) => component.id === '__layout-metrics') as { children: { id: string }[] }
    expect(metricRow.component).toBe('Row')
    expect(metricRow.children.map((child) => child.id)).toEqual(['metric-a', 'metric-b'])
    const root = components.find((component) => component.id === 'root') as { children: { id: string }[] }
    expect(root.children.map((child) => child.id)).toEqual(['overview', '__layout-metrics', 'chart', 'risk'])
    const chart = components.find((component) => component.id === 'chart')!
    expect(chart.type).toBe('line')
    expect(chart.height).toBe(220)
  })

  it('injects a createSurface when the model omits one', () => {
    const out = buildA2uiMessages([
      {
        version: 'v0.9',
        updateComponents: { surfaceId: 'custom', components: [{ component: 'MetricCard', id: 't', title: '营收', value: '1' }] },
      },
    ])
    const first = stripType(out.messages[0])
    expect(first).toMatchObject({ createSurface: { surfaceId: 'custom', catalogId: RESEARCH_CATALOG_ID } })
    // updateComponents surfaceId is normalized to the canonical id
    expect(stripType(out.messages[1])).toMatchObject({ updateComponents: { surfaceId: 'custom' } })
  })

  it('normalizes all updateComponents.surfaceId to the single canonical surface', () => {
    const out = buildA2uiMessages([
      { version: 'v0.9', createSurface: { surfaceId: 'research', catalogId: 'x', theme: {} } },
      { version: 'v0.9', updateComponents: { surfaceId: 'other', components: [{ component: 'MetricCard', id: 'a', title: 'A', value: '1' }] } },
      { version: 'v0.9', updateComponents: { surfaceId: 'other', components: [{ component: 'RiskCard', id: 'b', level: 'LOW', label: 'B' }] } },
    ])
    const surfaces = out.messages
      .filter((m) => 'updateComponents' in m)
      .map((m) => (m as A2uiMessage & { updateComponents: { surfaceId: string } }).updateComponents.surfaceId)
    expect(new Set(surfaces)).toEqual(new Set(['research']))
  })

  it('records dropped and invalid items without failing', () => {
    const out = buildA2uiMessages([
      { version: 'v0.9', createSurface: { surfaceId: 's', catalogId: 'x', theme: {} } },
      { version: 'v0.9', updateComponents: { surfaceId: 's', components: [{ component: 'iframe', id: 'e' }] } },
      { totally: 'invalid' },
    ])
    expect(out.droppedComponents).toContain('iframe')
    expect(out.errors.length).toBeGreaterThan(0)
    expect(out.messages.some((m) => 'createSurface' in m)).toBe(true)
  })
})

describe('data source block', () => {
  const allComponents = (out: { messages: A2uiMessage[] }) =>
    out.messages.flatMap((m) => ('updateComponents' in m ? m.updateComponents.components : [])) as Record<string, unknown>[]

  it('injects a Demo / MCP Research Tool block and wraps it in root', () => {
    const out = buildA2uiMessages([
      {
        version: 'v0.9',
        updateComponents: { surfaceId: 's', components: [{ component: 'MetricCard', id: 't', title: '营收', value: '1' }] },
      },
    ])
    const comps = allComponents(out)
    const badge = comps.find((c) => c.component === 'Badge' && String(c.label).includes('MCP'))
    expect(badge).toBeDefined()
    expect(comps.some((c) => c.component === 'Divider')).toBe(true)
    expect(comps.some((c) => c.component === 'Text' && (c.variant as string) === 'caption')).toBe(true)
    // The injected ids become top-level children of root.
    const root = comps.find((c) => c.id === 'root') as { children?: { id: string }[] }
    const rootIds = root.children!.map((ch) => ch.id)
    expect(rootIds).toContain(badge!.id as string)
  })

  it('ignores a model-emitted source badge and injects the server-owned source block', () => {
    const out = buildA2uiMessages([
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 's',
          components: [
            { component: 'Text', id: 't', variant: 'h1', text: 'hi' },
            { component: 'Badge', id: 'ds-badge', label: 'Demo / MCP Research Tool', variant: 'secondary' },
          ],
        },
      },
    ])
    const mcp = allComponents(out).filter((c) => c.component === 'Badge' && String(c.label).includes('MCP'))
    expect(mcp).toHaveLength(1)
  })

  it('can be disabled via options', () => {
    const out = buildA2uiMessages(
      [
        {
          version: 'v0.9',
          updateComponents: { surfaceId: 's', components: [{ component: 'MetricCard', id: 't', title: '营收', value: '1' }] },
        },
      ],
      { dataSource: false },
    )
    const mcp = allComponents(out).filter((c) => c.component === 'Badge' && String(c.label).includes('MCP'))
    expect(mcp).toHaveLength(0)
  })
})
