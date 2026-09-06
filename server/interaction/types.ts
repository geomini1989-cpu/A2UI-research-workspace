import type { DelegationPlan, TaskRequirement } from '../orchestration/types.js'
export type { NeedUserInput, NeedUserInputField } from '../orchestration/types.js'

export type InteractionReason = 'missing_information' | 'material_ambiguity' | 'explicit_user_choice' | 'approval_required' | 'none'
export type CoordinatorTaskStatus = 'RUNNING' | 'WAITING_FOR_USER' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type ResearchDimension = 'financial' | 'market' | 'technology'

export interface InteractionDecision {
  required: boolean
  reason: InteractionReason
  confidence: number
  missingFields?: string[]
  ambiguousOptions?: string[]
  explanation?: string
}

export interface PendingInteractionContext {
  originalRequest: string
  decision: InteractionDecision
  requirement?: TaskRequirement
  plan?: DelegationPlan
  defaultDimensions?: ResearchDimension[]
}

export interface PendingInteraction {
  interactionId: string
  taskId: string
  surfaceId: string
  type: Exclude<InteractionReason, 'none'>
  status: 'waiting' | 'completed' | 'cancelled'
  taskStatus: CoordinatorTaskStatus
  context: PendingInteractionContext
  result?: Record<string, unknown>
  createdAt: string
}
