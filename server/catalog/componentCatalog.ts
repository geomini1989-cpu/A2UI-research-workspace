/**
 * Component Catalog 是 A2UI 组件集合的唯一事实来源。
 * Component Catalog is the single source of truth for the A2UI component set.
 *
 * Renderer Catalog 分为基础组件与业务渲染组件；Agent 另有独立的语义业务卡片 Catalog。
 * The renderer catalog contains primitives plus business renderers; the Agent
 * uses a separate semantic business-card catalog compiled to renderer names.
 *
 * 本文件仅包含纯数据，不包含 React、DOM 或 JSX；服务端 Agent 与客户端渲染注册表共同读取它。
 * This file contains pure data only—no React, DOM, or JSX—and is shared by the
 * server Agent and the client render registry.
 *
 * Renderer 能力与 Agent 能力分别维护显式映射，避免“客户端能渲染”被误解为“模型有权生成”。
 * Renderer capability and Agent capability are explicitly mapped so a client
 * rendering capability never implicitly becomes a model generation permission.
 */

export type CatalogCategory = 'basic' | 'business'

export interface CatalogComponentSpec {
  name: string
  /** Agent 用于选择组件的机器可读一句话描述。 / Machine-readable one-liner the Agent uses to choose a component. */
  description: string
  category: CatalogCategory
  /** propName -> 类型提示，尾部 `?` 表示可选。 / propName -> type hint; trailing `?` means optional. */
  props: Record<string, string>
  /** 有意义渲染所需的属性名（用于 Prompt）。 / Prop names required for a meaningful render (used in the prompt). */
  required: string[]
  /** 简短的人类可读标签（用于 Prompt / registry）。 / Short human label used by the prompt / registry. */
  label: string
}

export const COMPONENT_CATALOG: CatalogComponentSpec[] = [
  // -------------------------------------------------------- 基础组件 / Basic components
  {
    name: 'Text',
    label: 'Text',
    category: 'basic',
    description: 'Renders text with a heading variant (h1–h5, body, caption).',
    props: { text: 'string', variant: "string? (h1|h2|h3|h4|h5|body|caption)", weight: 'number?' },
    required: ['text'],
  },
  {
    name: 'Card',
    label: 'Card',
    category: 'basic',
    description: 'A restrained container for content that genuinely benefits from a visual boundary.',
    props: { title: 'string?', child: 'string?', children: 'array<id>?', weight: 'number?' },
    required: [],
  },
  {
    name: 'Button',
    label: 'Button',
    category: 'basic',
    description: 'A high-value allow-listed action. Use 0-1 for compact results and no more than 3 for rich results.',
    props: { label: 'string?', action: 'action', variant: 'string? (primary|secondary|outline|ghost)', weight: 'number?' },
    required: ['action'],
  },
  {
    name: 'Badge',
    label: 'Badge',
    category: 'basic',
    description: 'A small labeled tag (used for Demo Data, data-source, tags).',
    props: { label: 'string?', text: 'string?', variant: 'string? (default|secondary|outline|destructive)', weight: 'number?' },
    required: [],
  },
  {
    name: 'TextField',
    label: 'TextField',
    category: 'basic',
    description: 'A single-line or textarea input bound to local state.',
    props: { label: 'string?', value: 'string?', placeholder: 'string?', variant: 'string? (single|longText|password)' },
    required: [],
  },
  {
    name: 'Select',
    label: 'Select',
    category: 'basic',
    description: 'A dropdown selector with a list of options.',
    props: { label: 'string?', value: 'string?', placeholder: 'string?', options: 'array<{value,label}>' },
    required: ['options'],
  },
  {
    name: 'ChoicePicker',
    label: 'Choice Picker',
    category: 'basic',
    description: 'Selects one or multiple allow-listed options using A2UI data-model binding.',
    props: { label: 'string?', value: 'path binding to string[]', options: 'array<{value,label}>', variant: 'string? (multipleSelection|mutuallyExclusive)' },
    required: ['value', 'options'],
  },
  {
    name: 'List',
    label: 'List',
    category: 'basic',
    description: 'Lays out child component ids or simple text items vertically or horizontally.',
    props: { children: 'array<id>?', items: 'array<string>?', direction: 'string? (vertical|horizontal)', weight: 'number?' },
    required: ['children'],
  },
  {
    name: 'Row',
    label: 'Row',
    category: 'basic',
    description: 'Horizontal flex container of child component ids.',
    props: { children: 'array<id>', gap: 'number?', align: 'string?', justify: 'string?', weight: 'number?' },
    required: ['children'],
  },
  {
    name: 'Column',
    label: 'Column',
    category: 'basic',
    description: 'Vertical flex container of child component ids (use id "root" for the surface).',
    props: { children: 'array<id>', gap: 'number?', align: 'string?', justify: 'string?', weight: 'number?' },
    required: ['children'],
  },
  {
    name: 'Divider',
    label: 'Divider',
    category: 'basic',
    description: 'A horizontal or vertical separating rule.',
    props: { axis: 'string? (horizontal|vertical)', weight: 'number?' },
    required: [],
  },
  {
    name: 'Table',
    label: 'Table',
    category: 'basic',
    description: 'A precise data table. Keep simple visible rows static; rowAction is only for a high-value research follow-up.',
    props: { columns: 'array<{key,label}>', rows: 'array<object>', rowAction: 'semanticAction? (high-value follow-up; interactionMode=research optional)', weight: 'number?' },
    required: ['columns', 'rows'],
  },
  {
    name: 'Chart',
    label: 'Chart',
    category: 'basic',
    description: 'A Recharts chart (bar/line/area). Data must come from the A2UI data model, never hardcoded.',
    props: {
      title: 'string?',
      type: 'string? (bar|line|area)',
      data: 'array<object>',
      xKey: 'string?',
      yKey: 'string?',
      height: 'number?',
      interaction: 'object? {pointAction?,barAction?,seriesAction?}; use context.interactionMode="research" only for deep research',
      filters: 'object? {metricKey?,metricLabel?,metrics:[{key,label}],defaultMetric?,timeRanges:[{value,label}],rangeKey?,defaultRange?}; metrics switches yKey for wide time-series data, metricKey remains for legacy category charts',
      weight: 'number?',
    },
    required: ['data'],
  },
  // ------------------------------------------------------- 业务组件 / Business components
  {
    name: 'FilterBar',
    label: 'Analysis Filters',
    category: 'business',
    description: 'A cross-component analysis filter group. Use when changing company, segment, metric or period should refresh the broader research view; do not use for chart-only display controls.',
    props: {
      title: 'string?',
      filters: 'array<{key:company|metric|segment|period|timeRange,label,options:array<{value,label}>,defaultValue?}>',
      action: 'semanticAction (apply_filters)',
      weight: 'number?',
    },
    required: ['filters', 'action'],
  },
  {
    name: 'MetricCard',
    label: 'Metric Card',
    category: 'business',
    description: 'A compact highlighted metric. Static by default; use detail only for a useful same-metric addition, or action only for a real research follow-up.',
    props: { title: 'string', value: 'string', change: 'string?', description: 'short string?', interactionGroup: 'string? (same semantic metric across peer cards)', detail: 'object? {title?,summary?,keyPoints?}; inline addition from current payload', action: 'semanticAction? (high-value conversational follow-up)', weight: 'number?' },
    required: ['title', 'value'],
  },
  {
    name: 'ComparisonCard',
    label: 'Comparison Card',
    category: 'business',
    description: 'Side-by-side comparison of two entities (e.g. NVIDIA vs AMD) over metric rows.',
    props: {
      title: 'string?',
      left: 'string?',
      right: 'string?',
      rows: 'array<{metric,left,right}>', rowAction: 'semanticAction? (high-value conversational follow-up)',
      action: 'semanticAction?', weight: 'number?',
    },
    required: ['rows'],
  },
  {
    name: 'StockOverview',
    label: 'Stock Overview',
    category: 'business',
    description: 'A company market snapshot: name, ticker, price, day change, market cap. Always Demo values.',
    props: {
      company: 'string?',
      ticker: 'string?',
      price: 'string?',
      change: 'string?',
      marketCap: 'string?',
      action: 'semanticAction? (high-value conversational follow-up)',
      weight: 'number?',
    },
    required: ['company'],
  },
  {
    name: 'ResearchSummary',
    label: 'Research Summary',
    category: 'business',
    description: 'An optional compact takeaway block. Avoid long prose; prefer up to 3 short key points.',
    props: { title: 'string?', summary: 'short string?', keyPoints: 'array<string> (max 3 preferred)', weight: 'number?' },
    required: [],
  },
  {
    name: 'RiskBadge',
    label: 'Risk Badge',
    category: 'business',
    description: 'A compact severity-coded risk indicator (level HIGH/MEDIUM/LOW) with a short label/description.',
    props: { level: 'string (HIGH|MEDIUM|LOW)', label: 'string?', description: 'string?', action: 'semanticAction? (high-value conversational follow-up)', weight: 'number?' },
    required: ['level'],
  },
  {
    name: 'InsightList',
    label: 'Insight List',
    category: 'business',
    description: 'A compact bulleted list of the 1-3 most important findings / insights / takeaways.',
    props: { items: 'array<string>', weight: 'number?' },
    required: ['items'],
  },
]

export const BASIC_COMPONENT_NAMES = COMPONENT_CATALOG.filter((c) => c.category === 'basic').map((c) => c.name)
export const BUSINESS_COMPONENT_NAMES = COMPONENT_CATALOG.filter((c) => c.category === 'business').map((c) => c.name)

/** 所有组件名；服务端 allow-list 由此派生。 / Every component name; the server allow-list derives from this. */
export const ALLOWED_COMPONENTS = COMPONENT_CATALOG.map((c) => c.name)

/** Renderer 目录的轻量机器可读元数据（无 React）。 / Lightweight renderer-catalog metadata (no React). */
export const CATALOG_METADATA = COMPONENT_CATALOG.map((spec) => ({
  name: spec.name,
  description: spec.description,
  category: spec.category,
  props: spec.props,
  required: spec.required,
}))

/**
 * Agent-facing business catalog.
 *
 * These names are intentionally NOT the same as low-level renderer primitives.
 * A semantic Agent component is mapped to one fixed renderer implementation by
 * the server. This prevents the model from depending on React/layout details.
 */
export const AGENT_COMPONENT_NAMES = [
  'StockOverviewCard',
  'MetricCard',
  'ComparisonCard',
  'TrendChartCard',
  'RiskCard',
  'InsightCard',
  'ResearchSummaryCard',
  'FilterCard',
] as const

export type AgentComponentName = (typeof AGENT_COMPONENT_NAMES)[number]

export const AGENT_TO_RENDERER_COMPONENT: Record<AgentComponentName, string> = {
  StockOverviewCard: 'StockOverview',
  MetricCard: 'MetricCard',
  ComparisonCard: 'ComparisonCard',
  TrendChartCard: 'Chart',
  RiskCard: 'RiskBadge',
  InsightCard: 'InsightList',
  ResearchSummaryCard: 'ResearchSummary',
  FilterCard: 'FilterBar',
}

export interface AgentComponentSpec {
  name: AgentComponentName
  label: string
  description: string
  props: Record<string, string>
  required: string[]
}

export const AGENT_COMPONENT_CATALOG: AgentComponentSpec[] = [
  {
    name: 'StockOverviewCard',
    label: 'Stock Overview Card',
    description: 'Fixed-style company snapshot card. Supply company identity and market values only.',
    props: { company: 'string', ticker: 'string?', price: 'string?', change: 'string?', marketCap: 'string?', action: 'semanticAction?' },
    required: ['company'],
  },
  {
    name: 'MetricCard',
    label: 'Metric Card',
    description: 'Fixed-style business metric card. Supply semantic metric content only; no layout or styling props.',
    props: { title: 'string', value: 'string', change: 'string?', description: 'short string?', interactionGroup: 'string?', detail: 'inlineDetail?', action: 'semanticAction?' },
    required: ['title', 'value'],
  },
  {
    name: 'ComparisonCard',
    label: 'Comparison Card',
    description: 'Fixed-style two-entity comparison card with a compact metric-row set.',
    props: { title: 'string?', left: 'string?', right: 'string?', rows: 'array<{metric,left,right}>', rowAction: 'semanticAction?' },
    required: ['rows'],
  },
  {
    name: 'TrendChartCard',
    label: 'Trend Chart Card',
    description: 'Fixed-style time-series chart card. The renderer owns chart type, dimensions and visual styling.',
    props: { title: 'string?', data: 'array<object>', xKey: 'string?', yKey: 'string?', interaction: 'chartInteraction?', filters: 'chartFilters?' },
    required: ['data'],
  },
  {
    name: 'RiskCard',
    label: 'Risk Card',
    description: 'Fixed-style risk card. HIGH/MEDIUM/LOW is semantic severity; the renderer owns its visual treatment.',
    props: { level: 'HIGH|MEDIUM|LOW', label: 'string?', description: 'short string?', action: 'semanticAction?' },
    required: ['level'],
  },
  {
    name: 'InsightCard',
    label: 'Insight Card',
    description: 'Fixed-style compact card containing the 1-3 most important findings.',
    props: { items: 'array<string> (1-3)' },
    required: ['items'],
  },
  {
    name: 'ResearchSummaryCard',
    label: 'Research Summary Card',
    description: 'Fixed-style compact takeaway card with short summary text and up to 3 key points.',
    props: { title: 'string?', summary: 'short string?', keyPoints: 'array<string> (max 3)' },
    required: [],
  },
  {
    name: 'FilterCard',
    label: 'Analysis Filter Card',
    description: 'Fixed-style cross-component filter card used only when business-scope changes should rerun broader analysis.',
    props: { title: 'string?', filters: 'array<filter>', action: 'apply_filters semanticAction' },
    required: ['filters', 'action'],
  },
]

export const AGENT_ALLOWED_COMPONENTS = [...AGENT_COMPONENT_NAMES]

export function describeAgentCatalog(): string {
  const lines: string[] = []
  lines.push('AGENT BUSINESS COMPONENT CATALOG (the ONLY semantic UI components the model may emit):')
  for (const spec of AGENT_COMPONENT_CATALOG) {
    const props = Object.entries(spec.props)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ')
    lines.push(`- ${spec.name} (${spec.label}): ${spec.description} props={${props}}`)
  }
  lines.push('')
  lines.push('These are semantic business components. Renderer primitives and concrete React component names are server-internal.')
  return lines.join('\n')
}

/**
 * Renderer Catalog 的诊断描述。不要把它用作 Agent Prompt；模型只能读取 describeAgentCatalog()。
 * Diagnostic description of the renderer catalog. Never use this as an Agent prompt; models must use describeAgentCatalog().
 */
export function describeCatalog(): string {
  const nameLine = (list: string[]) => list.join(', ')
  const lines: string[] = []
  lines.push('RENDERER COMPONENT CATALOG (trusted server/runtime capabilities; NOT Agent permissions):')
  lines.push(`- Basic: ${nameLine(BASIC_COMPONENT_NAMES)}`)
  lines.push(`- Business: ${nameLine(BUSINESS_COMPONENT_NAMES)}`)
  lines.push('')
  lines.push('BUSINESS COMPONENT REFERENCE (usage + props):')
  for (const spec of COMPONENT_CATALOG.filter((c) => c.category === 'business')) {
    const props = Object.entries(spec.props)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    lines.push(`- ${spec.name} (${spec.label}): ${spec.description} props={${props}}`)
  }
  return lines.join('\n')
}
