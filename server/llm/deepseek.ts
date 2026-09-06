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
  choices?: {
    finish_reason?: string | null
    message?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]
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

function isRetryableResponseError(error: LlmError): boolean {
  return ['UPSTREAM_RESOURCE', 'EMPTY_FINAL_ANSWER', 'EMPTY_RESPONSE', 'INVALID_RESPONSE'].includes(error.code ?? '')
}

async function requestJson(body: Record<string, unknown>): Promise<ChatResponse> {
  if (!config.deepseekApiKey) {
    throw new LlmError('Missing DEEPSEEK_API_KEY in the environment', 'NO_API_KEY')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

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
        // A2UI and tool selection need a final machine-readable answer, not a
        // long chain-of-thought. V4 enables thinking by default, so opt out.
        thinking: { type: 'disabled' },
        max_tokens: 8_192,
        ...body,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error).name === 'AbortError') {
      throw new LlmError('DeepSeek request timed out', 'TIMEOUT')
    }
    throw new LlmError('Could not reach DeepSeek API: ' + (err as Error).message, 'NETWORK')
  }

  clearTimeout(timer)

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    const status = res.status === 401 ? 'INVALID_API_KEY' : 'HTTP_' + res.status
    throw new LlmError(`DeepSeek request failed (${res.status}): ${bodyText.slice(0, 500)}`, status)
  }

  return (await res.json()) as ChatResponse
}

async function requestAssistant(
  body: Record<string, unknown>,
  allowToolCalls: boolean,
): Promise<AssistantMessage> {
  let lastError: LlmError | undefined
  for (let attempt = 1; attempt <= MAX_RESPONSE_ATTEMPTS; attempt++) {
    const data = await requestJson(body)
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
 * Plain chat completion (non-streaming). Uses strict JSON mode for deterministic
 * A2UI output. On the path that may involve tool calls use `chatWithTools`.
 */
export async function chatComplete(messages: LlmMessage[]): Promise<string> {
  const result = await requestAssistant(
    { messages, temperature: 0.4, response_format: { type: 'json_object' } },
    false,
  )
  return result.content
}

/** Plain completion for top-level JSON arrays such as A2UI (JSON object mode forbids arrays). */
export async function chatText(messages: LlmMessage[]): Promise<string> {
  return (await requestAssistant({ messages, temperature: 0.3 }, false)).content
}

/**
 * Chat completion that exposes DeepSeek function-calling. The model may pick a
 * tool + arguments, but it never executes anything — the backend does. No
 * `response_format` here because JSON mode is incompatible with tool calls.
 */
export async function chatWithTools(
  messages: LlmMessage[],
  tools: readonly LlmFunctionDef[],
): Promise<ChatWithToolsResult> {
  return requestAssistant({ messages, tools, tool_choice: 'auto', temperature: 0.3 }, true)
}
