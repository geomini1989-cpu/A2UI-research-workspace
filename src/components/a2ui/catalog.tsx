/**
 * AI Research Workspace 的 A2UI 组件目录。
 * A2UI component catalog for the AI Research Workspace.
 *
 * 我们复用官方 A2UI v0.9 机制（MessageProcessor、SurfaceModel、GenericBinder、
 * createComponentImplementation），但提供自己的 React 渲染实现，让生成界面更像真实研究产品
 * （Tailwind + shadcn/ui），而不是无样式的基础组件目录。
 * We reuse the official A2UI v0.9 machinery (MessageProcessor, SurfaceModel,
 * GenericBinder, createComponentImplementation) but provide our own React
 * renderers so generated UI looks like a real research product (Tailwind +
 * shadcn/ui) instead of the unstyled basic catalog.
 *
 * Agent 只能输出 ALLOWED_COMPONENTS 中列出的组件；其他组件会被服务端拒绝/忽略，
 * 并被渲染器视为未知组件。
 * The Agent can emit only components listed in ALLOWED_COMPONENTS; everything
 * else is rejected/ignored by the server and treated as unknown by the renderer.
 */
import * as React from 'react'
import {
  createComponentImplementation,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9'
import { Catalog } from '@a2ui/web_core/v0_9'
import { z } from 'zod'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { SlidersHorizontal } from 'lucide-react'

import { COMPONENT_CATALOG } from '../../../server/catalog/componentCatalog'
import { BUSINESS_COMPONENTS } from './businessComponents'
import { DetailDrawer } from './DetailDrawer'
import { needsChartDetail, needsTableDetail, TABLE_PREVIEW_ROWS } from './presentation'
import { createMockMetricDetail, subscribeMetricChartDetail, type MetricChartDetail } from './metricChartInteraction'
import { isFollowUpAction, isResearchInteraction } from './actionPolicy'
import { cn } from '@/lib/utils'
import { Badge as ShadcnBadge } from '@/components/ui/badge'
import { Button as ShadcnButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table as ShadcnTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/* ------------------------------------------------------------------ */
/* Schema 辅助定义：保持 GenericBinder 可识别的结构 / Schema helpers structured for GenericBinder */
/* ------------------------------------------------------------------ */

/** 可为字面量字符串或数据模型路径绑定。 / A literal string or a data-model path binding. */
const DynString = z.union([z.string(), z.object({ path: z.string() })])
const DynStringList = z.union([z.array(z.string()), z.object({ path: z.string() })])
/**
 * 子组件引用列表：静态数组原样渲染；`{componentId, path}` 会把数据模型数组展开为子组件。
 * Child references: static arrays render as-is; `{componentId, path}` expands a data-model array into children.
 */
const ChildList = z.union([
  z.array(z.any()),
  z.object({ componentId: z.string(), path: z.string() }),
])
/** A2UI 动作（事件或函数调用），由 binder 解析为 () => void。 / An A2UI action resolved by the binder to () => void. */
const Action = z.union([
  z.object({
    event: z.object({
      name: z.string(),
      context: z.record(z.string(), z.any()).optional(),
    }),
  }),
  z.object({
    functionCall: z.object({
      call: z.string(),
      args: z.record(z.string(), z.any()),
      returnType: z
        .enum(['string', 'number', 'boolean', 'array', 'object', 'any', 'void'])
        .default('any'),
    }),
  }),
])
/** 保持为数据结构，便于复杂组件合并被点击行/点的上下文。 / Kept as data so richer components can merge clicked row/point context. */
const SemanticAction = z.object({
  event: z.object({ name: z.string(), context: z.record(z.string(), z.unknown()).optional() }),
})

function dispatchSemantic(context: any, action: z.infer<typeof SemanticAction> | undefined, extra: Record<string, unknown> = {}) {
  if (!action) return
  const { interactionMode: _interactionMode, ...safeContext } = action.event.context ?? {}
  void context.dispatchAction({ event: { ...action.event, context: { ...safeContext, ...extra } } })
}

/** 所有叶子组件共享的 Flex 尺寸辅助。 / Flex sizing helpers shared by every leaf component. */
const weight = z.number().optional()

function weightStyle(w?: number): React.CSSProperties {
  if (typeof w !== 'number') return {}
  return { flex: `${w}`, minWidth: 0, minHeight: 0 }
}

function restrainedGap(gap?: number): number {
  if (typeof gap !== 'number') return 16
  if (gap <= 8) return 8
  if (gap <= 16) return 16
  return 24
}

/** 通过 buildChild 渲染已解析的子组件列表（id 或 {id,basePath}）。 / Render resolved children via buildChild. */
function ChildListRenderer({
  list,
  buildChild,
}: {
  list: unknown
  buildChild: (id: string, basePath?: string) => React.ReactNode
}) {
  if (!Array.isArray(list)) return null
  return (
    <>
      {list.map((item, i) => {
        if (item && typeof item === 'object' && 'id' in item) {
          const node = item as { id: string; basePath?: string }
          return (
            <React.Fragment key={`${node.id}-${i}`}>
              {buildChild(node.id, node.basePath)}
            </React.Fragment>
          )
        }
        if (typeof item === 'string') {
          return (
            <React.Fragment key={`${item}-${i}`}>
              {buildChild(item)}
            </React.Fragment>
          )
        }
        return null
      })}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* 组件实现 / Component implementations                               */
/* ------------------------------------------------------------------ */

const Text = createComponentImplementation(
  { name: 'Text', schema: z.object({ text: DynString, variant: z.string().optional(), weight }) },
  ({ props }: any) => {
    const text = typeof props.text === 'string' ? props.text : String(props.text ?? '')
    const variant = props.variant ?? 'body'
    const map: Record<string, string> = {
      h1: 'genui-heading genui-heading--1',
      h2: 'genui-heading genui-heading--2',
      h3: 'genui-heading genui-heading--3',
      h4: 'genui-heading genui-heading--4',
      h5: 'genui-heading genui-heading--5',
      caption: 'genui-caption',
      body: 'genui-body',
    }
    const cls = map[variant] ?? map.body
    const Tag =
      variant === 'h1'
        ? 'h1'
        : variant === 'h2'
          ? 'h2'
          : variant === 'h3'
            ? 'h3'
            : variant === 'h4'
              ? 'h4'
              : variant === 'h5'
                ? 'h5'
                : 'p'
    return React.createElement(Tag, { className: cn(cls), style: weightStyle(props.weight) }, text)
  },
)

const Card = createComponentImplementation(
  {
    name: 'Card',
    schema: z.object({
      title: DynString.optional(),
      child: z.string().optional(),
      children: ChildList.optional(),
      weight,
    }),
  },
  ({ props, buildChild }: any) => (
    <section className="genui-card" style={weightStyle(props.weight)}>
      {props.title && <h3>{props.title}</h3>}
      {props.child ? buildChild(props.child) : null}
      <ChildListRenderer list={props.children} buildChild={buildChild} />
    </section>
  ),
)

const Button = createComponentImplementation(
  {
    name: 'Button',
    schema: z.object({
      label: DynString.optional(),
      child: z.string().optional(),
      action: Action,
      variant: z.enum(['primary', 'secondary', 'outline', 'ghost']).optional(),
      weight,
    }),
  },
  ({ props }: any) => {
    const variant =
      props.variant === 'primary'
        ? 'default'
        : props.variant === 'secondary'
          ? 'secondary'
          : props.variant === 'ghost'
            ? 'ghost'
            : 'outline'
    return (
      <ShadcnButton
        className="genui-action"
        variant={variant as any}
        style={weightStyle(props.weight)}
        onClick={props.action}
        disabled={props.isValid === false}
      >
        {props.label ?? 'Action'}
      </ShadcnButton>
    )
  },
)

const Badge = createComponentImplementation(
  {
    name: 'Badge',
    schema: z.object({
      label: DynString.optional(),
      text: DynString.optional(),
      variant: z.enum(['default', 'secondary', 'outline', 'destructive']).optional(),
      weight,
    }),
  },
  ({ props }: any) => {
    const rawLabel = String(props.label ?? props.text ?? '')
    const label = /MCP Research Tool/i.test(rawLabel) ? '演示研究数据' : /Demo Data/i.test(rawLabel) ? '演示数据' : rawLabel
    return (
      <ShadcnBadge className="genui-badge" variant={props.variant ?? 'secondary'} style={weightStyle(props.weight)}>
        {label}
      </ShadcnBadge>
    )
  },
)

const TextField = createComponentImplementation(
  {
    name: 'TextField',
    schema: z.object({
      label: DynString.optional(),
      value: DynString.optional(),
      placeholder: z.string().optional(),
      variant: z.enum(['single', 'longText', 'password']).optional(),
      weight,
    }),
  },
  ({ props }: any) => {
    const id = React.useId()
    const isLong = props.variant === 'longText'
    return (
      <div className="genui-field" style={weightStyle(props.weight)}>
        {props.label && (
          <label htmlFor={id}>
            {props.label}
          </label>
        )}
        {isLong ? (
          <Textarea
            id={id}
            value={props.value ?? ''}
            onChange={(e) => props.setValue?.(e.target.value)}
            placeholder={props.placeholder}
          />
        ) : (
          <Input
            id={id}
            type={props.variant === 'password' ? 'password' : 'text'}
            value={props.value ?? ''}
            onChange={(e) => props.setValue?.(e.target.value)}
            placeholder={props.placeholder}
          />
        )}
      </div>
    )
  },
)

const ChoicePicker = createComponentImplementation(
  {
    name: 'ChoicePicker',
    schema: z.object({
      label: DynString.optional(),
      value: DynStringList,
      options: z.array(z.object({ value: z.string(), label: DynString })),
      variant: z.enum(['multipleSelection', 'mutuallyExclusive']).optional(),
      weight,
    }),
  },
  ({ props }: any) => {
    const values: string[] = Array.isArray(props.value) ? props.value : []
    const multiple = props.variant !== 'mutuallyExclusive'
    const toggle = (value: string) => props.setValue?.(
      multiple ? (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]) : [value],
    )
    return (
      <fieldset className="genui-choice" style={weightStyle(props.weight)}>
        {props.label && <legend>{props.label}</legend>}
        {props.options.map((option: { value: string; label: string }) => (
          <label key={option.value}>
            <input type={multiple ? 'checkbox' : 'radio'} checked={values.includes(option.value)} onChange={() => toggle(option.value)} />
            {option.label}
          </label>
        ))}
      </fieldset>
    )
  },
)

const Select = createComponentImplementation(
  {
    name: 'Select',
    schema: z.object({
      label: DynString.optional(),
      value: DynString.optional(),
      placeholder: z.string().optional(),
      options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
      weight,
    }),
  },
  ({ props }: any) => {
    const id = React.useId()
    const val = typeof props.value === 'string' ? props.value : ''
    const options = props.options ?? []
    return (
      <div className="genui-field" style={weightStyle(props.weight)}>
        {props.label && <label htmlFor={id}>{props.label}</label>}
        <ShadcnSelect value={val} onValueChange={(value) => props.setValue?.(value)}>
          <SelectTrigger id={id}>
            <SelectValue placeholder={props.placeholder ?? 'Select…'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o: { value: string; label: string }) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadcnSelect>
      </div>
    )
  },
)

const List = createComponentImplementation(
  {
    name: 'List',
    schema: z.object({
      children: ChildList.optional(),
      items: z.array(z.string()).optional(),
      direction: z.enum(['vertical', 'horizontal']).optional(),
      weight,
    }),
  },
  ({ props, buildChild }: any) => (
    <ul
      className={cn('genui-list', (props.direction ?? 'vertical') === 'horizontal' && 'genui-list--horizontal')}
      style={weightStyle(props.weight)}
    >
      <ChildListRenderer list={props.children} buildChild={buildChild} />
      {Array.isArray(props.items) && props.items.map((item: string, index: number) => <li key={index}>{item}</li>)}
    </ul>
  ),
)

const Row = createComponentImplementation(
  {
    name: 'Row',
    schema: z.object({
      children: ChildList,
      gap: z.number().optional(),
      align: z.string().optional(),
      justify: z.string().optional(),
      weight,
    }),
  },
  ({ props, buildChild }: any) => (
    <div
      className="genui-row"
      style={{
        ...weightStyle(props.weight),
        gap: restrainedGap(props.gap),
        flexDirection: 'row',
        alignItems: props.align ?? 'stretch',
        justifyContent: props.justify ?? 'flex-start',
      }}
    >
      <ChildListRenderer list={props.children} buildChild={buildChild} />
    </div>
  ),
)

const Column = createComponentImplementation(
  {
    name: 'Column',
    schema: z.object({
      children: ChildList,
      gap: z.number().optional(),
      align: z.string().optional(),
      justify: z.string().optional(),
      weight,
    }),
  },
  ({ props, buildChild }: any) => (
    <div
      className="genui-column"
      style={{
        ...weightStyle(props.weight),
        gap: restrainedGap(props.gap),
        flexDirection: 'column',
        alignItems: props.align ?? 'stretch',
        justifyContent: props.justify ?? 'flex-start',
      }}
    >
      <ChildListRenderer list={props.children} buildChild={buildChild} />
    </div>
  ),
)

const Divider = createComponentImplementation(
  {
    name: 'Divider',
    schema: z.object({
      axis: z.enum(['horizontal', 'vertical']).optional(),
      weight,
    }),
  },
  ({ props }: any) => (
    <hr
      className={cn(
        'genui-divider',
        props.axis === 'vertical' ? 'genui-divider--vertical' : 'genui-divider--horizontal',
      )}
      style={weightStyle(props.weight)}
    />
  ),
)

const Table = createComponentImplementation(
  {
    name: 'Table',
    schema: z.object({
      columns: z
        .array(z.object({ key: z.string(), label: z.string().optional() }))
        .default([]),
      rows: z.array(z.record(z.string(), z.any())).default([]),
      rowAction: SemanticAction.optional(),
      weight,
    }),
  },
  ({ props, context }: any) => {
    const columns: { key: string; label?: string }[] = props.columns ?? []
    const rows: Record<string, unknown>[] = props.rows ?? []
    const rowAction = isResearchInteraction(props.rowAction) || isFollowUpAction(props.rowAction) ? props.rowAction : undefined
    const detail = needsTableDetail(rows.length, columns.length)
    const previewRows = detail ? rows.slice(0, TABLE_PREVIEW_ROWS) : rows

    const renderTable = (visibleRows: Record<string, unknown>[], preview: boolean) => (
      <ShadcnTable className={preview ? 'genui-table-preview' : 'genui-table-full'} aria-label={`研究数据表，共 ${rows.length} 行`}>
        <caption className="sr-only">研究数据：{rows.length} 行，{columns.length} 列</caption>
        <TableHeader>
          <TableRow>
            {columns.map((c, index) => (
              <TableHead key={c.key} scope="col" data-col-index={index}>{c.label ?? c.key}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row, i) => (
            <TableRow key={i} className={rowAction ? 'genui-interactive' : undefined} tabIndex={rowAction ? 0 : undefined} onClick={() => dispatchSemantic(context, rowAction, Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)])))} onKeyDown={(event) => { if (rowAction && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); dispatchSemantic(context, rowAction, Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)]))) } }}>
              {columns.map((c, index) => (
                <TableCell key={c.key} data-col-index={index}>{String(row[c.key] ?? '—')}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </ShadcnTable>
    )

    return (
      <div className="genui-table" style={weightStyle(props.weight)}>
        {rows.length === 0 ? <p className="genui-minor-state">暂无表格数据。</p> : renderTable(previewRows, true)}
        {detail && (
          <div className="genui-detail-row">
            <span>显示 {previewRows.length} / {rows.length} 行</span>
            <DetailDrawer title="完整数据表" triggerLabel="查看全部" description={`${rows.length} 行，${columns.length} 列`}>
              <div className="genui-table genui-table--drawer">{renderTable(rows, false)}</div>
            </DetailDrawer>
          </div>
        )}
      </div>
    )
  },
)

const CHART_TYPES = ['bar', 'line', 'area'] as const

const Chart = createComponentImplementation(
  {
    name: 'Chart',
    schema: z.object({
      title: DynString.optional(),
      type: z.enum(CHART_TYPES).optional(),
      data: z.array(z.record(z.string(), z.any())).default([]),
      xKey: z.string().optional(),
      yKey: z.string().optional(),
      height: z.number().optional(),
      interaction: z.object({ pointAction: SemanticAction.optional(), barAction: SemanticAction.optional(), seriesAction: SemanticAction.optional() }).optional(),
      filters: z.object({
        metricKey: z.string().optional(),
        metricLabel: z.string().optional(),
        metrics: z.array(z.object({ key: z.string(), label: z.string() })).default([]),
        defaultMetric: z.string().optional(),
        timeRanges: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
        rangeKey: z.string().optional(),
        defaultRange: z.string().optional(),
      }).optional(),
      weight,
    }),
  },
  ({ props, context }: any) => {
    const seriesMetrics: Array<{ key: string; label: string }> = React.useMemo(() => props.filters?.metrics ?? [], [props.filters?.metrics])
    const defaultSeriesMetric = (
      props.filters?.defaultMetric
      && seriesMetrics.some((metric) => metric.key === props.filters.defaultMetric)
    )
      ? props.filters.defaultMetric
      : seriesMetrics.find((metric) => metric.key === props.yKey)?.key ?? seriesMetrics[0]?.key ?? ''
    const [selectedRange, setSelectedRange] = React.useState(props.filters?.defaultRange ?? 'all')
    const [selectedMetric, setSelectedMetric] = React.useState(defaultSeriesMetric)
    const [metricDetail, setMetricDetail] = React.useState<MetricChartDetail | null>(null)
    const [selectedPoint, setSelectedPoint] = React.useState<Record<string, unknown> | null>(null)
    const baseData: Record<string, unknown>[] = props.data ?? []
    const baseXKey = props.xKey ?? 'x'
    const baseTitle = String(props.title ?? '研究图表')
    const financialMetricChart = /核心财务指标|财务指标|financial metrics/i.test(baseTitle)
      || baseData.some((item) => /营收|每股收益|毛利|市盈率|revenue|eps|margin|p\/e/i.test(String(item[baseXKey] ?? '')))

    React.useEffect(() => {
      if (seriesMetrics.length === 0) return
      setSelectedMetric(defaultSeriesMetric)
      setMetricDetail(null)
    }, [seriesMetrics, defaultSeriesMetric])

    React.useEffect(() => subscribeMetricChartDetail((next) => {
      if (next.targetChartId && next.targetChartId !== context.componentModel.id) return
      if (!next.targetChartId && !financialMetricChart) return
      const matchingSeries = seriesMetrics.find((metric) => metric.key === next.metric || metric.label === next.metric)
      if (matchingSeries) {
        setSelectedMetric(matchingSeries.key)
        setMetricDetail(null)
      } else {
        setSelectedMetric('')
        setMetricDetail(next)
      }
      setSelectedRange('all')
      setSelectedPoint(null)
    }), [context.componentModel.id, financialMetricChart, seriesMetrics])

    const rangeKey = props.filters?.rangeKey ?? 'range'
    const allData: Record<string, unknown>[] = metricDetail?.data ?? baseData
    let data = allData
    if (/^last-\d+$/.test(selectedRange)) data = allData.slice(-Number(selectedRange.slice(5)))
    else if (selectedRange !== 'all' && selectedRange) data = allData.filter((item) => !item[rangeKey] || String(item[rangeKey]) === selectedRange)
    const activeSeries = seriesMetrics.find((metric) => metric.key === selectedMetric)
    const xKey = metricDetail?.xKey ?? baseXKey
    const yKey = metricDetail?.yKey ?? activeSeries?.key ?? props.yKey ?? 'y'
    const activeTitle = metricDetail?.title
      ?? (activeSeries ? `${activeSeries.label}趋势${/演示/.test(baseTitle) ? '（演示数据）' : ''}` : baseTitle)
    const requestedHeight = props.height
    const height = Math.min(Math.max(requestedHeight ?? 220, 180), 280)
    const type = props.type ?? 'bar'
    const common = { data, margin: { top: 8, right: 10, left: -12, bottom: 0 }, accessibilityLayer: true }
    const detail = needsChartDetail(data.length, requestedHeight)
    const summary = metricDetail?.summary ?? `${activeTitle}，共 ${data.length} 个数据点，展示 ${xKey} 与 ${yKey} 的关系。`
    const metricKey = props.filters?.metricKey
    const legacyMetricValues = seriesMetrics.length === 0 && metricKey
      ? [...new Set(baseData.map((item) => String(item[metricKey] ?? '')).filter(Boolean))]
      : []
    const metricOptions = seriesMetrics.length > 0
      ? seriesMetrics.map((metric) => ({ value: metric.key, label: metric.label }))
      : legacyMetricValues.map((metric) => ({ value: metric, label: metric }))
    const timeRanges = props.filters?.timeRanges ?? []

    const selectMetric = (metric: string) => {
      setSelectedMetric(metric)
      setSelectedPoint(null)
      setSelectedRange('all')

      // 宽表时间序列通过切换 yKey 复用同一份数据；旧的 metricKey 模式继续兼容分类指标图。
      // Wide time-series charts reuse the same rows by switching yKey; the legacy metricKey mode remains compatible with category charts.
      if (seriesMetrics.length > 0) {
        setMetricDetail(null)
        return
      }

      if (!metric) {
        setMetricDetail(null)
        return
      }
      const source = baseData.find((item) => String(item[metricKey ?? baseXKey] ?? '') === metric)
      setMetricDetail(createMockMetricDetail(metric, source?.[props.yKey ?? 'y']))
    }

    const pointAction = props.interaction?.pointAction ?? props.interaction?.barAction
    const onChartClick = (entry: any) => {
      const point = entry?.activePayload?.[0]?.payload ?? (entry?.activeLabel ? { [xKey]: entry.activeLabel } : entry?.payload)
      if (!point) return
      // 图表数据点通常只是简单事实，优先在图表内本地展示；仅当模型明确标记为深度研究时才调用 Agent。
      // A chart point is usually a simple fact shown locally; call an Agent only when the model explicitly marks deep research.
      if (pointAction?.event.context?.interactionMode === 'research') {
        dispatchSemantic(context, pointAction, { period: String(point[xKey] ?? ''), value: String(point[yKey] ?? '') })
      } else setSelectedPoint(point)
    }
    const renderChart = (chartHeight: number) => {
    let chart: React.ReactNode = null
    if (type === 'bar') {
      chart = (
        <BarChart {...common} onClick={onChartClick}>
          <CartesianGrid stroke="var(--genui-chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: 'var(--genui-text-muted)', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--genui-text-muted)', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: 'var(--genui-surface)', border: '1px solid var(--genui-border)', borderRadius: 'var(--genui-radius-sm)', color: 'var(--genui-text)' }} cursor={{ fill: 'var(--genui-surface-muted)' }} />
          <Bar dataKey={yKey} fill="var(--genui-chart-primary)" radius={[3, 3, 0, 0]} />
        </BarChart>
      )
    } else if (type === 'line') {
      chart = (
        <LineChart {...common} onClick={onChartClick}>
          <CartesianGrid stroke="var(--genui-chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: 'var(--genui-text-muted)', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--genui-text-muted)', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: 'var(--genui-surface)', border: '1px solid var(--genui-border)', borderRadius: 'var(--genui-radius-sm)', color: 'var(--genui-text)' }} />
          <Line type="monotone" dataKey={yKey} stroke="var(--genui-chart-primary)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
        </LineChart>
      )
    } else {
      chart = (
        <AreaChart {...common} onClick={onChartClick}>
          <CartesianGrid stroke="var(--genui-chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: 'var(--genui-text-muted)', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--genui-text-muted)', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: 'var(--genui-surface)', border: '1px solid var(--genui-border)', borderRadius: 'var(--genui-radius-sm)', color: 'var(--genui-text)' }} />
          <Area type="monotone" dataKey={yKey} fill="var(--genui-chart-primary)" fillOpacity={0.12} stroke="var(--genui-chart-primary)" />
        </AreaChart>
      )
    }
      return <ResponsiveContainer width="100%" height={chartHeight}>{chart as React.ReactElement}</ResponsiveContainer>
    }

    return (
      <figure className={cn('genui-chart', (pointAction || data.length > 0) && 'genui-interactive')} style={weightStyle(props.weight)} aria-label={summary} tabIndex={data.length > 0 ? 0 : undefined} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && data[0]) { event.preventDefault(); onChartClick({ payload: data[0] }) } }}>
        <figcaption>{activeTitle}</figcaption>
        {(metricOptions.length > 0 || timeRanges.length > 0) && <div className="genui-chart-filters">
          <SlidersHorizontal aria-hidden="true" />
          {metricOptions.length > 0 && <label className="genui-chart-filter"><span>{props.filters?.metricLabel ?? (seriesMetrics.length > 0 ? '核心指标' : '指标')}</span><select value={selectedMetric} onChange={(event) => selectMetric(event.target.value)}>{seriesMetrics.length === 0 && <option value="">全部指标</option>}{metricOptions.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}</select></label>}
          {timeRanges.length > 0 && <label className="genui-chart-filter"><span>时间</span><select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value)}>{timeRanges.map((range: { value: string; label: string }) => <option key={range.value} value={range.value}>{range.label}</option>)}</select></label>}
          {metricDetail && <button type="button" className="genui-chart-reset" onClick={() => selectMetric('')}>返回核心指标</button>}
        </div>}
        <p className="sr-only">{summary}</p>
        {metricDetail && <p className="genui-chart-summary">{metricDetail.summary} <span>演示数据</span></p>}
        {data.length === 0 ? <p className="genui-minor-state">暂无图表数据。</p> : renderChart(height)}
        {selectedPoint && <section className="genui-inline-detail" aria-live="polite"><strong>{String(selectedPoint[xKey] ?? '当前数据点')}</strong><p>{activeTitle}：{String(selectedPoint[yKey] ?? '—')}</p><button type="button" onClick={() => setSelectedPoint(null)}>关闭</button></section>}
        {detail && data.length > 0 && (
          <div className="genui-detail-row">
            <span>{data.length} 个数据点</span>
            <DetailDrawer title={activeTitle} description={summary}>
              <figure className="genui-chart genui-chart--drawer" aria-label={summary}>{renderChart(420)}</figure>
            </DetailDrawer>
          </div>
        )}
      </figure>
    )
  },
)

/* ------------------------------------------------------------------ */
/* 组装与组件注册表 / Assembly and Component Registry                  */
/* ------------------------------------------------------------------ */

/**
 * 注册表把目录中的组件名映射到 React 实现；名称列表不在这里重复维护，而来自共享 Component Catalog。
 * 业务组件实现从 `businessComponents.tsx` 导入，基础组件在本文件定义。
 * The registry maps catalog names to React implementations without duplicating the name list.
 * Business implementations come from `businessComponents.tsx`; basic implementations are defined here.
 */
const REGISTRY: Record<string, ReactComponentImplementation> = {
  // 基础组件 / Basic components
  Text,
  Card,
  Button,
  Badge,
  TextField,
  Select,
  ChoicePicker,
  List,
  Row,
  Column,
  Divider,
  Table,
  Chart,
  // 业务组件 / Business components
  ...BUSINESS_COMPONENTS,
}

/**
 * 按共享的规范顺序组装目录；若目录组件缺少实现，则在加载时直接失败，避免 allow-list 与渲染器漂移。
 * Assemble the catalog in the shared canonical order and fail at load time if an implementation is missing,
 * preventing the allow-list and renderer from drifting apart.
 */
const components = COMPONENT_CATALOG.map((spec) => {
  const impl = REGISTRY[spec.name]
  if (!impl) throw new Error(`Component "${spec.name}" is in the catalog but has no React implementation`)
  return impl
})

export const ALLOWED_COMPONENTS = components.map((c) => c.name)

/** `createSurface` 消息使用的目录 ID。 / Catalog id used by `createSurface`. */
export const RESEARCH_CATALOG_ID = 'research.v0.9'

export const researchCatalog = new Catalog<ReactComponentImplementation>(
  RESEARCH_CATALOG_ID,
  components,
)
