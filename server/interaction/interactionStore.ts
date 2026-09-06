import type { PendingInteraction, PendingInteractionContext } from './types.js'

const pending = new Map<string, PendingInteraction>()

export function createPendingInteraction(type: PendingInteraction['type'], context: PendingInteractionContext, identity?: { taskId?: string; surfaceId?: string }): PendingInteraction {
  const interaction: PendingInteraction = {
    interactionId: crypto.randomUUID(), taskId: identity?.taskId ?? crypto.randomUUID(), surfaceId: identity?.surfaceId ?? `interaction-${crypto.randomUUID()}`,
    type, status: 'waiting', taskStatus: 'WAITING_FOR_USER', context, createdAt: new Date().toISOString(),
  }
  pending.set(interaction.interactionId, interaction)
  return interaction
}

export function getPendingInteraction(interactionId: string): PendingInteraction | undefined { return pending.get(interactionId) }

export function resolvePendingInteraction(interactionId: string, result: Record<string, unknown>): PendingInteraction {
  const interaction = pending.get(interactionId)
  if (!interaction || interaction.status !== 'waiting') throw new Error('Pending interaction not found or no longer waiting')
  interaction.status = 'completed'; interaction.taskStatus = 'RUNNING'; interaction.result = result
  return interaction
}

export function cancelPendingInteraction(interactionId: string): PendingInteraction {
  const interaction = pending.get(interactionId)
  if (!interaction || interaction.status !== 'waiting') throw new Error('Pending interaction not found or no longer waiting')
  interaction.status = 'cancelled'; interaction.taskStatus = 'CANCELLED'
  return interaction
}

export function clearPendingInteractions(): void { pending.clear() }
export function listPendingInteractions(): PendingInteraction[] { return [...pending.values()] }
