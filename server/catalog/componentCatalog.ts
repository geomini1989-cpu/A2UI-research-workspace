/**
 * Component Catalog 是 A2UI 组件集合的唯一事实来源。
 * Component Catalog is the single source of truth for the A2UI component set.
 *
 * 分为两层：基础组件（布局 + 通用积木）与业务组件（Agent 选择的研究领域组合组件）。
 * It has two layers: basic components (layout + generic building blocks) and
 * business components (research-domain composites selected by the Agent).
 *
 * 本文件仅包含纯数据，不包含 React、DOM 或 JSX；服务端 Agent 与客户端渲染注册表共同读取它。
 * This file contains pure data only—no React, DOM, or JSX—and is shared by the
 * server Agent and the client render registry.
 *
 * 单一列表可以防止 Prompt、服务端 sanitizer 和客户端 catalog 发生漂移；Agent 只看到
 * `name`、`description` 与 `props`，不会接触 JSX/React 内部实现。
 * One shared list prevents prompt, sanitizer, and client catalog drift; the
 * Agent sees only `name`, `description`, and `props`, never JSX/React internals.
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
    description: 'A data table with columns and rows.',
    props: { columns: 'array<{key,label}>', rows: 'array<object>', rowAction: 'semanticAction? (one high-value row intent)', weight: 'number?' },
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
    description: 'A single highlighted business metric (revenue, growth, margin, P/E).',
    props: { title: 'string', value: 'string', change: 'string?', description: 'string?', detail: 'object? {title?,summary?,data?,targetChartId?}; replaces the target financial chart locally', action: 'semanticAction?', weight: 'number?' },
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
      rows: 'array<{metric,left,right}>', rowAction: 'semanticAction?',
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
      weight: 'number?',
    },
    required: ['company'],
  },
  {
    name: 'ResearchSummary',
    label: 'Research Summary',
    category: 'business',
    description: 'A prose research summary with a headline and bulleted key points.',
    props: { title: 'string?', summary: 'string?', keyPoints: 'array<string>', weight: 'number?' },
    required: [],
  },
  {
    name: 'RiskBadge',
    label: 'Risk Badge',
    category: 'business',
    description: 'A severity-coded risk indicator (level HIGH/MEDIUM/LOW) with a label + description.',
    props: { level: 'string (HIGH|MEDIUM|LOW)', label: 'string?', description: 'string?', action: 'semanticAction?', weight: 'number?' },
    required: ['level'],
  },
  {
    name: 'InsightList',
    label: 'Insight List',
    category: 'business',
    description: 'A bulleted list of findings / insights / takeaways.',
    props: { items: 'array<string>', weight: 'number?' },
    required: ['items'],
  },
]

export const BASIC_COMPONENT_NAMES = COMPONENT_CATALOG.filter((c) => c.category === 'basic').map((c) => c.name)
export const BUSINESS_COMPONENT_NAMES = COMPONENT_CATALOG.filter((c) => c.category === 'business').map((c) => c.name)

/** 所有组件名；服务端 allow-list 由此派生。 / Every component name; the server allow-list derives from this. */
export const ALLOWED_COMPONENTS = COMPONENT_CATALOG.map((c) => c.name)

/** 面向 Agent 的轻量机器可读元数据（无 React）。 / Lightweight Agent-facing metadata (no React). */
export const CATALOG_METADATA = COMPONENT_CATALOG.map((spec) => ({
  name: spec.name,
  description: spec.description,
  category: spec.category,
  props: spec.props,
  required: spec.required,
}))

/**
 * 将目录渲染成 Agent 可读取的紧凑 Prompt 区块，列出允许的组件名，并提供业务组件摘要与属性。
 * Render the catalog into a compact Agent-readable prompt block with allowed names plus business summaries and props.
 */
export function describeCatalog(): string {
  const nameLine = (list: string[]) => list.join(', ')
  const lines: string[] = []
  lines.push('COMPONENT CATALOG (the ONLY components you may emit — never invent one):')
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
