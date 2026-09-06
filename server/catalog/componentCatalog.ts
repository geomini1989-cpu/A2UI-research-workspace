/**
 * Component Catalog — the SINGLE source of truth for the A2UI component set.
 *
 * There are two layers:
 *   - Basic components (layout + generic building blocks)
 *   - Business components (research-domain composites the Agent chooses from)
 *
 * This file is PURE DATA: no React, no DOM, no JSX. It is imported by:
 *   - the server agent (system prompt + allow-list), and
 *   - the client render registry (which pairs each name with a React impl).
 *
 * Keeping one list here means the agent prompt, the server sanitizer and the
 * client catalog can never drift apart. The Agent only sees `name`, `description`
 * and `props` — never JSX/React internals.
 */

export type CatalogCategory = 'basic' | 'business'

export interface CatalogComponentSpec {
  name: string
  /** Machine/AI-readable one-liner the agent uses to pick the right component. */
  description: string
  category: CatalogCategory
  /** propName -> type hint. A trailing `?` marks the prop as optional. */
  props: Record<string, string>
  /** Names of props required for a meaningful render (used in the prompt). */
  required: string[]
  /** Short human label (used by the prompt / registry). */
  label: string
}

export const COMPONENT_CATALOG: CatalogComponentSpec[] = [
  // ------------------------------------------------------------------ Basic
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
      filters: 'object? {timeRanges:[{value,label}], rangeKey?, defaultRange?}; filters existing chart data locally',
      weight: 'number?',
    },
    required: ['data'],
  },
  // --------------------------------------------------------------- Business
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

/** Every component name — the server-side allow-list derives from this. */
export const ALLOWED_COMPONENTS = COMPONENT_CATALOG.map((c) => c.name)

/** Lightweight, Agent-facing machine-readable metadata (no React). */
export const CATALOG_METADATA = COMPONENT_CATALOG.map((spec) => ({
  name: spec.name,
  description: spec.description,
  category: spec.category,
  props: spec.props,
  required: spec.required,
}))

/**
 * Render the catalog into a compact prompt block the Agent reads. It lists the
 * allowed names and gives summary + props for the business components so the
 * Agent can pick the right one and emit correct props.
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
