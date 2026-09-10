import type { SemanticAction } from './semanticActions.js'
import { readState, writeState } from '../storage/database.js'

export interface DrillDownContext {
  depth: number
  path: string[]
  parentSurfaceId: string
  rootTaskId: string
}

export interface ResearchSession {
  taskId: string
  originalRequest: string
  surfaces: Map<string, DrillDownContext>
  cache: Map<string, string>
}

interface StoredSession { taskId: string; originalRequest: string; surfaces: Array<[string, DrillDownContext]>; cache: Array<[string, string]> }
function getSession(taskId: string): ResearchSession | undefined {
  const stored = readState<StoredSession>('research', taskId)
  return stored ? { ...stored, surfaces: new Map(stored.surfaces), cache: new Map(stored.cache) } : undefined
}
function saveSession(session: ResearchSession) {
  writeState('research', session.taskId, { ...session, surfaces: [...session.surfaces], cache: [...session.cache] })
}
const MAX_DRILL_DEPTH = 3

export function registerResearchSurface(taskId: string, surfaceId: string, originalRequest: string, context?: DrillDownContext) {
  const session = getSession(taskId) ?? { taskId, originalRequest, surfaces: new Map(), cache: new Map() }
  session.surfaces.set(surfaceId, context ?? { depth: 0, path: [], parentSurfaceId: '', rootTaskId: taskId })
  saveSession(session)
}

export function beginDrillDown(action: SemanticAction): { taskId: string; drill: DrillDownContext; cacheKey: string; cached?: string } {
  const taskId = action.context.taskId
  if (!taskId) throw new Error('Semantic action is missing taskId')
  const session = getSession(taskId)
  if (!session) throw new Error('Research session has expired; please run the research again')
  const parent = session.surfaces.get(action.surfaceId)
  if (!parent) throw new Error('The selected research surface is no longer available')
  const drill: DrillDownContext = {
    depth: parent.depth + 1,
    path: [...parent.path, `${action.name}:${action.context.metric ?? action.context.segment ?? action.context.risk ?? action.context.period ?? action.context.company ?? action.context.comparisonTarget ?? 'detail'}`],
    parentSurfaceId: action.surfaceId,
    rootTaskId: taskId,
  }
  if (drill.depth > MAX_DRILL_DEPTH) throw new Error('已达到最多三层下钻，请返回上一级后继续探索')
  const cacheKey = JSON.stringify({ name: action.name, context: action.context, parent: action.surfaceId })
  return { taskId, drill, cacheKey, cached: session.cache.get(cacheKey) }
}

export function cacheDrillDown(taskId: string, key: string, raw: string) {
  const session = getSession(taskId)
  if (!session) return
  session.cache.set(key, raw)
  saveSession(session)
}
