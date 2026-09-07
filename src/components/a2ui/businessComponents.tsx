import * as React from 'react'
import { createComponentImplementation } from '@a2ui/react/v0_9'
import { z } from 'zod'

import { cn } from '@/lib/utils'
import { DetailDrawer } from './DetailDrawer'
import { TABLE_PREVIEW_ROWS } from './presentation'
import { hasInlineMetricDetail, isResearchInteraction } from './actionPolicy'

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

function compactText(value: unknown, max = 72): string {
  const text = String(value ?? '').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max).replace(/[，。；、\s]+$/u, '')}…`
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
    const [expanded, setExpanded] = React.useState(false)
    const researchAction = isResearchInteraction(props.action) ? props.action : undefined
    const inlineDetail = hasInlineMetricDetail(props.detail)
    const interactive = Boolean(researchAction || inlineDetail)
    const detailTitle = props.detail?.title ?? `${props.title} · 关键补充`
    const detailSummary = inlineDetail ? compactText(props.detail?.summary ?? '', 84) : ''
    const detailPoints: string[] = inlineDetail && Array.isArray(props.detail?.keyPoints)
      ? props.detail.keyPoints.slice(0, 2).map((point: string) => compactText(point, 56))
      : []

    const content = (
      <>
        <div className="genui-metric__label">{props.title ?? '—'}</div>
        <div className="genui-metric__value">{props.value ?? '—'}</div>
        {props.change && <div className={cn('genui-metric__change', changeClass(props.change))}>{props.change}</div>}
        {props.description && <div className="genui-metric__description">{compactText(props.description, 48)}</div>}
      </>
    )

    const click = () => {
      if (researchAction) {
        dispatch(context, researchAction)
        return
      }
      if (inlineDetail) setExpanded((current) => !current)
    }

    return <div className="genui-metric-wrap" style={weightStyle(props.weight)}>
      {interactive ? (
        <button
          type="button"
          className="genui-metric genui-interactive"
          onClick={click}
          aria-expanded={inlineDetail ? expanded : undefined}
          aria-label={researchAction ? `追问${props.title}` : `查看${props.title}关键补充`}
        >
          {content}
        </button>
      ) : (
        <div className="genui-metric">{content}</div>
      )}
      {inlineDetail && expanded && (
        <section className="genui-inline-detail" aria-live="polite">
          <strong>{detailTitle}</strong>
          {detailSummary && <p>{detailSummary}</p>}
          {detailPoints.length > 0 && <ul>{detailPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>}
          <button type="button" onClick={() => setExpanded(false)}>收起</button>
        </section>
      )}
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
        {visibleRows.map((row, index) => {
          const rowAction = isResearchInteraction(props.rowAction) ? props.rowAction : undefined
          return (
          <div key={index} className={cn('genui-comparison__row', rowAction && 'genui-interactive')} role="row" tabIndex={rowAction ? 0 : undefined} onClick={() => dispatch(context, rowAction, Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)])))} onKeyDown={(event) => { if (rowAction && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); dispatch(context, rowAction, Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)]))) } }}>
            <div role="rowheader">{String(row.metric ?? '—')}</div>
            <div role="cell">{String(row.left ?? '—')}</div>
            <div role="cell">{String(row.right ?? '—')}</div>
          </div>
          )
        })}
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
  ({ props, context }: any) => {
    const action = isResearchInteraction(props.action) ? props.action : undefined
    const content = (
      <>
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
      </>
    )
    return action ? (
      <button type="button" className="genui-stock genui-interactive" style={weightStyle(props.weight)} onClick={() => dispatch(context, action)}>
        {content}
      </button>
    ) : (
      <div className="genui-stock" style={weightStyle(props.weight)}>{content}</div>
    )
  },
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
    const keyPoints: string[] = Array.isArray(props.keyPoints)
      ? props.keyPoints.slice(0, 3).map((point: string) => compactText(point, 60))
      : []
    const summary = compactText(props.summary, 90)
    return (
      <section className="genui-summary" style={weightStyle(props.weight)}>
        {props.title && <h3>{props.title}</h3>}
        {summary && <p>{summary}</p>}
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
    const action = isResearchInteraction(props.action) ? props.action : undefined
    const content = (
      <>
        <span>{level}</span>
        <div>
          {props.label && <strong>{props.label}</strong>}
          {props.description && <p>{compactText(props.description, 64)}</p>}
        </div>
      </>
    )
    return action ? (
      <button type="button" className="genui-risk genui-interactive" data-state={state} style={weightStyle(props.weight)} onClick={() => dispatch(context, action)}>
        {content}
      </button>
    ) : (
      <div className="genui-risk" data-state={state} style={weightStyle(props.weight)}>{content}</div>
    )
  },
)


const FILTER_KEYS = ['company', 'metric', 'segment', 'period', 'timeRange'] as const
const FilterOption = z.object({ value: z.string(), label: z.string() })
const FilterSpec = z.object({
  key: z.enum(FILTER_KEYS),
  label: z.string(),
  options: z.array(FilterOption).min(1),
  defaultValue: z.string().optional(),
})

export const FilterBar = createComponentImplementation(
  {
    name: 'FilterBar',
    schema: z.object({
      title: z.string().optional(),
      filters: z.array(FilterSpec).min(1),
      action: SemanticAction,
      weight,
    }),
  },
  ({ props, context }: any) => {
    const filters = Array.isArray(props.filters) ? props.filters : []
    const [values, setValues] = React.useState<Record<string, string>>(() =>
      Object.fromEntries(filters.map((filter: any) => [
        filter.key,
        filter.defaultValue ?? filter.options?.[0]?.value ?? '',
      ])),
    )

    return (
      <section className="genui-filterbar" style={weightStyle(props.weight)} aria-label={props.title ?? '分析筛选'}>
        <div className="genui-filterbar__heading">
          <div>
            <span>筛选条件</span>
            <h3>{props.title ?? '调整分析范围'}</h3>
          </div>
          <button type="button" className="genui-filterbar__apply" onClick={() => dispatch(context, props.action, values)}>
            更新分析
          </button>
        </div>
        <div className="genui-filterbar__fields">
          {filters.map((filter: any) => (
            <label key={filter.key}>
              <span>{filter.label}</span>
              <select
                value={values[filter.key] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [filter.key]: event.target.value }))}
              >
                {filter.options.map((option: any) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>
    )
  },
)

export const InsightList = createComponentImplementation(
  {
    name: 'InsightList',
    schema: z.object({ items: z.array(z.string()).default([]), weight }),
  },
  ({ props }: any) => {
    const items: string[] = Array.isArray(props.items)
      ? props.items.slice(0, 3).map((item: string) => compactText(item, 60))
      : []
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
  MetricCard, ComparisonCard, StockOverview, ResearchSummary, RiskBadge, FilterBar, InsightList,
}
