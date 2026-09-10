import { useSyncExternalStore } from 'react'
import { A2uiSurface } from '@a2ui/react/v0_9'
import { getSurface, subscribe } from './a2uiEngine'

export function A2UISurface({ surfaceId }: { surfaceId: string }) {
  const surface = useSyncExternalStore(subscribe, () => getSurface(surfaceId))
  return surface ? <A2uiSurface surface={surface} /> : null
}
