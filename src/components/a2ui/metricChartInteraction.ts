export interface MetricChartDetail {
  metric: string
  title: string
  summary: string
  xKey: string
  yKey: string
  data: Record<string, string | number>[]
  targetChartId?: string
}

const METRIC_CHART_EVENT = 'genui:metric-chart-selection'

function numericValue(value: unknown): number | undefined {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 仅在生成结果缺少指标时间序列时使用的演示历史。 / Demo history used only when generated payload lacks a metric time series. */
export function createMockMetricDetail(metric: string, currentValue?: unknown): MetricChartDetail {
  const normalized = metric.toLowerCase()
  const current = numericValue(currentValue)
  let values: number[]
  let summary: string

  if (/营收|revenue/.test(normalized)) {
    values = [53, 88, 114, current ?? 114]
    summary = '营收同比增速保持高位，主要由数据中心与 AI 加速计算需求驱动。'
  } else if (/每股收益|eps/.test(normalized)) {
    values = [38, 76, 126, current ?? 150]
    summary = '每股收益增速快于营收，反映规模效应与盈利能力改善。'
  } else if (/毛利|margin/.test(normalized)) {
    values = [62, 66, 70, current ?? 73]
    summary = '毛利率逐步提升，产品组合向高价值计算平台倾斜。'
  } else if (/市盈率|p\/e|pe/.test(normalized)) {
    values = [35, 42, 55, current ?? 48]
    summary = '估值仍处于较高区间，需要结合增长兑现程度观察。'
  } else {
    const last = current ?? 100
    values = [last * 0.62, last * 0.75, last * 0.88, last].map((value) => Math.round(value * 10) / 10)
    summary = `${metric} 的历史趋势为演示数据，用于展示筛选与联动交互。`
  }

  return {
    metric,
    title: `${metric}趋势详情`,
    summary,
    xKey: 'period',
    yKey: 'value',
    data: ['FY2022', 'FY2023', 'FY2024', 'FY2025'].map((period, index) => ({ period, value: values[index], source: 'Mock' })),
  }
}

export function publishMetricChartDetail(detail: MetricChartDetail) {
  window.dispatchEvent(new CustomEvent<MetricChartDetail>(METRIC_CHART_EVENT, { detail }))
}

export function subscribeMetricChartDetail(listener: (detail: MetricChartDetail) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<MetricChartDetail>).detail)
  window.addEventListener(METRIC_CHART_EVENT, handler)
  return () => window.removeEventListener(METRIC_CHART_EVENT, handler)
}
