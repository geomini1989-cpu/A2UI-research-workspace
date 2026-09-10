import type { PendingInteraction, PendingInteractionContext } from './types.js'

import { clearState, listState, readState, writeState } from '../storage/database.js'

export function createPendingInteraction(type: PendingInteraction['type'], context: PendingInteractionContext, identity?: { taskId?: string; surfaceId?: string }): PendingInteraction {
  const interaction: PendingInteraction = {
    interactionId: crypto.randomUUID(), taskId: identity?.taskId ?? crypto.randomUUID(), surfaceId: identity?.surfaceId ?? `interaction-${crypto.randomUUID()}`,
    type, status: 'waiting', taskStatus: 'WAITING_FOR_USER', context, createdAt: new Date().toISOString(),
  }
  writeState('interaction', interaction.interactionId, interaction)
  return interaction
}

export function getPendingInteraction(interactionId: string): PendingInteraction | undefined { return readState<PendingInteraction>('interaction', interactionId) }

export function resolvePendingInteraction(interactionId: string, result: Record<string, unknown>): PendingInteraction {
  const interaction = readState<PendingInteraction>('interaction', interactionId)
  if (!interaction || interaction.status !== 'waiting') throw new Error('Pending interaction not found or no longer waiting')
  interaction.status = 'completed'; interaction.taskStatus = 'RUNNING'; interaction.result = result
  writeState('interaction', interaction.interactionId, interaction)
  return interaction
}

export function cancelPendingInteraction(interactionId: string): PendingInteraction {
  const interaction = readState<PendingInteraction>('interaction', interactionId)
  if (!interaction || interaction.status !== 'waiting') throw new Error('Pending interaction not found or no longer waiting')
  interaction.status = 'cancelled'; interaction.taskStatus = 'CANCELLED'
  writeState('interaction', interaction.interactionId, interaction)
  return interaction
}

export function clearPendingInteractions(): void { clearState('interaction') }
export function listPendingInteractions(): PendingInteraction[] { return listState<PendingInteraction>('interaction') }
