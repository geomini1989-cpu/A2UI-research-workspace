/** Role of a message in the chat transcript. */
export type ChatRole = 'user' | 'agent'

/** A single chat message shown in the left chat panel. */
export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  /** Follow-up Q&A stays visually below the generated research surface. */
  kind?: 'followup'
}

export interface AgentActivity { id: string; actor: string; activity: string; detail?: string; createdAt: number }

export type TaskStatus = 'RUNNING' | 'WAITING_FOR_USER' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
