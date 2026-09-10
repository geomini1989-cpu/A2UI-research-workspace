/**
 * Thin wrapper around the official A2UI v0.9 MessageProcessor.
 *
 * The processor is a singleton so that streaming messages (from the chat route)
 * and the action handler (from button clicks) share one surface model. React
 * components subscribe to `subscribe()` to re-render when surfaces change; the
 * surfaces themselves are internally reactive (signals) for component/data updates.
 */
import { MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9'
import type { ReactComponentImplementation } from '@a2ui/react/v0_9'

import { researchCatalog } from './catalog'
import type { AgentAction } from '@/types/agent'

let processor: MessageProcessor<ReactComponentImplementation> | null = null
let actionHandler: ((action: AgentAction) => void) | null = null
let activeSurfaceId: string | null = null
const listeners = new Set<() => void>()

function emitChange() {
  listeners.forEach((cb) => cb())
}

function ensureProcessor() {
  if (!processor) {
    processor = new MessageProcessor<ReactComponentImplementation>(
      [researchCatalog],
      (action) => actionHandler?.(action as AgentAction),
    )
    processor.model.onSurfaceCreated.subscribe((surface) => {
      activeSurfaceId = surface.id
      emitChange()
    })
    processor.model.onSurfaceDeleted.subscribe(() => emitChange())
  }
  return processor
}

/** Feed a batch of validated A2UI messages into the surface model. */
export function processA2uiMessages(messages: unknown[]) {
  const current = ensureProcessor()
  for (const message of messages as A2uiMessage[]) {
    if ('createSurface' in message && current.model.getSurface(message.createSurface.surfaceId)) current.model.deleteSurface(message.createSurface.surfaceId)
    current.processMessages([message])
  }
  emitChange()
}

/** The id of the most recently created surface (the one to display). */
export function getActiveSurfaceId() {
  return activeSurfaceId
}

/** Retrieve a surface model by id, or undefined if it doesn't exist yet. */
export function getSurface(id: string) {
  return ensureProcessor().model.getSurface(id)
}

/** Keep cached drill surfaces in memory; only a new conversation clears all. */
export function removeSurface(id: string) {
  ensureProcessor().model.deleteSurface(id)
  if (activeSurfaceId === id) activeSurfaceId = null
  emitChange()
}

/** 仅在清空或恢复整个会话时重置界面。 / Reset surfaces only when clearing or restoring a conversation. */
export function clearSurfaces() {
  const p = ensureProcessor()
  for (const id of p.model.surfacesMap.keys()) {
    p.model.deleteSurface(id)
  }
  activeSurfaceId = null
  emitChange()
}

/** Register the callback invoked whenever an A2UI component action fires. */
export function setActionHandler(handler: (action: AgentAction) => void) {
  actionHandler = handler
}

/** Subscribe to surface create/delete events. Returns an unsubscribe fn. */
export function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
