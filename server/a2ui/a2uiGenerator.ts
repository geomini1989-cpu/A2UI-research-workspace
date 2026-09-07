import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { RESEARCH_CATALOG_ID, sanitizeMessage, stripCodeFences } from './a2uiSchema.js'
import { stableTopLevelOrder } from './layoutPolicy.js'

export interface GeneratedMessages {
  /** Validated, allow-listed, normalized A2UI messages. */
  messages: A2uiMessage[]
  /** Component names dropped because they were not allow-listed. */
  droppedComponents: string[]
  /** Messages skipped because they failed schema validation. */
  errors: string[]
}

export interface BuildOptions {
  /** Whether to inject a "Data Source: Demo / MCP Research Tool" block (default true). */
  dataSource?: boolean
  /** Server-generated id for an appended drill-down surface. */
  surfaceId?: string
}


/**
 * Incrementally extracts complete top-level JSON objects from arbitrary text
 * chunks. It ignores array wrappers / prose and only yields an object after its
 * closing brace arrives, so half-generated JSON never reaches A2UI validation.
 */
export class JsonObjectStreamParser {
  private buffer = ''
  private cursor = 0
  private start = -1
  private depth = 0
  private inString = false
  private escaped = false

  push(chunk: string): unknown[] {
    this.buffer += chunk
    const values: unknown[] = []

    for (; this.cursor < this.buffer.length; this.cursor++) {
      const ch = this.buffer[this.cursor]

      if (this.start === -1) {
        if (ch === '{') {
          this.start = this.cursor
          this.depth = 1
          this.inString = false
          this.escaped = false
        }
        continue
      }

      if (this.escaped) {
        this.escaped = false
        continue
      }
      if (this.inString && ch === '\\') {
        this.escaped = true
        continue
      }
      if (ch === '"') {
        this.inString = !this.inString
        continue
      }
      if (this.inString) continue

      if (ch === '{') this.depth++
      else if (ch === '}') {
        this.depth--
        if (this.depth === 0) {
          const objectText = this.buffer.slice(this.start, this.cursor + 1)
          try {
            values.push(JSON.parse(objectText))
          } catch {
            // The object is complete but invalid JSON; skip it and continue.
          }
          this.buffer = this.buffer.slice(this.cursor + 1)
          this.cursor = -1
          this.start = -1
          this.inString = false
          this.escaped = false
        }
      }
    }

    return values
  }

  finish(): unknown[] {
    return this.push('\n')
  }
}

/**
 * Extract a JSON array from raw LLM output. Handles code fences, a leading /
 * trailing wrapper (`{"messages": [...]}`), and a bare single message object.
 * Returns [] when nothing parseable is found.
 */
export function extractJsonArray(text: string): unknown[] {
  const cleaned = stripCodeFences(text)

  try {
    const value: unknown = JSON.parse(cleaned)
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && 'messages' in value) {
      const maybe = (value as { messages: unknown }).messages
      if (Array.isArray(maybe)) return maybe
    }
    return [value]
  } catch {
    // fall through to streaming/object extraction
  }

  const objectParser = new JsonObjectStreamParser()
  const objects = objectParser.push(cleaned)
  if (objects.length > 0) return objects

  // Legacy fallback: find a balanced `[...]` in prose.
  const start = cleaned.indexOf('[')
  if (start !== -1) {
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\' && inString) {
        escape = true
        continue
      }
      if (ch === '"') inString = !inString
      if (inString) continue
      if (ch === '[') depth++
      else if (ch === ']') {
        depth--
        if (depth === 0) {
          try {
            const value: unknown = JSON.parse(cleaned.slice(start, i + 1))
            if (Array.isArray(value)) return value
            return [value]
          } catch {
            return []
          }
        }
      }
    }
  }
  return []
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Inject a `root` container component into an A2UI stream.
 *
 * The official React renderer renders the surface's component whose id is
 * literally `root` (`<DeferredChild id="root">` inside `A2uiSurface`). Without
 * such a component the renderer shows `[Loading root...]` forever. We build a
 * `Column` wired to every top-level component (ids that no other component
 * references) and prepend it to the first updateComponents batch — or, if the
 * model already emitted a component with id `root`, respect it and do nothing.
 */
export function attachRoot(messages: A2uiMessage[]): A2uiMessage[] {
  const allIds: string[] = []
  const referenced = new Set<string>()

  for (const m of messages) {
    if (!('updateComponents' in m)) continue
    for (const c of m.updateComponents.components) {
      const rec = c as Record<string, unknown>
      if (typeof rec.id === 'string') allIds.push(rec.id)
      if (typeof rec.child === 'string') referenced.add(rec.child)
      if (Array.isArray(rec.children)) {
        for (const ch of rec.children) {
          if (isRecord(ch) && typeof ch.id === 'string') referenced.add(ch.id)
        }
      }
    }
  }

  if (allIds.length === 0 || allIds.includes('root')) return messages

  const topLevelIds = allIds.filter((id) => id !== 'root' && !referenced.has(id))
  const root: Record<string, unknown> = {
    component: 'Column',
    id: 'root',
    gap: 16,
    children: topLevelIds.map((id) => ({ id })),
  }

  // Shallow-clone the messages (and any updateComponents components array) so we
  // don't mutate the caller's objects.
  const result: A2uiMessage[] = messages.map((m) => {
    if (!('updateComponents' in m)) return { ...m } as A2uiMessage
    return {
      ...m,
      updateComponents: {
        ...m.updateComponents,
        components: [...m.updateComponents.components],
      },
    } as A2uiMessage
  })

  const idx = result.findIndex((m) => 'updateComponents' in m)
  if (idx === -1) {
    const surfaceId = messages.find((m) => 'createSurface' in m)?.createSurface?.surfaceId ?? 'research'
    result.push({ version: 'v0.9', updateComponents: { surfaceId, components: [root] } } as A2uiMessage)
  } else {
    const batch = result[idx] as A2uiMessage & {
      updateComponents: { surfaceId: string; components: Record<string, unknown>[] }
    }
    batch.updateComponents.components.unshift(root)
  }
  return result
}


function stabilizeRootLayout(messages: A2uiMessage[]): A2uiMessage[] {
  const byId = new Map<string, Record<string, unknown>>()
  const nested = new Set<string>()

  for (const message of messages) {
    if (!('updateComponents' in message)) continue
    for (const raw of message.updateComponents.components) {
      const component = raw as Record<string, unknown>
      if (typeof component.id === 'string') byId.set(component.id, component)
    }
  }

  for (const [id, component] of byId) {
    if (id === 'root') continue
    if (typeof component.child === 'string') nested.add(component.child)
    if (Array.isArray(component.children)) {
      for (const child of component.children) {
        if (child && typeof child === 'object' && 'id' in child && typeof child.id === 'string') nested.add(child.id)
        else if (typeof child === 'string') nested.add(child)
      }
    }
  }

  const topLevel = stableTopLevelOrder(
    [...byId.keys()].filter((id) => id !== 'root' && !nested.has(id)),
    byId,
  )

  return messages.map((message) => {
    if (!('updateComponents' in message)) return { ...message } as A2uiMessage
    return {
      ...message,
      updateComponents: {
        ...message.updateComponents,
        components: message.updateComponents.components.map((raw) => {
          const component = raw as Record<string, unknown>
          if (component.id !== 'root' || component.component !== 'Column') return raw
          return { ...component, gap: 16, children: topLevel.map((id) => ({ id })) } as typeof raw
        }),
      },
    } as A2uiMessage
  })
}

/**
 * Guarantee a "Data Source: Demo / MCP Research Tool" block is present in the
 * stream. If the model already emitted a "数据来源" / MCP badge we leave it alone;
 * otherwise we append a Divider + caption + Badge to the LAST updateComponents
 * batch. Runs BEFORE attachRoot so the root container wraps the new ids too.
 */
function ensureDataSource(messages: A2uiMessage[]): A2uiMessage[] {
  const hasSource = messages.some((m) => {
    if (!('updateComponents' in m)) return false
    return m.updateComponents.components.some((c) => {
      const rec = c as Record<string, unknown>
      if (rec.component === 'Badge' && typeof rec.label === 'string' && rec.label.includes('MCP')) return true
      return false
    })
  })
  if (hasSource) return messages

  const ids = new Set<string>()
  for (const m of messages) {
    if (!('updateComponents' in m)) continue
    for (const c of m.updateComponents.components) {
      const rec = c as Record<string, unknown>
      if (typeof rec.id === 'string') ids.add(rec.id)
    }
  }
  const unique = (base: string) => {
    let id = base
    let n = 1
    while (ids.has(id)) id = `${base}${++n}`
    ids.add(id)
    return id
  }
  const block: Record<string, unknown>[] = [
    { component: 'Divider', id: unique('ds-div') },
    { component: 'Text', id: unique('ds-label'), variant: 'caption', text: '数据来源' },
    { component: 'Badge', id: unique('ds-badge'), label: 'Demo / MCP Research Tool', variant: 'secondary' },
  ]

  const result = messages.map((m) => {
    if (!('updateComponents' in m)) return { ...m } as A2uiMessage
    return {
      ...m,
      updateComponents: { ...m.updateComponents, components: [...m.updateComponents.components] },
    } as A2uiMessage
  })

  let idx = -1
  for (let i = result.length - 1; i >= 0; i--) {
    if ('updateComponents' in result[i]) {
      idx = i
      break
    }
  }
  if (idx === -1) {
    const surfaceId = messages.find((m) => 'createSurface' in m)?.createSurface?.surfaceId ?? 'research'
    result.push({ version: 'v0.9', updateComponents: { surfaceId, components: block } } as A2uiMessage)
  } else {
    const batch = result[idx] as A2uiMessage & {
      updateComponents: { surfaceId: string; components: Record<string, unknown>[] }
    }
    batch.updateComponents.components.push(...block)
  }
  return result
}

/**
 * Convert parsed LLM output into a normalized stream of A2UI messages.
 * Guarantees exactly one createSurface at the front and injects the catalog id.
 */
export function buildA2uiMessages(raw: unknown, options?: BuildOptions): GeneratedMessages {
  const items = Array.isArray(raw) ? raw : extractJsonArray(typeof raw === 'string' ? raw : '')
  const messages: A2uiMessage[] = []
  const droppedComponents: string[] = []
  const errors: string[] = []

  let surfaceId: string | null = null

  for (const item of items) {
    const sanitized = sanitizeMessage(item)
    if (!sanitized) {
      const tag = item && typeof item === 'object'
        ? Object.keys(item as object).join(',')
        : typeof item
      errors.push(`skipped invalid message (keys: ${tag || 'n/a'})`)
      continue
    }
    const msg = sanitized.message
    droppedComponents.push(...sanitized.dropped)

    if ('createSurface' in msg) {
      surfaceId = msg.createSurface.surfaceId
    } else if (surfaceId === null) {
      // No createSurface yet — adopt the id the components target so an injected
      // createSurface matches them.
      if ('updateComponents' in msg) surfaceId = msg.updateComponents.surfaceId
      else if ('updateDataModel' in msg) surfaceId = msg.updateDataModel.surfaceId
    }
    messages.push(msg)
  }

  // Ensure a single canonical surfaceId across all messages.
  const canonicalId = options?.surfaceId ?? surfaceId ?? 'research'
  if (!messages.some((m) => 'createSurface' in m)) {
    messages.unshift({
      version: 'v0.9',
      createSurface: { surfaceId: canonicalId, catalogId: RESEARCH_CATALOG_ID, theme: {} },
    })
  }
  for (const m of messages) {
    if ('createSurface' in m) m.createSurface.surfaceId = canonicalId
    if ('updateComponents' in m) m.updateComponents.surfaceId = canonicalId
    if ('updateDataModel' in m) m.updateDataModel.surfaceId = canonicalId
  }

  const withSource = options?.dataSource === false ? messages : ensureDataSource(messages)
  const rooted = attachRoot(withSource)
  return { messages: stabilizeRootLayout(rooted), droppedComponents, errors }
}
