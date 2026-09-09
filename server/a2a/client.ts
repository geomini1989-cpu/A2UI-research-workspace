import { Role, TaskState, type AgentCard, type Part, type Task } from '@a2a-js/sdk'
import { ClientFactory, ClientFactoryOptions, DefaultAgentCardResolver, JsonRpcTransportFactory } from '@a2a-js/sdk/client'
import type { SpecialistActivity, SpecialistResult } from '../orchestration/types.js'
import { parseStructuredResearchResult } from '../orchestration/researchResultSchema.js'

export class A2aClientError extends Error {
  readonly code: 'TIMEOUT' | 'DISCOVERY' | 'REMOTE_FAILED' | 'BAD_RESULT'
  constructor(message: string, code: A2aClientError['code']) { super(message); this.name = 'A2aClientError'; this.code = code }
}
export interface A2aDispatchOutcome { taskId: string; result: SpecialistResult }
function dataFromPart(part: Part): unknown { return part.content?.$case === 'data' ? part.content.value : undefined }
function partText(part: Part): string { return part.content?.$case === 'text' ? part.content.value : '' }

export async function discoverAgentCard(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<AgentCard> {
  try { return await new DefaultAgentCardResolver({ fetchImpl }).resolve(baseUrl) }
  catch (err) { throw new A2aClientError(`Agent discovery failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'DISCOVERY') }
}

export async function dispatchSpecialistTask(
  card: AgentCard,
  prompt: string,
  timeoutMs = 30_000,
  fetchImpl: typeof fetch = fetch,
  onActivity: (activity: SpecialistActivity) => void = () => {},
): Promise<A2aDispatchOutcome> {
  try {
    const options = ClientFactoryOptions.createFrom(ClientFactoryOptions.default, { transports: [new JsonRpcTransportFactory({ fetchImpl })] })
    const client = await new ClientFactory(options).createFromAgentCard(card)
    const request = { tenant: '', message: { messageId: crypto.randomUUID(), contextId: '', taskId: '', role: Role.ROLE_USER, parts: [{ content: { $case: 'text' as const, value: prompt }, metadata: undefined, filename: '', mediaType: 'text/plain' }], metadata: undefined, extensions: [], referenceTaskIds: [] }, configuration: { acceptedOutputModes: ['application/json'], taskPushNotificationConfig: undefined, returnImmediately: false }, metadata: undefined }
    let taskId = ''
    let finalState: TaskState | undefined
    let result: unknown

    for await (const response of client.sendMessageStream(request, { signal: AbortSignal.timeout(timeoutMs) })) {
      const payload = response.payload
      if (!payload) continue
      if (payload.$case === 'task') {
        const task = payload.value as Task
        taskId = task.id || taskId
        finalState = task.status?.state ?? finalState
        result ??= task.artifacts.flatMap((artifact) => artifact.parts.map(dataFromPart)).find(Boolean)
      } else if (payload.$case === 'statusUpdate') {
        const update = payload.value
        taskId = update.taskId || taskId
        finalState = update.status?.state ?? finalState
        if (update.status?.state === TaskState.TASK_STATE_WORKING) {
          const message = update.status.message?.parts.map(partText).filter(Boolean).join('\n')
          if (message) onActivity({ stage: update.metadata?.stage === 'tool' ? 'tool' : 'working', message })
        }
      } else if (payload.$case === 'artifactUpdate') {
        taskId = payload.value.taskId || taskId
        result ??= payload.value.artifact?.parts.map(dataFromPart).find(Boolean)
      }
    }

    if (finalState !== TaskState.TASK_STATE_COMPLETED) throw new A2aClientError(`Specialist task ended in state ${finalState ?? 'unknown'}`, 'REMOTE_FAILED')
    const validated = parseStructuredResearchResult(result)
    if (!validated) throw new A2aClientError('Specialist task returned an invalid research-result/v2 artifact', 'BAD_RESULT')
    return { taskId, result: validated }
  } catch (err) {
    if (err instanceof A2aClientError) throw err
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new A2aClientError('A2A request timed out', 'TIMEOUT')
    throw new A2aClientError(`A2A request failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'REMOTE_FAILED')
  }
}

/** Phase 4 compatibility alias. */
export const dispatchFinancialTask = dispatchSpecialistTask
