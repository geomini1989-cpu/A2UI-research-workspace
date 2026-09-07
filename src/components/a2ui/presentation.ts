import type { AgentActivity, WorkspaceState } from '../../types/chat.js'

export type PresentationMode = 'compact' | 'standard' | 'rich'

/** UI-only complexity hint. It never changes task routing or agent behavior. */
export function inferPresentationMode(request: string): PresentationMode {
  const text = request.toLowerCase()
  if (/全面|综合|深入|完整|详细|比较|对比|compare|versus|\bvs\b|comprehensive|deep|full/.test(text)) {
    return 'rich'
  }
  if (/估值|p\/e|pe\b|单个|一句|简要|快速|quick|brief|single metric/.test(text)) {
    return 'compact'
  }
  return 'standard'
}

export const TABLE_PREVIEW_ROWS = 7

export function needsTableDetail(rowCount: number, columnCount: number): boolean {
  return rowCount > TABLE_PREVIEW_ROWS || columnCount > 4
}

export function needsChartDetail(dataPoints: number, requestedHeight?: number): boolean {
  return dataPoints > 10 || (requestedHeight ?? 0) > 280
}

export function processSummary(
  taskStatus: WorkspaceState['taskStatus'],
  activities: readonly AgentActivity[],
): string {
  const completed = activities.filter((item) => /complete/i.test(item.activity)).length
  if (taskStatus === 'WAITING_FOR_USER') return '等待你的输入'
  if (taskStatus === 'FAILED') return '研究未能完成'
  if (taskStatus === 'CANCELLED') return '研究已取消'
  if (taskStatus === 'RUNNING') {
    if (activities.some((item) => /aggregat|synthes/i.test(item.activity))) return '正在综合结果…'
    if (activities.some((item) => /working|delegation|tool|research/i.test(item.activity))) return '正在研究…'
    return '正在分析…'
  }
  return completed > 1 ? `已完成 ${completed} 项研究` : '研究已完成'
}

export function activityDisplayName(actor: string): string {
  if (/financial/i.test(actor)) return '财务分析'
  if (/market|news/i.test(actor)) return '市场分析'
  if (/technology|product/i.test(actor)) return '技术分析'
  if (/coordinator/i.test(actor)) return '研究协调'
  if (/registry/i.test(actor)) return '研究准备'
  if (/^ui$/i.test(actor)) return '结果呈现'
  return actor
}


export function activityLabel(activity: string): string {
  const labels: Array<[RegExp, string]> = [
    [/Task requirements analyzed/i, '分析研究需求'],
    [/Discovered via Agent Card/i, '匹配研究能力'],
    [/A2A delegation started/i, '启动专业研究'],
    [/Calling MCP tool/i, '获取研究数据'],
    [/Aggregating specialist results/i, '汇总研究结果'],
    [/Generating A2UI/i, '组织研究结果'],
    [/Unavailable/i, '暂不可用'],
    [/Complete/i, '已完成'],
    [/Working/i, '正在研究'],
    [/Ready/i, '研究就绪'],
  ]
  return labels.find(([pattern]) => pattern.test(activity))?.[1] ?? activity
}
