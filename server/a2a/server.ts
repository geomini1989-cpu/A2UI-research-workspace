import { AgentCard, Role, SSE_HEADERS, TaskState, formatSSEEvent, type Message, type Part, type Task } from '@a2a-js/sdk'
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore, JsonRpcTransportHandler, ServerCallContext, type AgentExecutor, type ExecutionEventBus, type RequestContext } from '@a2a-js/sdk/server'
import type { FastifyInstance } from 'fastify'
import { runFinancialSpecialist } from '../agent/financialAgent.js'
import { runMarketAgent } from '../agent/marketAgent.js'
import { runTechnologyAgent } from '../agent/technologyAgent.js'
import type { SpecialistActivity, SpecialistResult } from '../orchestration/types.js'
import { AGENT_CARD_PATH, FINANCIAL_A2A_PATH, MARKET_AGENT_CARD_PATH, MARKET_A2A_PATH, TECHNOLOGY_AGENT_CARD_PATH, TECHNOLOGY_A2A_PATH, createFinancialAgentCard, createMarketAgentCard, createTechnologyAgentCard } from './agentCard.js'

function partText(part: Part): string { return part.content?.$case === 'text' ? part.content.value : '' }

function statusMessage(contextId: string, taskId: string, text: string): Message {
  return { messageId: crypto.randomUUID(), contextId, taskId, role: Role.ROLE_AGENT, parts: [{ content: { $case: 'text', value: text }, metadata: undefined, filename: '', mediaType: 'text/plain' }], metadata: undefined, extensions: [], referenceTaskIds: [] }
}

type SpecialistRunner = (request: string, onActivity: (activity: SpecialistActivity) => void) => Promise<SpecialistResult>

class SpecialistAgentExecutor implements AgentExecutor {
  private readonly agentName: string
  private readonly runner: SpecialistRunner
  constructor(agentName: string, runner: SpecialistRunner) { this.agentName = agentName; this.runner = runner }
  async execute(context: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId } = context
    console.info(`[A2A] ${this.agentName} received task ${taskId}`)
    const initial: Task = { id: taskId, contextId, artifacts: [], history: [context.userMessage], metadata: undefined, status: { state: TaskState.TASK_STATE_SUBMITTED, timestamp: new Date().toISOString(), message: undefined } }
    bus.publish(AgentEvent.task(initial))
    const publishActivity = (activity: SpecialistActivity) => bus.publish(AgentEvent.statusUpdate({ taskId, contextId, metadata: { stage: activity.stage }, status: { state: TaskState.TASK_STATE_WORKING, timestamp: new Date().toISOString(), message: statusMessage(contextId, taskId, activity.message) } }))
    try {
      const request = context.userMessage.parts.map(partText).filter(Boolean).join('\n')
      const result = await this.runner(request, publishActivity)
      bus.publish(AgentEvent.artifactUpdate({ taskId, contextId, append: false, lastChunk: true, metadata: undefined, artifact: { artifactId: crypto.randomUUID(), name: `${result.agentId}-research-result`, description: 'Validated unified SpecialistResult; contains no UI or executable code.', parts: [{ content: { $case: 'data', value: result }, metadata: undefined, filename: '', mediaType: 'application/json' }], metadata: { schema: 'specialist-result/v1' }, extensions: [] } }))
      bus.publish(AgentEvent.statusUpdate({ taskId, contextId, metadata: undefined, status: { state: TaskState.TASK_STATE_COMPLETED, timestamp: new Date().toISOString(), message: statusMessage(contextId, taskId, `${this.agentName} research completed`) } }))
      console.info(`[A2A] task ${taskId} completed`)
    } catch (err) {
      console.error(`[A2A] task ${taskId} failed`, err)
      bus.publish(AgentEvent.statusUpdate({ taskId, contextId, metadata: undefined, status: { state: TaskState.TASK_STATE_FAILED, timestamp: new Date().toISOString(), message: statusMessage(contextId, taskId, err instanceof Error ? err.message : 'Financial research failed') } }))
    } finally { bus.finished() }
  }
  async cancelTask(_taskId: string, bus: ExecutionEventBus): Promise<void> { bus.finished() }
}

function createSpecialistA2aHandler(card: AgentCard, runner: SpecialistRunner) {
  const requestHandler = new DefaultRequestHandler(card, new InMemoryTaskStore(), new SpecialistAgentExecutor(card.name, runner))
  return { card, transport: new JsonRpcTransportHandler(requestHandler) }
}

export function createFinancialA2aHandler(baseUrl: string) { return createSpecialistA2aHandler(createFinancialAgentCard(baseUrl), runFinancialSpecialist) }

export async function registerFinancialA2aRoutes(app: FastifyInstance, baseUrl: string) {
  const { card, transport } = createFinancialA2aHandler(baseUrl)
  registerCardRoute(app, AGENT_CARD_PATH, card)
  registerTransportRoute(app, FINANCIAL_A2A_PATH, transport)
  return card
}

function registerCardRoute(app: FastifyInstance, path: string, card: AgentCard) {
  app.get(path, async (_req, reply) => reply.type('application/json').send(AgentCard.toJSON(card)))
}

function registerTransportRoute(app: FastifyInstance, path: string, transport: JsonRpcTransportHandler) {
  app.post(path, async (req, reply) => {
    const requestedVersion = typeof req.headers['a2a-version'] === 'string' ? req.headers['a2a-version'] : '1.0'
    const response = await transport.handle(req.body as Record<string, unknown>, new ServerCallContext({ requestedVersion }))
    if (Symbol.asyncIterator in Object(response)) {
      reply.hijack()
      reply.raw.writeHead(200, SSE_HEADERS)
      try {
        for await (const event of response as AsyncGenerator<unknown, void, undefined>) {
          reply.raw.write(formatSSEEvent(event))
        }
      } finally {
        reply.raw.end()
      }
      return
    }
    return reply.type('application/json').send(response)
  })
}

export interface SpecialistBaseUrls { financial: string; market: string; technology: string }

export async function registerSpecialistA2aRoutes(app: FastifyInstance, baseUrls: SpecialistBaseUrls): Promise<AgentCard[]> {
  const definitions = [
    { card: createFinancialAgentCard(baseUrls.financial), cardPath: AGENT_CARD_PATH, a2aPath: FINANCIAL_A2A_PATH, runner: runFinancialSpecialist },
    { card: createMarketAgentCard(baseUrls.market), cardPath: MARKET_AGENT_CARD_PATH, a2aPath: MARKET_A2A_PATH, runner: runMarketAgent },
    { card: createTechnologyAgentCard(baseUrls.technology), cardPath: TECHNOLOGY_AGENT_CARD_PATH, a2aPath: TECHNOLOGY_A2A_PATH, runner: runTechnologyAgent },
  ]
  for (const definition of definitions) {
    const { transport } = createSpecialistA2aHandler(definition.card, definition.runner)
    registerCardRoute(app, definition.cardPath, definition.card)
    registerTransportRoute(app, definition.a2aPath, transport)
  }
  return definitions.map(({ card }) => card)
}
