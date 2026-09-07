import { describe, expect, it } from 'vitest'

import { isResearchComposerRequest } from './researchComposer.js'

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
