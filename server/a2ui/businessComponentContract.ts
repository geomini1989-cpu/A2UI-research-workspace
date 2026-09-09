import { z } from 'zod'

import {
  AGENT_TO_RENDERER_COMPONENT,
  type AgentComponentName,
} from '../catalog/componentCatalog.js'

const ACTION_NAMES = [
  'explore_metric',
  'explore_company',
  'explore_risk',
  'explore_segment',
  'explore_event',
  'explore_period',
  'compare_item',
  'show_details',
  'view_source',
  'change_time_range',
  'apply_filters',
] as const

const SemanticAction = z.object({
  event: z.object({
    name: z.enum(ACTION_NAMES),
    context: z.record(z.string(), z.unknown()).optional(),
  }),
})

const InlineDetail = z.object({
  title: z.string().trim().max(48).optional(),
  summary: z.string().trim().max(180).optional(),
  keyPoints: z.array(z.string().trim().max(80)).max(2).default([]),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).max(24).optional(),
  targetChartId: z.string().trim().max(80).optional(),
})

const ChartFilters = z.object({
  metricKey: z.string().trim().max(64).optional(),
  metricLabel: z.string().trim().max(24).optional(),
  metrics: z.array(z.object({
    key: z.string().trim().max(64),
    label: z.string().trim().max(24),
  })).max(8).default([]),
  defaultMetric: z.string().trim().max(64).optional(),
  timeRanges: z.array(z.object({
    value: z.string().trim().max(32),
    label: z.string().trim().max(24),
  })).max(6).default([]),
  rangeKey: z.string().trim().max(64).optional(),
  defaultRange: z.string().trim().max(32).optional(),
})

const ChartInteraction = z.object({
  pointAction: SemanticAction.optional(),
  barAction: SemanticAction.optional(),
  seriesAction: SemanticAction.optional(),
})

const FilterSpec = z.object({
  key: z.enum(['company', 'metric', 'segment', 'period', 'timeRange']),
  label: z.string().trim().min(1).max(24),
  options: z.array(z.object({
    value: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(40),
  })).min(1).max(20),
  defaultValue: z.string().trim().max(80).optional(),
})

const base = {
  id: z.string().trim().min(1).max(96),
}

const contracts = {
  StockOverviewCard: z.object({
    component: z.literal('StockOverviewCard'),
    ...base,
    company: z.string().trim().min(1).max(80),
    ticker: z.string().trim().max(24).optional(),
    price: z.string().trim().max(40).optional(),
    change: z.string().trim().max(40).optional(),
    marketCap: z.string().trim().max(40).optional(),
    action: SemanticAction.optional(),
  }),
  MetricCard: z.object({
    component: z.literal('MetricCard'),
    ...base,
    title: z.string().trim().min(1).max(32),
    value: z.string().trim().min(1).max(40),
    change: z.string().trim().max(32).optional(),
    description: z.string().trim().max(80).optional(),
    interactionGroup: z.string().trim().max(64).optional(),
    detail: InlineDetail.optional(),
    action: SemanticAction.optional(),
  }),
  ComparisonCard: z.object({
    component: z.literal('ComparisonCard'),
    ...base,
    title: z.string().trim().max(48).optional(),
    left: z.string().trim().max(48).optional(),
    right: z.string().trim().max(48).optional(),
    rows: z.array(z.object({
      metric: z.union([z.string(), z.number()]),
      left: z.union([z.string(), z.number()]),
      right: z.union([z.string(), z.number()]),
    })).min(1).max(12),
    rowAction: SemanticAction.optional(),
  }),
  TrendChartCard: z.object({
    component: z.literal('TrendChartCard'),
    ...base,
    title: z.string().trim().max(48).optional(),
    data: z.array(z.record(z.string(), z.unknown())).min(1).max(48),
    xKey: z.string().trim().max(64).optional(),
    yKey: z.string().trim().max(64).optional(),
    interaction: ChartInteraction.optional(),
    filters: ChartFilters.optional(),
  }),
  RiskCard: z.object({
    component: z.literal('RiskCard'),
    ...base,
    level: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    label: z.string().trim().max(48).optional(),
    description: z.string().trim().max(96).optional(),
    action: SemanticAction.optional(),
  }),
  InsightCard: z.object({
    component: z.literal('InsightCard'),
    ...base,
    items: z.array(z.string().trim().min(1).max(96)).min(1).max(3),
  }),
  ResearchSummaryCard: z.object({
    component: z.literal('ResearchSummaryCard'),
    ...base,
    title: z.string().trim().max(48).optional(),
    summary: z.string().trim().max(180).optional(),
    keyPoints: z.array(z.string().trim().min(1).max(96)).max(3).default([]),
  }),
  FilterCard: z.object({
    component: z.literal('FilterCard'),
    ...base,
    title: z.string().trim().max(48).optional(),
    filters: z.array(FilterSpec).min(1).max(5),
    action: SemanticAction.refine(
      (action) => action.event.name === 'apply_filters',
      'FilterCard action must be apply_filters',
    ),
  }),
} satisfies Record<AgentComponentName, z.ZodTypeAny>

export interface BusinessContractResult {
  component: Record<string, unknown>
  agentComponent: AgentComponentName
}

/**
 * Validate the semantic business component selected by the Agent, then compile
 * it to the renderer component name. Unknown props are stripped by Zod.
 *
 * This is the hard business-contract boundary between probabilistic model
 * output and deterministic A2UI rendering.
 */
export function validateAndCompileBusinessComponent(
  raw: Record<string, unknown>,
): BusinessContractResult | null {
  const name = raw.component
  if (typeof name !== 'string' || !(name in contracts)) return null

  const agentComponent = name as AgentComponentName
  const parsed = contracts[agentComponent].safeParse(raw)
  if (!parsed.success) return null

  const component = {
    ...(parsed.data as Record<string, unknown>),
    component: AGENT_TO_RENDERER_COMPONENT[agentComponent],
  }

  if (agentComponent === 'TrendChartCard') {
    // One stable renderer presentation for this semantic card type.
    component.type = 'line'
    component.height = 220
  }

  return { component, agentComponent }
}
