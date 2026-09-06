import * as React from 'react'
import { createComponentImplementation } from '@a2ui/react/v0_9'
import { z } from 'zod'

import { cn } from '@/lib/utils'
import { DetailDrawer } from './DetailDrawer'
import { TABLE_PREVIEW_ROWS } from './presentation'
import { createMockMetricDetail, publishMetricChartDetail } from './metricChartInteraction'

const weight = z.number().optional()
const SemanticAction = z.object({
  event: z.object({ name: z.string(), context: z.record(z.string(), z.unknown()).optional() }),
})
const InlineDetail = z.object({
  title: z.string().optional(), summary: z.string().optional(), keyPoints: z.array(z.string()).default([]),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).optional(),
  targetChartId: z.string().optional(),
})
type SemanticActionValue = z.infer<typeof SemanticAction>

function dispatch(context: any, action: SemanticActionValue | undefined, extra: Record<string, unknown> = {}) {
  if (!action) return
  const { interactionMode: _interactionMode, ...safeContext } = action.event.context ?? {}
  void context.dispatchAction({ event: { ...action.event, context: { ...safeContext, ...extra } } })
}

function weightStyle(value?: number): React.CSSProperties {
  if (typeof value !== 'number') return {}
  return { flex: `${value}`, minWidth: 0, minHeight: 0 }
}

function changeClass(change: unknown): string {
  const value = String(change ?? '')
  if (/^\+/.test(value)) return 'genui-positive'
  if (/^-/.test(value) || /%$/.test(value) && /-/.test(value)) return 'genui-negative'
  return 'genui-muted'
}

export const MetricCard = createComponentImplementation(
  {
    name: 'MetricCard',
    schema: z.object({
      title: z.string(), value: z.string(), change: z.string().optional(),
      description: z.string().optional(), detail: InlineDetail.optional(), action: SemanticAction.optional(), weight,
    }),
  },
  ({ props, context }: any) => {
    const interactive = Boolean(props.value || props.action)
    const click = () => {
      if (props.action?.event.context?.interactionMode === 'research') {
        dispatch(context, props.action)
        return
      }
      const generatedData = props.detail?.data
      const fallback = createMockMetricDetail(props.title, props.value)
      publishMetricChartDetail({
        ...fallback,
        title: props.detail?.title ?? fallback.title,
        summary: props.detail?.summary ?? fallback.summary,
        data: Array.isArray(generatedData) && generatedData.length > 0 ? generatedData : fallback.data,
        targetChartId: props.detail?.targetChartId,
      })
    }
    return <div className="genui-metric-wrap" style={weightStyle(props.weight)}>
      <button type="button" className={cn('genui-metric', interactive && 'genui-interactive')} onClick={click} aria-label={`在下方图表查看${props.title}详情`}>
      <div className="genui-metric__label">{props.title ?? '—'}</div>
      <div className="genui-metric__value">{props.value ?? '—'}</div>
      {props.change && <div className={cn('genui-metric__change', changeClass(props.change))}>{props.change}</div>}
      {props.description && <div className="genui-metric__description">{props.description}</div>}
      </button>
    </div>
  },
)

export const ComparisonCard = createComponentImplementation(
  {
    name: 'ComparisonCard',
    schema: z.object({
      title: z.string().optional(), left: z.string().optional(), right: z.string().optional(),
      rows: z.array(z.record(z.string(), z.any())).default([]), rowAction: SemanticAction.optional(), weight,
    }),
  },
  ({ props, context }: any) => {
    const rows: Record<string, unknown>[] = Array.isArray(props.rows) ? props.rows : []
    const left = props.left ?? 'A'
    const right = props.right ?? 'B'
    const detail = rows.length > TABLE_PREVIEW_ROWS
    const renderRows = (visibleRows: Record<string, unknown>[]) => (
      <div className="genui-comparison__table" role="table" aria-label={`${left} and ${right} comparison`}>
        <div className="genui-comparison__row genui-comparison__head" role="row">
          <div role="columnheader">指标</div>
          <div role="columnheader">{left}</div>
          <div role="columnheader">{right}</div>
        </div>
        {visibleRows.map((row, index) => (
          <div key={index} className={cn('genui-comparison__row', props.rowAction && 'genui-interactive')} role="row" tabIndex={props.rowAction ? 0 : undefined} onClick={() => dispatch(context, props.rowAction, Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)])))} onKeyDown={(event) => { if (props.rowAction && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); dispatch(context, props.rowAction, Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)]))) } }}>
            <div role="rowheader">{String(row.metric ?? '—')}</div>
            <div role="cell">{String(row.left ?? '—')}</div>
            <div role="cell">{String(row.right ?? '—')}</div>
          </div>
        ))}
      </div>
    )
    return (
      <section className="genui-comparison" style={weightStyle(props.weight)}>
        {props.title && <h3>{props.title}</h3>}
        {renderRows(detail ? rows.slice(0, TABLE_PREVIEW_ROWS) : rows)}
        {detail && (
          <div className="genui-detail-row">
            <span>显示 {TABLE_PREVIEW_ROWS} / {rows.length} 项指标</span>
            <DetailDrawer title={props.title ?? `${left} 与 ${right} 对比`} triggerLabel="查看完整对比">
              <div className="genui-comparison genui-comparison--drawer">{renderRows(rows)}</div>
            </DetailDrawer>
          </div>
        )}
      </section>
    )
  },
)

export const StockOverview = createComponentImplementation(
  {
    name: 'StockOverview',
    schema: z.object({
      company: z.string().optional(), ticker: z.string().optional(), price: z.string().optional(),
      change: z.string().optional(), marketCap: z.string().optional(), action: SemanticAction.optional(), weight,
    }),
  },
  ({ props, context }: any) => (
    <button type="button" className={cn('genui-stock', props.action && 'genui-interactive')} style={weightStyle(props.weight)} onClick={() => dispatch(context, props.action)}>
      <div>
        <div className="genui-stock__identity">
          <strong>{props.company ?? '未知公司'}</strong>
          {props.ticker && <span>{props.ticker}</span>}
        </div>
        {props.change && <div className={cn('genui-stock__change', changeClass(props.change))}>{props.change}</div>}
      </div>
      <div className="genui-stock__price">
        <strong>{props.price ?? '—'}</strong>
        {props.marketCap && <span>市值 {props.marketCap}</span>}
      </div>
    </button>
  ),
)

export const ResearchSummary = createComponentImplementation(
  {
    name: 'ResearchSummary',
    schema: z.object({
      title: z.string().optional(), summary: z.string().optional(),
      keyPoints: z.array(z.string()).default([]), weight,
    }),
  },
  ({ props }: any) => {
    const keyPoints: string[] = Array.isArray(props.keyPoints) ? props.keyPoints : []
    return (
      <section className="genui-summary" style={weightStyle(props.weight)}>
        {props.title && <h3>{props.title}</h3>}
        {props.summary && <p>{props.summary}</p>}
        {keyPoints.length > 0 && <ul>{keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>}
      </section>
    )
  },
)

export const RiskBadge = createComponentImplementation(
  {
    name: 'RiskBadge',
    schema: z.object({
      level: z.string(), label: z.string().optional(), description: z.string().optional(), action: SemanticAction.optional(), weight,
    }),
  },
  ({ props, context }: any) => {
    const level = String(props.level || 'MEDIUM').toUpperCase()
    const state = level === 'HIGH' ? 'danger' : level === 'LOW' ? 'success' : 'warning'
    return (
      <button type="button" className={cn('genui-risk', props.action && 'genui-interactive')} data-state={state} style={weightStyle(props.weight)} onClick={() => dispatch(context, props.action)}>
        <span>{level}</span>
        <div>
          {props.label && <strong>{props.label}</strong>}
          {props.description && <p>{props.description}</p>}
        </div>
      </button>
    )
  },
)

export const InsightList = createComponentImplementation(
  {
    name: 'InsightList',
    schema: z.object({ items: z.array(z.string()).default([]), weight }),
  },
  ({ props }: any) => {
    const items: string[] = Array.isArray(props.items) ? props.items : []
    return (
      <section className="genui-insights" style={weightStyle(props.weight)}>
        <h3>关键洞察</h3>
        <ul>
          {items.map((item, index) => <li key={index}>{item}</li>)}
          {items.length === 0 && <li className="genui-minor-state">暂无洞察。</li>}
        </ul>
      </section>
    )
  },
)

export const BUSINESS_COMPONENTS: Record<string, ReturnType<typeof createComponentImplementation>> = {
  MetricCard, ComparisonCard, StockOverview, ResearchSummary, RiskBadge, InsightList,
}
