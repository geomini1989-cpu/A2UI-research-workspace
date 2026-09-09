import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runAutonomousResearch: vi.fn(async () => undefined),
}))

vi.mock('../agent/researchAgent.js', () => ({
  runAutonomousResearch: mocks.runAutonomousResearch,
}))

import { isResearchComposerRequest, runResearchComposerAction } from './researchComposer.js'

describe('isResearchComposerRequest', () => {
  it('recognizes product-facing custom research wording', () => {
    expect(isResearchComposerRequest('打开 NVIDIA 研究方案，我想自己选择研究方向')).toBe(true)
    expect(isResearchComposerRequest('我想自定义研究 NVIDIA')).toBe(true)
    expect(isResearchComposerRequest('帮我选择研究内容')).toBe(true)
  })

  it('does not intercept ordinary automatic research requests', () => {
    expect(isResearchComposerRequest('全面分析 NVIDIA 的财务和技术')).toBe(false)
    expect(isResearchComposerRequest('比较 NVIDIA 和 AMD')).toBe(false)
  })
})

describe('composer_start', () => {
  it('starts the generated research on a fresh surface instead of reusing the Composer surface', async () => {
    mocks.runAutonomousResearch.mockClear()
    const emit = vi.fn()

    await runResearchComposerAction({
      name: 'composer_start',
      surfaceId: 'composer-existing',
      context: {
        company: 'NVIDIA',
        selected: ['financial', 'technology'],
        comparison: '',
      },
    }, emit)

    expect(mocks.runAutonomousResearch).toHaveBeenCalledTimes(1)
    const args = mocks.runAutonomousResearch.mock.calls[0] as unknown as unknown[]
    expect(args).toHaveLength(4)
    expect(String(args[0])).toContain('NVIDIA')
    expect(args[1]).toBe(emit)
    expect(args[2]).toEqual(['financial', 'technology'])
    expect(typeof args[3]).toBe('string')
  })
})
