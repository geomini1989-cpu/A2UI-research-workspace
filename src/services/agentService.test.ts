import { describe, expect, it } from 'vitest'
import { consumeNdjson } from './agentService'

describe('NDJSON lifecycle', () => {
  it('reads the final line without a newline and accepts a waiting interaction', async () => {
    const events: string[] = []
    await consumeNdjson(new Response('{"type":"task_state","state":"WAITING_FOR_USER","taskId":"t"}'), event => events.push(event.type))
    expect(events).toEqual(['task_state'])
  })
  it('rejects premature EOF and preserves renderer failures', async () => {
    await expect(consumeNdjson(new Response('{"type":"status","status":"working"}\n'), () => {})).rejects.toThrow('提前结束')
    await expect(consumeNdjson(new Response('{"type":"message","message":{}}\n{"type":"done"}\n'), () => { throw new Error('renderer failed') })).rejects.toThrow('renderer failed')
  })
})
