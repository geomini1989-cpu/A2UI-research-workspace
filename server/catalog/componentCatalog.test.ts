import { describe, it, expect } from 'vitest'
import {
  COMPONENT_CATALOG,
  BASIC_COMPONENT_NAMES,
  BUSINESS_COMPONENT_NAMES,
  ALLOWED_COMPONENTS,
  CATALOG_METADATA,
  describeCatalog,
} from './componentCatalog.js'
import { ALLOWED_COMPONENTS as SERVER_ALLOWED, isAllowedComponent } from '../a2ui/a2uiSchema.js'

describe('COMPONENT_CATALOG (single source of truth)', () => {
  it('contains 13 basic + 7 business components (20 total)', () => {
    expect(BASIC_COMPONENT_NAMES).toHaveLength(13)
    expect(BUSINESS_COMPONENT_NAMES).toHaveLength(7)
    expect(COMPONENT_CATALOG).toHaveLength(20)
  })

  it('exposes the expected business components', () => {
    expect(BUSINESS_COMPONENT_NAMES).toEqual(
      expect.arrayContaining(['FilterBar', 'MetricCard', 'ComparisonCard', 'StockOverview', 'ResearchSummary', 'RiskBadge', 'InsightList']),
    )
  })

  it('has unique names and no duplicate entries', () => {
    const names = COMPONENT_CATALOG.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('provides machine-readable metadata for every component (name/description/props/required)', () => {
    expect(CATALOG_METADATA).toHaveLength(COMPONENT_CATALOG.length)
    for (const meta of CATALOG_METADATA) {
      expect(meta.name).toBeTruthy()
      expect(meta.description.length).toBeGreaterThan(0)
      expect(typeof meta.props).toBe('object')
      expect(Array.isArray(meta.required)).toBe(true)
    }
  })

  it('documents the required props for MetricCard and ComparisonCard', () => {
    const metric = COMPONENT_CATALOG.find((c) => c.name === 'MetricCard')!
    expect(metric.required).toEqual(expect.arrayContaining(['title', 'value']))
    const compare = COMPONENT_CATALOG.find((c) => c.name === 'ComparisonCard')!
    expect(compare.props.rows).toContain('array<{metric,left,right}>')
  })

  it('documents wide time-series metric switching for Chart filters', () => {
    const chart = COMPONENT_CATALOG.find((c) => c.name === 'Chart')!
    expect(chart.props.filters).toContain('metrics:[{key,label}]')
    expect(chart.props.filters).toContain('defaultMetric?')
    expect(chart.props.filters).toContain('switches yKey')
  })

  it('generates a prompt block that names the business components', () => {
    const text = describeCatalog()
    expect(text).toContain('MetricCard')
    expect(text).toContain('ComparisonCard')
    expect(text).toContain('RiskBadge')
    expect(text).toContain('COMPONENT CATALOG')
  })
})

describe('allow-list is derived from the catalog', () => {
  it('keeps the server sanitizer allow-list in sync with the catalog', () => {
    expect(SERVER_ALLOWED).toEqual(ALLOWED_COMPONENTS)
    expect(SERVER_ALLOWED).toHaveLength(20)
  })
})

describe('isAllowedComponent (via a2uiSchema)', () => {
  it('accepts every catalog component, including the business layer', () => {
    for (const c of COMPONENT_CATALOG) {
      expect(isAllowedComponent(c.name)).toBe(true)
    }
  })

  it('rejects an arbitrary/unknown component name', () => {
    expect(isAllowedComponent('UnknownComponent')).toBe(false)
    expect(isAllowedComponent('iframe')).toBe(false)
    expect(isAllowedComponent('MetricCard2')).toBe(false)
  })
})
