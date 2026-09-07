import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config.js', () => ({
  config: {
    deepseekApiKey: 'test-key',
    deepseekModel: 'deepseek-v4-flash',
    deepseekBaseUrl: 'https://api.deepseek.test',
  },
}))

import { chatText, chatTextStream, chatWithTools, chatWithToolsStream, LlmError } from './deepseek.js'

const response = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
})

const streamResponse = (events: unknown[]) => new Response(
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
)

afterEach(() => vi.unstubAllGlobals())

describe('DeepSeek response handling', () => {
  it('disables thinking and sets a bounded output size for A2UI requests', async () => {
    const request = vi.fn<typeof fetch>(async () => response({
      choices: [{ finish_reason: 'stop', message: { content: '[{"ok":true}]' } }],
    }))
    vi.stubGlobal('fetch', request)

    await expect(chatText([{ role: 'user', content: 'Generate JSON UI' }])).resolves.toBe('[{"ok":true}]')
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      max_tokens: 8192,
    })
  })

  it('retries once when DeepSeek returns reasoning without a final answer', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(response({
        choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: 'internal reasoning' } }],
      }))
      .mockResolvedValueOnce(response({
        choices: [{ finish_reason: 'stop', message: { content: '[{"version":"v0.9"}]' } }],
      }))
    vi.stubGlobal('fetch', request)

    await expect(chatText([{ role: 'user', content: 'Generate JSON UI' }])).resolves.toContain('v0.9')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('reports length truncation accurately without calling it an empty response', async () => {
    const request = vi.fn(async () => response({
      choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'unfinished' } }],
    }))
    vi.stubGlobal('fetch', request)

    await expect(chatText([{ role: 'user', content: 'Generate JSON UI' }])).rejects.toMatchObject({
      code: 'OUTPUT_TRUNCATED',
    } satisfies Partial<LlmError>)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('streams content deltas and sets stream:true', async () => {
    const request = vi.fn<typeof fetch>(async () => streamResponse([
      { choices: [{ delta: { content: '{"version":"v0.9",' }, finish_reason: null }] },
      { choices: [{ delta: { content: '"createSurface":{"surfaceId":"s","catalogId":"research.v0.9","theme":{}}}' }, finish_reason: null }] },
      { choices: [{ delta: { content: '}' }, finish_reason: 'stop' }] },
    ]))
    vi.stubGlobal('fetch', request)
    const chunks: string[] = []

    const content = await chatTextStream([{ role: 'user', content: 'Generate A2UI' }], (delta) => chunks.push(delta))
    expect(content).toContain('createSurface')
    expect(chunks).toHaveLength(3)
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(body.stream).toBe(true)
  })

  it('assembles streamed tool-call argument chunks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'get_company_profile', arguments: '{"company":' } }] }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"NVIDIA"}' } }] }, finish_reason: 'tool_calls' }] },
    ])))

    await expect(chatWithToolsStream(
      [{ role: 'user', content: 'Research NVIDIA' }],
      [{ type: 'function', function: { name: 'get_company_profile', parameters: {} } }],
      () => {},
    )).resolves.toMatchObject({
      content: '',
      toolCalls: [{ id: 'call-1', name: 'get_company_profile', arguments: '{"company":"NVIDIA"}' }],
    })
  })

  it('accepts an empty assistant content when a valid tool call is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [{ id: 'call-1', function: { name: 'get_company_profile', arguments: '{"company":"NVIDIA"}' } }],
        },
      }],
    })))

    await expect(chatWithTools(
      [{ role: 'user', content: 'Research NVIDIA' }],
      [{ type: 'function', function: { name: 'get_company_profile', parameters: {} } }],
    )).resolves.toMatchObject({ content: '', toolCalls: [{ id: 'call-1', name: 'get_company_profile' }] })
  })
})
