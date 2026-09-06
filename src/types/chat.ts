import type { ActionExecutionState, AgentAction, SurfaceHistoryEntry } from './agent'

/** Role of a message in the chat transcript. */
export type ChatRole = 'user' | 'agent'

/** A single chat message shown in the left chat panel. */
export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

export interface AgentActivity { id: string; actor: string; activity: string; detail?: string; createdAt: number }

/** Root state for the whole workspace (kept separate from A2UI surface state). */
export interface WorkspaceState {
  messages: ChatMessage[]
  isGenerating: boolean
  /** The A2UI surface currently displayed in the right panel, if any. */
  activeSurfaceId: string | null
  /** Short agent status shown while generating (e.g. "Analyzing…"). */
  agentStatus: string
  activities: AgentActivity[]
  taskStatus: 'RUNNING' | 'WAITING_FOR_USER' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  activeTaskId: string | null
  activeInteractionId: string | null
  /** Last surfaced error, shown as an error state in the right panel. */
  error: string | null
  /** Presentation-only density hint; it never affects agent routing. */
  presentationMode: 'compact' | 'standard' | 'rich'
  rootSurfaceId: string | null
  surfaceHistory: SurfaceHistoryEntry[]
  pendingDrill: ActionExecutionState | null
  drillError: { action: AgentAction; error: string } | null
}
