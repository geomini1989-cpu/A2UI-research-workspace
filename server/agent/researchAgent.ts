import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { chatText, chatWithTools, LlmError, type LlmMessage, type LlmToolCall } from '../llm/deepseek.js'
import { buildA2uiMessages, attachRoot } from '../a2ui/a2uiGenerator.js'
import { RESEARCH_CATALOG_ID } from '../a2ui/a2uiSchema.js'
import { createProgressiveResearchSurface, progressiveAgentActivity, progressiveAgentSettled, progressivePhase, progressiveRenderSteps } from '../a2ui/progressiveA2ui.js'
import { SYSTEM_PROMPT } from './systemPrompt.js'
import {
  RESEARCH_TOOL_FUNCTIONS,
  RESEARCH_TOOL_NAMES,
  ResearchToolError,
} from '../mcp/tools/researchTools.js'
import { createResearchClient, type ResearchClient } from '../mcp/client.js'
import { aggregateSpecialistResults, analyzeTaskRequirements, createDelegationPlan, executeDelegationPlan, findSpecialistNeedInput, requirementForDimensions } from '../orchestration/orchestrator.js'
import type { AgentActivityEvent } from '../orchestration/types.js'
import type { ResearchDimension } from '../interaction/types.js'
import { decideInteraction, isExplicitPlanReview } from '../interaction/interactionPolicy.js'
import { createPendingInteraction } from '../interaction/interactionStore.js'
import { approvalSurface, cancelledSurface, missingInformationSurface, planReviewSurface, researchScopeSurface } from '../interaction/interactionUi.js'
import { handleRegisteredAction } from '../interaction/actionRegistry.js'
import { beginDrillDown, cacheDrillDown, registerResearchSurface } from '../interaction/researchSession.js'
import { semanticActionRequest } from '../interaction/semanticActions.js'

/** Events emitted to the NDJSON client stream. */
export type AgentEvent =
  | { type: 'status'; status: string }
  | { type: 'activity'; actor: string; activity: string; detail?: string }
  | { type: 'task_state'; state: 'RUNNING' | 'WAITING_FOR_USER' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; taskId: string; interactionId?: string }
  | { type: 'agent_text'; text: string }
  | { type: 'message'; message: A2uiMessage }
  | { type: 'done' }
  | { type: 'error'; error: string }

export type Emit = (event: AgentEvent) => void

export interface AgentActionPayload {
  name: string
  surfaceId?: string
  sourceComponentId?: string
  context?: Record<string, unknown>
}

/** Upper bound on tool-calling rounds so a misbehaving loop can never hang. */
const MAX_TOOL_ROUNDS = 4
const RENDER_STEP_DELAY_MS = 32

export type ResearchRoute = 'direct-a2ui' | 'direct-mcp' | 'a2a-financial'

export function classifyResearchRoute(text: string): { route: ResearchRoute; skills: string[] } {
  const requirement = analyzeTaskRequirements(text)
  if (requirement.requiredSkills.length > 0) return { route: 'a2a-financial', skills: requirement.requiredSkills }
  return { route: requirement.useCoordinatorMcp ? 'direct-mcp' : 'direct-a2ui', skills: [] }
}

function emitOrchestrationActivity(emit: Emit, event: AgentActivityEvent) {
  const labels: Record<AgentActivityEvent['stage'], string> = {
    planning: 'Task requirements analyzed', agent_discovered: 'Discovered via Agent Card', delegation_started: 'A2A delegation started',
    agent_working: 'Working', tool_call: 'Calling MCP tool', agent_completed: 'Complete', agent_failed: 'Unavailable',
    aggregation_started: 'Aggregating specialist results', a2ui_generation: 'Generating A2UI', complete: 'Ready',
  }
  emit({ type: 'activity', actor: event.actor, activity: labels[event.stage], detail: event.detail })
}

function describeError(err: unknown): string {
  if (err instanceof LlmError) {
    switch (err.code) {
      case 'NO_API_KEY':
        return 'DeepSeek API Key 缺失。请在 .env 中配置 DEEPSEEK_API_KEY。'
      case 'INVALID_API_KEY':
        return 'DeepSeek API Key 无效，请检查 DEEPSEEK_API_KEY。'
      case 'TIMEOUT':
        return 'DeepSeek 请求超时，请稍后再试。'
      case 'NETWORK':
        return '无法连接到 DeepSeek API，请检查网络。'
      case 'OUTPUT_TRUNCATED':
        return 'DeepSeek 输出在生成最终 UI 前达到长度上限，请缩小请求范围后重试。'
      case 'CONTENT_FILTER':
        return 'DeepSeek 未返回内容，因为请求或响应触发了内容过滤。'
      case 'UPSTREAM_RESOURCE':
        return 'DeepSeek 推理资源暂时不足，自动重试后仍未完成，请稍后再试。'
      case 'EMPTY_FINAL_ANSWER':
      case 'EMPTY_RESPONSE':
      case 'INVALID_RESPONSE':
        return 'DeepSeek 没有返回可用的最终答案，自动重试后仍为空，请稍后再试。'
      default:
        return `DeepSeek 请求失败：${err.message}`
    }
  }
  return err instanceof Error ? err.message : '未知错误'
}

function toolFailureText(err: unknown): string {
  if (err instanceof ResearchToolError) return `【工具错误】${err.message} (${err.code})`
  return `【工具错误】${err instanceof Error ? err.message : '工具调用失败'}`
}

/**
 * Execute a single tool. The allow-list is enforced here AND in the client; the
 * tool arguments come from the LLM as JSON and are parsed + validated here, so
 * illegal args are rejected rather than executed.
 */
async function callToolSafe(
  client: ResearchClient,
  call: LlmToolCall,
): Promise<{ text: string; data: unknown }> {
  if (!(RESEARCH_TOOL_NAMES as readonly string[]).includes(call.name)) {
    throw new ResearchToolError(`Unknown tool: "${call.name}"`, 'UNKNOWN_TOOL')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(call.arguments || '{}')
  } catch {
    throw new ResearchToolError(`Illegal tool arguments for "${call.name}": invalid JSON`, 'BAD_ARGS')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ResearchToolError(`Illegal tool arguments for "${call.name}": must be an object`, 'BAD_ARGS')
  }
  return client.callTool(call.name, parsed as Record<string, unknown>)
}

/**
 * Run the Agent → DeepSeek → (MCP Research Tool) → DeepSeek loop.
 *
 * The LLM decides whether a tool is needed and picks the arguments, but the
 * BACKEND executes the tool through the MCP client and feeds the result back as
 * a `role:'tool'` message. When the model stops requesting tools it returns the
 * final A2UI text, which we hand back to the caller.
 *
 * Never throws — callers expect a string or a settled stream.
 */
async function resolveResearchContent(
  messages: LlmMessage[],
  emit: Emit,
  onToolProgress: (event: { stage: 'started' | 'completed' | 'failed'; toolName: string; detail?: string }) => void = () => {},
): Promise<string> {
  let client: ResearchClient | null = null
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const result = await chatWithTools(messages, RESEARCH_TOOL_FUNCTIONS)

      if (result.toolCalls.length > 0) {
        emit({ type: 'status', status: '正在调用研究工具…' })
        if (!client) client = await createResearchClient()

        // Record what the model asked for, then let the backend run each tool.
        messages.push({
          role: 'assistant',
          content: result.content || null,
          tool_calls: result.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        })
        for (const tc of result.toolCalls) {
          let outcomeText: string
          onToolProgress({ stage: 'started', toolName: tc.name })
          try {
            const outcome = await callToolSafe(client, tc)
            outcomeText = outcome.text || `(no text result for ${tc.name})`
            onToolProgress({ stage: 'completed', toolName: tc.name })
          } catch (err) {
            outcomeText = toolFailureText(err)
            onToolProgress({ stage: 'failed', toolName: tc.name, detail: outcomeText })
          }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: outcomeText })
        }
        emit({ type: 'status', status: '已获取工具数据…' })
        continue
      }

      if (!result.content.trim()) {
        throw new LlmError('DeepSeek 返回了空响应', 'EMPTY_RESPONSE')
      }
      return result.content
    }
    throw new LlmError('工具调用次数超出上限，已停止', 'TOOL_LOOP_LIMIT')
  } finally {
    await client?.close().catch(() => {})
  }
}

/** Validate + stream a raw LLM payload. */
function actionContextForTask(messages: A2uiMessage[], taskId: string): A2uiMessage[] {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== 'object') return value
    const record = value as Record<string, unknown>
    if ('event' in record && record.event && typeof record.event === 'object') {
      const event = record.event as Record<string, unknown>
      return { ...record, event: { ...event, context: { ...(event.context as Record<string, unknown> ?? {}), taskId } } }
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, visit(item)]))
  }
  return messages.map((message) => {
    if (!('updateComponents' in message)) return message
    return { ...message, updateComponents: { ...message.updateComponents, components: message.updateComponents.components.map((component) => visit(component) as typeof component) } } as A2uiMessage
  })
}

function surfaceIdFrom(messages: A2uiMessage[]) {
  for (const message of messages) {
    if ('createSurface' in message) return message.createSurface.surfaceId
  }
  return undefined
}

/** Validate + stream a raw LLM payload, attaching it to an in-memory research session. */
async function streamGeneratedMessages(rawText: string, emit: Emit, options: { taskId?: string; originalRequest?: string; surfaceId?: string; drill?: import('../interaction/researchSession.js').DrillDownContext; existingSurface?: boolean } = {}) {
  const { messages: built, droppedComponents, errors } = buildA2uiMessages(rawText, { surfaceId: options.surfaceId })
  const contextual = options.taskId ? actionContextForTask(built, options.taskId) : built
  if (droppedComponents.length > 0 || errors.length > 0) {
    console.warn('[a2ui] dropped messages/components:', { droppedComponents, errors })
  }
  const steps = progressiveRenderSteps(contextual, { existingSurface: options.existingSurface })
  if (steps.length === 0) {
    emit({ type: 'error', error: '无法渲染生成的视图（非法 A2UI 输出）' })
    return
  }
  const surfaceId = options.surfaceId ?? surfaceIdFrom(contextual)
  if (options.taskId && options.originalRequest && surfaceId) registerResearchSurface(options.taskId, surfaceId, options.originalRequest, options.drill)
  for (let index = 0; index < steps.length; index++) {
    for (const message of steps[index]) emit({ type: 'message', message })
    if (index < steps.length - 1) await new Promise<void>((resolve) => setTimeout(resolve, RENDER_STEP_DELAY_MS))
  }
  emit({ type: 'agent_text', text: '已生成研究视图（Demo 数据）' })
}

/**
 * One coordinator path shared by a normal request and a semantic UI action.
 * It deliberately delegates based on `analyzeTaskRequirements`, rather than
 * allowing a UI component to choose a specialist itself.
 */
async function runCoordinatorResearch(
  userMessage: string,
  emit: Emit,
  progressive?: {
    surfaceId: string
    taskId: string
    drill: import('../interaction/researchSession.js').DrillDownContext
  },
): Promise<string> {
  const requirement = analyzeTaskRequirements(userMessage)
  emitOrchestrationActivity(emit, { stage: 'planning', actor: 'Research Coordinator', detail: requirement.requiredSkills.length ? `Required skills: ${requirement.requiredSkills.join(', ')}` : 'No specialist skills required' })
  const plan = createDelegationPlan(requirement)
  for (const match of plan.delegations) {
    emitOrchestrationActivity(emit, { stage: 'agent_discovered', actor: match.card.name, detail: match.matchedSkills.join(', ') })
  }
  if (progressive) {
    for (const message of createProgressiveResearchSurface(progressive.surfaceId, userMessage, plan.delegations)) emit({ type: 'message', message })
    registerResearchSurface(progressive.taskId, progressive.surfaceId, userMessage, progressive.drill)
    if (plan.delegations.length === 0) {
      for (const message of progressiveAgentActivity(progressive.surfaceId, 'Research Coordinator', 'agent_working', '正在准备定向研究')) emit({ type: 'message', message })
    }
  }
  if (plan.delegations.length > 0) {
    let settled = 0
    const results = await executeDelegationPlan(
      plan,
      userMessage,
      (event) => {
        emitOrchestrationActivity(emit, event)
        if (progressive && (event.stage === 'delegation_started' || event.stage === 'agent_working' || event.stage === 'tool_call')) {
          for (const message of progressiveAgentActivity(progressive.surfaceId, event.actor, event.stage, event.detail)) emit({ type: 'message', message })
        }
      },
      undefined,
      undefined,
      (result) => {
        if (!progressive) return
        settled++
        for (const message of progressiveAgentSettled(progressive.surfaceId, result, settled, plan.delegations.length)) emit({ type: 'message', message })
      },
    )
    const aggregation = aggregateSpecialistResults(results, plan, userMessage)
    if (aggregation.completedAgents.length > 0) {
      emitOrchestrationActivity(emit, { stage: 'aggregation_started', actor: 'Research Coordinator', detail: `${aggregation.completedAgents.length}/${plan.delegations.length} specialists completed` })
      emitOrchestrationActivity(emit, { stage: 'a2ui_generation', actor: 'Research Coordinator' })
      if (progressive) for (const message of progressivePhase(progressive.surfaceId, 'synthesizing')) emit({ type: 'message', message })
      return chatText([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `原始研究意图：${userMessage}\n以下为 Main Coordinator 通过 Agent Discovery 与 A2A 收集到的聚合结果。只针对当前下钻意图生成一个新的、聚焦的 A2UI surface：\n${JSON.stringify(aggregation)}` },
      ])
    }
    if (progressive) for (const message of progressivePhase(progressive.surfaceId, 'fallback')) emit({ type: 'message', message })
  }
  const messages: LlmMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage }]
  if (!requirement.useCoordinatorMcp && requirement.requiredSkills.length === 0) {
    if (progressive) for (const message of progressivePhase(progressive.surfaceId, 'synthesizing')) emit({ type: 'message', message })
    return chatText(messages)
  }
  return resolveResearchContent(messages, emit, (event) => {
    if (!progressive) return
    const detail = event.stage === 'started' ? `正在调用 ${event.toolName}` : `${event.toolName} ${event.stage === 'completed' ? '已返回数据' : '调用失败'}`
    for (const message of progressivePhase(progressive.surfaceId, 'tool', detail)) emit({ type: 'message', message })
  })
}

export async function runAutonomousResearch(userMessage: string, emit: Emit, dimensions?: ResearchDimension[], taskId: string = crypto.randomUUID()): Promise<void> {
  emit({ type: 'task_state', state: 'RUNNING', taskId })
  const requirement = dimensions ? requirementForDimensions(dimensions) : analyzeTaskRequirements(userMessage)
  emitOrchestrationActivity(emit, { stage: 'planning', actor: 'Research Coordinator', detail: requirement.requiredSkills.length ? `Required skills: ${requirement.requiredSkills.join(', ')}` : 'No specialist skills required' })
  const plan = createDelegationPlan(requirement)
  const surfaceId = `research-${taskId}`
  console.info(`[Discovery] required skills: ${requirement.requiredSkills.join(', ') || '(none)'}`)
  console.info(`[Discovery] matched: ${plan.delegations.map((item) => item.card.name).join(', ') || '(none)'}`)
  for (const match of plan.delegations) {
    emitOrchestrationActivity(emit, { stage: 'agent_discovered', actor: match.card.name, detail: match.matchedSkills.join(', ') })
  }

  // A real renderable surface is sent before any slow A2A/MCP/LLM operation.
  // Stable component ids let later agent events update this same surface in place.
  for (const message of createProgressiveResearchSurface(surfaceId, userMessage, plan.delegations)) emit({ type: 'message', message })
  registerResearchSurface(taskId, surfaceId, userMessage)
  if (plan.delegations.length === 0) {
    for (const message of progressiveAgentActivity(surfaceId, 'Research Coordinator', 'agent_working', requirement.useCoordinatorMcp ? '正在准备 MCP 研究' : '正在组合 A2UI 视图')) emit({ type: 'message', message })
  }

  if (plan.delegations.length > 0) {
    emit({ type: 'status', status: `正在并行委派 ${plan.delegations.length} 个专业 Agent…` })
    let settled = 0
    const results = await executeDelegationPlan(
      plan,
      userMessage,
      (event) => {
        emitOrchestrationActivity(emit, event)
        if (event.stage === 'delegation_started' || event.stage === 'agent_working' || event.stage === 'tool_call') {
          for (const message of progressiveAgentActivity(surfaceId, event.actor, event.stage, event.detail)) emit({ type: 'message', message })
        }
      },
      undefined,
      undefined,
      (result) => {
        settled++
        for (const message of progressiveAgentSettled(surfaceId, result, settled, plan.delegations.length)) emit({ type: 'message', message })
      },
    )
    const needInput = findSpecialistNeedInput(results)
    if (needInput) {
      const decision = { required: true as const, reason: 'missing_information' as const, confidence: 1, missingFields: needInput.fields.filter((field) => field.required).map((field) => field.id), explanation: needInput.reason }
      const interaction = createPendingInteraction('missing_information', { originalRequest: userMessage, decision, requirement, plan }, { taskId, surfaceId })
      for (const message of missingInformationSurface(interaction)) {
        if (!('createSurface' in message)) emit({ type: 'message', message })
      }
      emit({ type: 'activity', actor: 'Research Coordinator', activity: 'Specialist input request forwarded', detail: needInput.reason })
      emit({ type: 'task_state', state: 'WAITING_FOR_USER', taskId, interactionId: interaction.interactionId })
      return
    }
    const aggregation = aggregateSpecialistResults(results, plan, userMessage)
    if (aggregation.completedAgents.length > 0) {
      emitOrchestrationActivity(emit, { stage: 'aggregation_started', actor: 'Research Coordinator', detail: `${aggregation.completedAgents.length}/${plan.delegations.length} specialists completed` })
      emit({ type: 'status', status: '正在综合多个专业研究结果…' })
      for (const message of progressivePhase(surfaceId, 'synthesizing')) emit({ type: 'message', message })
      const uiMessages: LlmMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Original request: ${userMessage}\nThe Coordinator dynamically discovered specialists by Agent Card skills and received this unified aggregation context over parallel A2A calls. Synthesize every available dimension, visibly note unavailable dimensions, and generate one final A2UI surface:\n${JSON.stringify(aggregation)}` },
      ]
      try {
        emitOrchestrationActivity(emit, { stage: 'a2ui_generation', actor: 'Research Coordinator' })
        await streamGeneratedMessages(await chatText(uiMessages), emit, { taskId, originalRequest: userMessage, surfaceId, existingSurface: true })
        emitOrchestrationActivity(emit, { stage: 'complete', actor: 'UI' })
        emit({ type: 'task_state', state: 'COMPLETED', taskId })
        emit({ type: 'done' })
      } catch (err) { emit({ type: 'task_state', state: 'FAILED', taskId }); emit({ type: 'error', error: describeError(err) }) }
      return
    }
    emit({ type: 'activity', actor: 'Research Coordinator', activity: 'All specialists unavailable — falling back to MCP' })
    for (const message of progressivePhase(surfaceId, 'fallback')) emit({ type: 'message', message })
  } else if (requirement.requiredSkills.length > 0) {
    emit({ type: 'activity', actor: 'Agent Registry', activity: 'No matching specialist — falling back to MCP', detail: plan.unmatchedSkills.join(', ') })
    for (const message of progressivePhase(surfaceId, 'fallback', '未找到匹配的专业 Agent，正在使用 MCP 降级研究')) emit({ type: 'message', message })
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  let finalContent: string
  try {
    finalContent = !requirement.useCoordinatorMcp && requirement.requiredSkills.length === 0
      ? await chatText(messages)
      : await resolveResearchContent(messages, emit, (progress) => {
          const detail = progress.stage === 'started'
            ? `正在调用 ${progress.toolName}`
            : progress.stage === 'completed'
              ? `${progress.toolName} 已返回数据`
              : `${progress.toolName} 调用失败，将继续降级处理`
          for (const message of progressivePhase(surfaceId, 'tool', detail)) emit({ type: 'message', message })
        })
  } catch (err) {
    emit({ type: 'task_state', state: 'FAILED', taskId })
    emit({ type: 'error', error: describeError(err) })
    return
  }

  emit({ type: 'status', status: '正在生成研究视图…' })
  emit({ type: 'activity', actor: 'Research Coordinator', activity: !requirement.useCoordinatorMcp && requirement.requiredSkills.length === 0 ? 'Generating A2UI directly' : 'Generating A2UI after MCP research' })
  for (const message of progressivePhase(surfaceId, 'synthesizing')) emit({ type: 'message', message })
  await streamGeneratedMessages(finalContent, emit, { taskId, originalRequest: userMessage, surfaceId, existingSurface: true })
  emit({ type: 'activity', actor: 'UI', activity: 'Ready' })
  emit({ type: 'task_state', state: 'COMPLETED', taskId })
  emit({ type: 'done' })
}

export async function runResearchAgent(userMessage: string, emit: Emit): Promise<void> {
  emit({ type: 'status', status: '正在分析请求…' })
  emit({ type: 'activity', actor: 'Research Coordinator', activity: 'Analyzing request' })
  const decision = decideInteraction(userMessage)
  if (!decision.required) {
    emit({ type: 'activity', actor: 'Research Coordinator', activity: 'No user input required', detail: decision.explanation })
    await runAutonomousResearch(userMessage, emit)
    return
  }

  const requirement = analyzeTaskRequirements(userMessage)
  const plan = createDelegationPlan(requirement)
  const interaction = createPendingInteraction(decision.reason as Exclude<typeof decision.reason, 'none'>, {
    originalRequest: userMessage, decision, requirement, plan, defaultDimensions: ['financial', 'market', 'technology'],
  })
  emit({ type: 'activity', actor: 'Research Coordinator', activity: decision.explanation ?? decision.reason })
  emit({ type: 'activity', actor: 'Research Coordinator', activity: 'Waiting for user', detail: interaction.interactionId })
  const messages = decision.reason === 'missing_information' || decision.reason === 'material_ambiguity'
    ? missingInformationSurface(interaction)
    : decision.reason === 'approval_required'
      ? approvalSurface(interaction)
      : isExplicitPlanReview(userMessage)
        ? planReviewSurface(interaction)
        : researchScopeSurface(interaction)
  for (const message of messages) emit({ type: 'message', message })
  emit({ type: 'agent_text', text: '需要你的输入才能继续当前研究任务。' })
  emit({ type: 'task_state', state: 'WAITING_FOR_USER', taskId: interaction.taskId, interactionId: interaction.interactionId })
}

export async function runResearchAgentAction(
  action: AgentActionPayload,
  emit: Emit,
): Promise<void> {
  let registered: ReturnType<typeof handleRegisteredAction>
  try {
    registered = handleRegisteredAction(action)
  } catch (err) {
    emit({ type: 'error', error: err instanceof Error ? err.message : 'Invalid action' })
    return
  }
  if (registered.kind !== 'semantic') emit({ type: 'status', status: '正在处理请求…' })
  if (registered.kind === 'cancel') {
    for (const message of cancelledSurface(registered.interaction)) emit({ type: 'message', message })
    emit({ type: 'activity', actor: 'Research Coordinator', activity: 'Task cancelled', detail: registered.interaction.taskId })
    emit({ type: 'task_state', state: 'CANCELLED', taskId: registered.interaction.taskId, interactionId: registered.interaction.interactionId })
    emit({ type: 'agent_text', text: 'Research cancelled.' }); emit({ type: 'done' }); return
  }
  if (registered.kind === 'modify') {
    for (const message of researchScopeSurface(registered.interaction, registered.interaction.context.defaultDimensions)) emit({ type: 'message', message })
    emit({ type: 'task_state', state: 'WAITING_FOR_USER', taskId: registered.interaction.taskId, interactionId: registered.interaction.interactionId })
    return
  }
  if (registered.kind === 'resume') {
    const taskId = registered.interaction?.taskId ?? crypto.randomUUID()
    if (registered.interaction) {
      emit({ type: 'activity', actor: 'User', activity: 'Interaction resolved', detail: registered.interaction.interactionId })
      emit({ type: 'activity', actor: 'Research Coordinator', activity: 'Task resumed', detail: taskId })
    }
    await runAutonomousResearch(registered.request, emit, registered.dimensions, taskId)
    return
  }
  if (registered.kind === 'semantic') {
    const { action: semantic } = registered
    let session
    try {
      session = beginDrillDown(semantic)
    } catch (err) {
      emit({ type: 'error', error: err instanceof Error ? err.message : '无法开始下钻分析' })
      return
    }
    const detailSurfaceId = `drill-${crypto.randomUUID()}`
    const request = semanticActionRequest(semantic)
    const label = semantic.context.metric ?? semantic.context.segment ?? semantic.context.risk ?? semantic.context.period ?? semantic.context.company ?? '详情'
    emit({ type: 'status', status: `正在深入分析 ${label}…` })
    emit({ type: 'task_state', state: 'RUNNING', taskId: session.taskId })
    emit({ type: 'activity', actor: 'Research Coordinator', activity: '下钻分析', detail: semantic.name })
    try {
      const hasCachedResult = Boolean(session.cached)
      const finalContent = session.cached ?? await runCoordinatorResearch(request, emit, { surfaceId: detailSurfaceId, taskId: session.taskId, drill: session.drill })
      if (!session.cached) cacheDrillDown(session.taskId, session.cacheKey, finalContent)
      await streamGeneratedMessages(finalContent, emit, { taskId: session.taskId, originalRequest: request, surfaceId: detailSurfaceId, drill: session.drill, existingSurface: !hasCachedResult })
      emit({ type: 'task_state', state: 'COMPLETED', taskId: session.taskId })
      emit({ type: 'done' })
    } catch (err) {
      emit({ type: 'task_state', state: 'FAILED', taskId: session.taskId })
      emit({ type: 'error', error: describeError(err) })
    }
    return
  }
  const prompt = [
    '用户在生成的 UI 中触发了以下操作。请针对该操作生成更新后的研究视图。',
    `操作名称: ${action.name}`,
    action.context && Object.keys(action.context).length
      ? `操作上下文: ${JSON.stringify(action.context)}`
      : '',
    '依然只输出 A2UI v0.9 消息数组，包含 createSurface、root 容器和多个 updateComponents，并明确标记为 Demo 数据。',
    '如果操作是生成报告，输出「Research Report」结构（Executive Summary / Key Metrics / Risks / Conclusion）。',
  ]
    .filter(Boolean)
    .join('\n')

  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  let finalContent: string
  try {
    finalContent = await resolveResearchContent(messages, emit)
  } catch (err) {
    console.warn('[action] DeepSeek tool loop failed, using canned fallback:', describeError(err))
    const fallback = cannedActionMessages(action.name, action.context ?? {})
    for (const m of fallback) emit({ type: 'message', message: m })
    emit({ type: 'agent_text', text: '已执行操作（Demo 数据）' })
    emit({ type: 'done' })
    return
  }

  emit({ type: 'status', status: '正在生成研究视图…' })
  await streamGeneratedMessages(finalContent, emit)
  emit({ type: 'done' })
}

/** Deterministic fallback so buttons always produce a visible result (offline-safe). */
export function cannedActionMessages(
  name: string,
  _context: Record<string, unknown>,
): A2uiMessage[] {
  const sid = 'research'
  const create = { version: 'v0.9' as const, createSurface: { surfaceId: sid, catalogId: RESEARCH_CATALOG_ID, theme: {} } }

  if (name === 'generate_report') {
    return attachRoot([
      create,
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: sid,
          components: [
            { component: 'Text', id: 'r-title', variant: 'h2', text: '研究简报' },
            { component: 'Badge', id: 'r-tag', label: 'Demo Data', variant: 'secondary' },
            { component: 'Divider', id: 'r-div' },
            { component: 'Text', id: 'r-sum', variant: 'h3', text: '核心摘要' },
            { component: 'Text', id: 'r-sum-t', variant: 'body', text: '演示公司基本面稳健、增长动能明确。' },
            { component: 'Text', id: 'r-mk', variant: 'h3', text: '关键指标' },
            { component: 'Table', id: 'r-tbl', columns: [{ key: 'm', label: '指标' }, { key: 'v', label: '数值' }], rows: [{ m: '营收', v: '$XXX B' }, { m: '增速', v: 'XX%' }] },
            { component: 'Text', id: 'r-ri', variant: 'h3', text: '风险提示' },
            { component: 'Text', id: 'r-ri-t', variant: 'body', text: '行业竞争加剧、估值波动。' },
            { component: 'Divider', id: 'r-div2' },
            { component: 'Text', id: 'r-con', variant: 'h3', text: '结论' },
            { component: 'Text', id: 'r-con-t', variant: 'body', text: '长期看好，审慎关注宏观风险。' },
          ],
        },
      },
    ])
  }

  if (name === 'compare_company') {
    return attachRoot([
      create,
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: sid,
          components: [
            { component: 'Text', id: 'c-title', variant: 'h2', text: '公司对比' },
            { component: 'Badge', id: 'c-tag', label: 'Demo Data', variant: 'secondary' },
            { component: 'Table', id: 'c-tbl', columns: [{ key: 'm', label: '指标' }, { key: 'a', label: 'NVIDIA' }, { key: 'b', label: 'AMD' }], rows: [{ m: '营收', a: '$XXX B', b: '$XX B' }, { m: '增速', a: 'XX%', b: 'XX%' }, { m: 'P/E', a: 'XX', b: 'XX' }] },
          ],
        },
      },
    ])
  }

  return attachRoot([
    create,
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: sid,
        components: [
          { component: 'Text', id: 'a-title', variant: 'h2', text: `已收到操作：${name}` },
          { component: 'Badge', id: 'a-tag', label: 'Demo Data', variant: 'secondary' },
          { component: 'Text', id: 'a-body', variant: 'body', text: '操作已模拟处理（当前 Demo 未接入真实后端）。' },
        ],
      },
    },
  ])
}
