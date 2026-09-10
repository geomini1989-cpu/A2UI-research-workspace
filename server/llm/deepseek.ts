import { requestSignal, recordUsage, runContext } from '../runtime/context.js'
import { config } from '../config.js'

export interface LlmToolCall {
  id: string
  name: string
  arguments: string
}

/**
 * OpenAI-compatible wire shape for a tool call as it goes back on an assistant
 * message (DeepSeek requires `type:'function'` + the nested `function` object).
 */
export interface LlmToolCallWire {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: LlmToolCallWire[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ChatWithToolsResult {
  /** Assistant text content ('' on a pure tool-calling turn). */
  content: string
  /** Tool calls requested by the model, if any. */
  toolCalls: LlmToolCall[]
}

export interface LlmFunctionDef {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: unknown
  }
}

const REQUEST_TIMEOUT_MS = 60_000

export class LlmError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'LlmError'
    this.code = code
  }
}

interface ChatResponse {
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  choices?: {
    finish_reason?: string | null
    message?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]
    }
  }[]
}

interface ChatStreamResponse {
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  choices?: {
    finish_reason?: string | null
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: {
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
  }[]
}

interface AssistantMessage {
  content: string
  toolCalls: LlmToolCall[]
}

const MAX_RESPONSE_ATTEMPTS = 2

function responseError(data: ChatResponse): LlmError {
  const choice = data.choices?.[0]
  const finishReason = choice?.finish_reason
  const reasoningOnly = Boolean(choice?.message?.reasoning_content?.trim())

  if (finishReason === 'length') {
    return new LlmError('DeepSeek output was truncated before the final answer', 'OUTPUT_TRUNCATED')
  }
  if (finishReason === 'content_filter') {
    return new LlmError('DeepSeek omitted the answer because it was filtered', 'CONTENT_FILTER')
  }
  if (finishReason === 'insufficient_system_resource') {
    return new LlmError('DeepSeek could not finish because inference resources were temporarily unavailable', 'UPSTREAM_RESOURCE')
  }
  if (reasoningOnly) {
    return new LlmError('DeepSeek returned reasoning but no final answer', 'EMPTY_FINAL_ANSWER')
  }
  if (!choice?.message) {
    return new LlmError('DeepSeek returned no assistant message', 'INVALID_RESPONSE')
  }
  return new LlmError('DeepSeek returned an empty final answer', 'EMPTY_RESPONSE')
}

function streamFinishError(finishReason: string | null | undefined): LlmError | null {
  if (finishReason === 'length') return new LlmError('DeepSeek output was truncated before the final answer', 'OUTPUT_TRUNCATED')
  if (finishReason === 'content_filter') return new LlmError('DeepSeek omitted the answer because it was filtered', 'CONTENT_FILTER')
  if (finishReason === 'insufficient_system_resource') return new LlmError('DeepSeek could not finish because inference resources were temporarily unavailable', 'UPSTREAM_RESOURCE')
  return null
}

function isRetryableResponseError(error: LlmError): boolean {
  return ['UPSTREAM_RESOURCE', 'EMPTY_FINAL_ANSWER', 'EMPTY_RESPONSE', 'INVALID_RESPONSE'].includes(error.code ?? '')
}

async function requestJson(body: Record<string, unknown>): Promise<ChatResponse> {
  if (!config.deepseekApiKey) {
    throw new LlmError('Missing DEEPSEEK_API_KEY in the environment', 'NO_API_KEY')
  }

  const signal = requestSignal(REQUEST_TIMEOUT_MS)
  recordUsage({ calls: 1 })

  let res: Response
  try {
    res = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        thinking: { type: 'disabled' },
        max_tokens: 8_192,
        ...body,
      }),
      signal,
    })
  } catch (err) {
    if (runContext.getStore()?.signal.aborted) throw err
    if (signal.aborted) {
      throw new LlmError('DeepSeek request timed out', 'TIMEOUT')
    }
    throw new LlmError('Could not reach DeepSeek API: ' + (err as Error).message, 'NETWORK')
  }


  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    const status = res.status === 401 ? 'INVALID_API_KEY' : 'HTTP_' + res.status
    throw new LlmError(`DeepSeek request failed (${res.status}): ${bodyText.slice(0, 500)}`, status)
  }

  const data = await res.json() as ChatResponse
  recordUsage({ promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens })
  return data
}

async function requestAssistant(
  body: Record<string, unknown>,
  allowToolCalls: boolean,
): Promise<AssistantMessage> {
  let lastError: LlmError | undefined
  for (let attempt = 1; attempt <= MAX_RESPONSE_ATTEMPTS; attempt++) {
    const data = await requestJson(body)
    if (['length', 'content_filter', 'insufficient_system_resource'].includes(data.choices?.[0]?.finish_reason ?? '')) throw responseError(data)
    const message = data.choices?.[0]?.message
    const content = message?.content?.trim() ?? ''
    const toolCalls: LlmToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id ?? '',
      name: tc.function?.name ?? '',
      arguments: tc.function?.arguments ?? '',
    }))
    if (content || (allowToolCalls && toolCalls.length > 0)) return { content, toolCalls }

    lastError = responseError(data)
    if (!isRetryableResponseError(lastError) || attempt === MAX_RESPONSE_ATTEMPTS) throw lastError
  }
  throw lastError ?? new LlmError('DeepSeek returned an invalid response', 'INVALID_RESPONSE')
}

/**
 * Stream an OpenAI-compatible SSE response. Content deltas are forwarded
 * immediately while tool-call deltas are assembled into the normal return shape.
 */
async function requestAssistantStream(
  body: Record<string, unknown>,
  allowToolCalls: boolean,
  onContentDelta: (delta: string) => void,
): Promise<AssistantMessage> {
  if (!config.deepseekApiKey) {
    throw new LlmError('Missing DEEPSEEK_API_KEY in the environment', 'NO_API_KEY')
  }

  const signal = requestSignal(REQUEST_TIMEOUT_MS)
  recordUsage({ calls: 1 })

  try {
    const res = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        thinking: { type: 'disabled' },
        max_tokens: 8_192,
        ...body,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal,
    })

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      const status = res.status === 401 ? 'INVALID_API_KEY' : 'HTTP_' + res.status
      throw new LlmError(`DeepSeek request failed (${res.status}): ${bodyText.slice(0, 500)}`, status)
    }
    if (!res.body) throw new LlmError('DeepSeek returned no response stream', 'INVALID_RESPONSE')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const toolParts = new Map<number, { id: string; name: string; arguments: string }>()
    let buffer = ''
    let content = ''
    let streamDone = false
    let finishReason: string | null | undefined

    const consumeLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') { streamDone = true; return }
      if (!payload) return
      let data: ChatStreamResponse
      try {
        data = JSON.parse(payload) as ChatStreamResponse
      } catch {
        return
      }
      recordUsage({ promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens })
      const choice = data.choices?.[0]
      if (!choice) return
      if (choice.finish_reason) finishReason = choice.finish_reason
      const delta = choice.delta
      if (!delta) return

      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content
        onContentDelta(delta.content)
      }

      for (const toolCall of delta.tool_calls ?? []) {
        const index = toolCall.index ?? 0
        const current = toolParts.get(index) ?? { id: '', name: '', arguments: '' }
        if (toolCall.id) current.id = toolCall.id
        if (toolCall.function?.name) current.name += toolCall.function.name
        if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments
        toolParts.set(index, current)
      }
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        consumeLine(line)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) consumeLine(buffer)

    if (!streamDone && !finishReason) throw new LlmError('DeepSeek stream ended before completion', 'INVALID_RESPONSE')
    const finishError = streamFinishError(finishReason)
    if (finishError) throw finishError

    const toolCalls = [...toolParts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, item]) => item)

    const normalizedContent = content.trim()
    if (normalizedContent || (allowToolCalls && toolCalls.length > 0)) {
      return { content: normalizedContent, toolCalls }
    }
    throw new LlmError('DeepSeek returned an empty final answer', 'EMPTY_RESPONSE')
  } catch (err) {
    if (runContext.getStore()?.signal.aborted) throw err
    if (signal.aborted) {
      throw new LlmError('DeepSeek request timed out', 'TIMEOUT')
    }
    if (err instanceof LlmError) throw err
    throw new LlmError('Could not reach DeepSeek API: ' + (err as Error).message, 'NETWORK')
  }
}

/**
 * Plain chat completion (non-streaming). Uses strict JSON mode for deterministic
 * object-shaped output. On paths that may involve tool calls use chatWithTools.
 */
export async function chatComplete(messages: LlmMessage[]): Promise<string> {
  const result = await requestAssistant(
    { messages, temperature: 0.4, response_format: { type: 'json_object' } },
    false,
  )
  return result.content
}

/** Plain non-streaming completion retained for cached/fallback flows. */
export async function chatText(messages: LlmMessage[]): Promise<string> {
  return (await requestAssistant({ messages, temperature: 0.3 }, false)).content
}

/** Stream plain assistant content as soon as DeepSeek emits it. */
export async function chatTextStream(
  messages: LlmMessage[],
  onContentDelta: (delta: string) => void,
): Promise<string> {
  return (await requestAssistantStream({ messages, temperature: 0.3 }, false, onContentDelta)).content
}

/**
 * Chat completion that exposes DeepSeek function-calling. The model may pick a
 * tool + arguments, but it never executes anything — the backend does.
 */
export async function chatWithTools(
  messages: LlmMessage[],
  tools: readonly LlmFunctionDef[],
): Promise<ChatWithToolsResult> {
  return requestAssistant({ messages, tools, tool_choice: 'auto', temperature: 0.3 }, true)
}

/** Streaming variant used by research flows so the final A2UI can arrive message-by-message. */
export async function chatWithToolsStream(
  messages: LlmMessage[],
  tools: readonly LlmFunctionDef[],
  onContentDelta: (delta: string) => void,
): Promise<ChatWithToolsResult> {
  return requestAssistantStream(
    { messages, tools, tool_choice: 'auto', temperature: 0.3 },
    true,
    onContentDelta,
  )
}
