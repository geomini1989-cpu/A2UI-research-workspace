import { describe, it, expect } from 'vitest'
import { extractJsonArray, buildA2uiMessages, attachRoot } from './a2uiGenerator.js'
import { sanitizeMessage, isAllowedComponent, RESEARCH_CATALOG_ID } from './a2uiSchema.js'
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

  it('returns [] for garbage', () => {
    expect(extractJsonArray('no json here')).toEqual([])
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
  it('injects a createSurface when the model omits one', () => {
    const out = buildA2uiMessages([
      {
        version: 'v0.9',
        updateComponents: { surfaceId: 'custom', components: [{ component: 'Text', id: 't', variant: 'h1', text: 'hi' }] },
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
      { version: 'v0.9', updateComponents: { surfaceId: 'other', components: [{ component: 'Text', id: 'a', variant: 'body', text: 'x' }] } },
      { version: 'v0.9', updateComponents: { surfaceId: 'other', components: [{ component: 'Text', id: 'b', variant: 'body', text: 'y' }] } },
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
        updateComponents: { surfaceId: 's', components: [{ component: 'Text', id: 't', variant: 'h1', text: 'hi' }] },
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

  it('does not duplicate a source badge the model already emitted', () => {
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
          updateComponents: { surfaceId: 's', components: [{ component: 'Text', id: 't', variant: 'h1', text: 'hi' }] },
        },
      ],
      { dataSource: false },
    )
    const mcp = allComponents(out).filter((c) => c.component === 'Badge' && String(c.label).includes('MCP'))
    expect(mcp).toHaveLength(0)
  })
})
