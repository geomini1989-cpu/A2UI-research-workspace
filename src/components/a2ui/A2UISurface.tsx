import { useSyncExternalStore } from 'react'
import { A2uiSurface } from '@a2ui/react/v0_9'

import { getActiveSurfaceId, getSurface, subscribe } from './a2uiEngine'

/** Reactively read the currently-displayed surface id. */
export function useActiveSurfaceId() {
  return useSyncExternalStore(subscribe, getActiveSurfaceId)
}

/** Render the active A2UI surface (or nothing if none exist yet). */
export function A2UISurface({ surfaceId: requestedSurfaceId }: { surfaceId?: string }) {
  const activeSurfaceId = useActiveSurfaceId()
  const surfaceId = requestedSurfaceId ?? activeSurfaceId
  const surface = surfaceId ? getSurface(surfaceId) : undefined
  if (!surface) return null
  return <A2uiSurface surface={surface} />
}
