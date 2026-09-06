import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  inferPresentationMode,
  needsChartDetail,
  needsTableDetail,
  processSummary,
  TABLE_PREVIEW_ROWS,
} from '../../src/components/a2ui/presentation.js'

const styles = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')

describe('Conversation-native UI acceptance scenarios', () => {
  it('1. renders a valuation-only request in compact mode', () => {
    expect(inferPresentationMode('分析 NVIDIA 的估值')).toBe('compact')
  })

  it('2. renders a normal company analysis in standard mode', () => {
    expect(inferPresentationMode('分析 NVIDIA')).toBe('standard')
  })

  it('3. renders comprehensive multi-dimension research in rich mode', () => {
    expect(inferPresentationMode('全面分析 NVIDIA，包含财务、市场和技术')).toBe('rich')
  })

  it('4. gives company comparison a rich responsive presentation', () => {
    expect(inferPresentationMode('比较 NVIDIA 和 AMD')).toBe('rich')
    expect(styles).toContain('.genui-comparison__row')
  })

  it('5. keeps HITL controls inside the embedded generated response', () => {
    expect(styles).toContain('.assistant-generated')
    expect(styles).toContain('.genui-choice')
    expect(styles).toContain('.genui-field')
  })

  it('6. presents partial or input failures as a quiet inline state', () => {
    expect(styles).toContain('.genui-inline-error')
    expect(styles).toContain('.genui-minor-state')
  })

  it('7. caps long-table previews and moves the full data to details', () => {
    expect(TABLE_PREVIEW_ROWS).toBeGreaterThanOrEqual(5)
    expect(TABLE_PREVIEW_ROWS).toBeLessThanOrEqual(8)
    expect(needsTableDetail(TABLE_PREVIEW_ROWS + 1, 3)).toBe(true)
    expect(needsTableDetail(4, 3)).toBe(false)
  })

  it('8. promotes only complex charts to a detail view', () => {
    expect(needsChartDetail(12, 220)).toBe(true)
    expect(needsChartDetail(6, 220)).toBe(false)
    expect(styles).toContain('.genui-drawer')
  })

  it('9. collapses rows and lower-priority columns around a 400px container', () => {
    expect(styles).toMatch(/@container genui \(max-width: 27rem\)/)
    expect(styles).toContain('flex-direction: column !important')
  })

  it('10. supports a medium container without a viewport-only breakpoint', () => {
    expect(styles).toMatch(/@container genui \(max-width: 38rem\)/)
    expect(styles).toContain('container: genui / inline-size')
  })

  it('11. limits rich results inside a large chat container', () => {
    expect(styles).toContain(".genui-root[data-mode='rich'] { max-width: 66rem; }")
    expect(styles).toContain('width: min(100% - 2rem, 70rem)')
  })

  it('12. provides host-driven dark mode tokens', () => {
    expect(styles).toMatch(/\.dark\s*\{/)
    expect(styles).toContain('--genui-surface: var(--card)')
  })

  it('keeps detailed process information behind progressive disclosure', () => {
    expect(processSummary('RUNNING', [])).toBe('正在分析…')
    expect(processSummary('WAITING_FOR_USER', [])).toBe('等待你的输入')
    expect(styles).toContain('.genui-process > summary')
  })

  it('respects reduced-motion preferences', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
