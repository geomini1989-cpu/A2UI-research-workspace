/**
 * A2UI wire-message validation + safety boundary on the server.
 *
 * Every object produced by the LLM passes through here BEFORE being sent to the
 * client. We (1) validate the A2UI v0.9 message shape, (2) enforce the allow-list
 * of components the Agent may emit, and (3) normalize surfaceId / catalogId. Any
 * component that is not allow-listed is dropped and logged — the LLM can never
 * inject arbitrary HTML, JSX, JS, or unknown components.
 */
import { A2uiMessageSchema, type A2uiMessage } from '@a2ui/web_core/v0_9'
import { ALLOWED_COMPONENTS as CATALOG_ALLOWED } from '../catalog/componentCatalog.js'

/** Catalog the frontend registered against its A2UI MessageProcessor. */
export const RESEARCH_CATALOG_ID = 'research.v0.9'

/**
 * The exact component set the Agent is allowed to emit. This is the single
 * source of truth from the shared Component Catalog (basic + business).
 */
export const ALLOWED_COMPONENTS = CATALOG_ALLOWED

export function isAllowedComponent(name: unknown): boolean {
  return typeof name === 'string' && (ALLOWED_COMPONENTS as readonly string[]).includes(name)
}

/** Remove a ```json … ``` code fence so the payload can be parsed safely. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return match[1].trim()
  return trimmed
}

export interface SanitizedMessage {
  message: A2uiMessage
  dropped: string[]
}

/**
 * Validate one raw JSON object as an A2UI message and enforce the allow-list.
 * Returns null if the object is not a valid A2UI message at all.
 */
export function sanitizeMessage(raw: unknown): SanitizedMessage | null {
  const parsed = A2uiMessageSchema.safeParse(raw)
  if (!parsed.success) return null
  const msg = parsed.data
  const dropped: string[] = []

  if ('createSurface' in msg) {
    // The client registered this exact catalog id; force it so `unknown catalog`
    // errors can't happen.
    msg.createSurface.catalogId = RESEARCH_CATALOG_ID
  }

  if ('updateComponents' in msg) {
    msg.updateComponents.components = msg.updateComponents.components.filter((c) => {
      const keep = isAllowedComponent(c.component)
      if (!keep) dropped.push(String(c.component))
      return keep
    })
  }

  return { message: msg, dropped }
}
