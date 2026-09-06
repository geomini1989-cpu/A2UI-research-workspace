import type { SemanticAction } from './semanticActions.js'

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

const sessions = new Map<string, ResearchSession>()
const MAX_DRILL_DEPTH = 3

export function registerResearchSurface(taskId: string, surfaceId: string, originalRequest: string, context?: DrillDownContext) {
  const session = sessions.get(taskId) ?? { taskId, originalRequest, surfaces: new Map(), cache: new Map() }
  session.surfaces.set(surfaceId, context ?? { depth: 0, path: [], parentSurfaceId: '', rootTaskId: taskId })
  sessions.set(taskId, session)
}

export function beginDrillDown(action: SemanticAction): { taskId: string; drill: DrillDownContext; cacheKey: string; cached?: string } {
  const taskId = action.context.taskId
  if (!taskId) throw new Error('Semantic action is missing taskId')
  const session = sessions.get(taskId)
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
  sessions.get(taskId)?.cache.set(key, raw)
}
