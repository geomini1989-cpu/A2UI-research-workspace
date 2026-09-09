import { describe, expect, it } from 'vitest'

import { validateAndCompileBusinessComponent } from './businessComponentContract.js'

describe('businessComponentContract', () => {
  it('maps every semantic Agent card to a fixed renderer component', () => {
    const fixtures = [
      [{ component: 'StockOverviewCard', id: 's', company: 'NVIDIA' }, 'StockOverview'],
      [{ component: 'MetricCard', id: 'm', title: '营收', value: '1' }, 'MetricCard'],
      [{ component: 'ComparisonCard', id: 'c', rows: [{ metric: '营收', left: '1', right: '2' }] }, 'ComparisonCard'],
      [{ component: 'TrendChartCard', id: 't', data: [{ period: 'Q1', value: 1 }], xKey: 'period', yKey: 'value' }, 'Chart'],
      [{ component: 'RiskCard', id: 'r', level: 'HIGH' }, 'RiskBadge'],
      [{ component: 'InsightCard', id: 'i', items: ['要点'] }, 'InsightList'],
      [{ component: 'ResearchSummaryCard', id: 'rs', keyPoints: ['要点'] }, 'ResearchSummary'],
      [{ component: 'FilterCard', id: 'f', filters: [{ key: 'company', label: '公司', options: [{ value: 'NVDA', label: 'NVIDIA' }] }], action: { event: { name: 'apply_filters' } } }, 'FilterBar'],
    ] as const

    for (const [raw, renderer] of fixtures) {
      const result = validateAndCompileBusinessComponent(raw as unknown as Record<string, unknown>)
      expect(result).not.toBeNull()
      expect(result!.component.component).toBe(renderer)
    }
  })

  it('removes model-invented presentation props at the contract boundary', () => {
    const result = validateAndCompileBusinessComponent({
      component: 'MetricCard',
      id: 'm',
      title: '营收',
      value: '1',
      weight: 9,
      variant: 'hero',
      color: 'red',
      className: 'evil',
    })

    expect(result).not.toBeNull()
    expect(result!.component).toEqual({
      component: 'MetricCard',
      id: 'm',
      title: '营收',
      value: '1',
    })
  })

  it('locks TrendChartCard to one renderer presentation', () => {
    const result = validateAndCompileBusinessComponent({
      component: 'TrendChartCard',
      id: 't',
      title: '营收趋势',
      type: 'area',
      height: 999,
      data: [{ period: 'Q1', value: 1 }],
      xKey: 'period',
      yKey: 'value',
    })

    expect(result).not.toBeNull()
    expect(result!.component.component).toBe('Chart')
    expect(result!.component.type).toBe('line')
    expect(result!.component.height).toBe(220)
  })

  it('rejects invalid business semantics instead of coercing them', () => {
    expect(validateAndCompileBusinessComponent({
      component: 'RiskCard',
      id: 'risk',
      level: 'CRITICAL',
    })).toBeNull()

    expect(validateAndCompileBusinessComponent({
      component: 'MetricCard',
      id: 'metric',
      title: '',
      value: '',
    })).toBeNull()

    expect(validateAndCompileBusinessComponent({
      component: 'FilterCard',
      id: 'filter',
      filters: [{ key: 'company', label: '公司', options: [{ value: 'NVDA', label: 'NVIDIA' }] }],
      action: { event: { name: 'explore_company' } },
    })).toBeNull()
  })
})
