import type { A2uiMessage } from '@a2ui/web_core/v0_9'

import { buildA2uiMessages } from '../a2ui/a2uiGenerator.js'
import { RESEARCH_CATALOG_ID } from '../a2ui/a2uiSchema.js'
import type { ResearchJob } from './researchJobService.js'

type Component = Record<string, unknown>
const ref = (id: string) => ({ id })

function surface(surfaceId: string, components: Component[], data: Record<string, unknown>): A2uiMessage[] {
  const nestedIds = new Set(
    components.flatMap((item) => Array.isArray(item.children)
      ? item.children.flatMap((child) => child && typeof child === 'object' && 'id' in child ? [String(child.id)] : [])
      : []),
  )
  const root = {
    component: 'Column',
    id: 'root',
    gap: 16,
    children: components.filter((item) => !nestedIds.has(String(item.id))).map((item) => ref(String(item.id))),
  }
  return buildA2uiMessages([
    { version: 'v0.9', createSurface: { surfaceId, catalogId: RESEARCH_CATALOG_ID, theme: {} } },
    { version: 'v0.9', updateDataModel: { surfaceId, path: '/', value: data } },
    { version: 'v0.9', updateComponents: { surfaceId, components: [root, ...components] } },
  ], { dataSource: false }).messages
}

const DIMENSION_OPTIONS = [
  { value: 'financial', label: '财务' },
  { value: 'market', label: '市场与新闻' },
  { value: 'technology', label: '技术与产品' },
]

const DEPTH_OPTIONS = [
  { value: 'quick', label: '快速' },
  { value: 'deep', label: '深度' },
  { value: 'comprehensive', label: '全面' },
]

const DIMENSION_LABELS = { financial: '财务', market: '市场与新闻', technology: '技术与产品' } as const
const DEPTH_LABELS = { quick: '快速', deep: '深度', comprehensive: '全面' } as const
const STATUS_LABELS = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  RUNNING: '进行中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
} as const

function formData(job: ResearchJob) {
  return {
    company: job.company,
    dimensions: job.dimensions,
    depth: job.depth,
    instructions: job.instructions,
  }
}

function actionContext(job: ResearchJob) {
  return {
    jobId: job.id,
    company: { path: '/company' },
    dimensions: { path: '/dimensions' },
    depth: { path: '/depth' },
    instructions: { path: '/instructions' },
  }
}

export function researchJobFormSurface(job: ResearchJob, surfaceId: string, saved = false): A2uiMessage[] {
  const context = actionContext(job)
  return surface(surfaceId, [
    { component: 'Text', id: 'title', variant: 'h2', text: '创建研究任务' },
    { component: 'Badge', id: 'status', label: saved ? '草稿已保存' : '待确认', variant: 'secondary' },
    { component: 'Text', id: 'job-id', variant: 'caption', text: '任务编号：' + job.id },
    { component: 'TextField', id: 'company', label: '公司', value: { path: '/company' }, placeholder: '例如：NVIDIA' },
    { component: 'ChoicePicker', id: 'dimensions', label: '研究维度', value: { path: '/dimensions' }, variant: 'multipleSelection', options: DIMENSION_OPTIONS },
    { component: 'Select', id: 'depth', label: '研究深度', value: { path: '/depth' }, options: DEPTH_OPTIONS },
    { component: 'TextField', id: 'instructions', label: '附加要求', value: { path: '/instructions' }, variant: 'longText', placeholder: '例如：重点关注 AI 芯片竞争力' },
    { component: 'Row', id: 'actions', gap: 12, children: [ref('save'), ref('submit')] },
    { component: 'Button', id: 'save', label: '保存草稿', variant: 'outline', action: { event: { name: 'save_research_job_draft', context } } },
    { component: 'Button', id: 'submit', label: '提交任务', variant: 'primary', action: { event: { name: 'submit_research_job', context } } },
  ], formData(job))
}

export function researchJobSubmittedSurface(job: ResearchJob, surfaceId: string): A2uiMessage[] {
  return surface(surfaceId, [
    { component: 'Text', id: 'title', variant: 'h2', text: '研究任务已提交' },
    { component: 'Badge', id: 'status', label: STATUS_LABELS[job.status], variant: 'secondary' },
    { component: 'Text', id: 'job-id', variant: 'body', text: '任务编号：' + job.id },
    { component: 'Text', id: 'company', variant: 'body', text: '研究对象：' + job.company },
    { component: 'Text', id: 'scope', variant: 'body', text: '研究维度：' + job.dimensions.map((item) => DIMENSION_LABELS[item]).join(' · ') },
    { component: 'Text', id: 'depth', variant: 'body', text: '研究深度：' + DEPTH_LABELS[job.depth] },
    { component: 'Button', id: 'start', label: '开始研究', variant: 'primary', action: { event: { name: 'start_research_job', context: { jobId: job.id } } } },
  ], {})
}

export function researchJobStatusSurface(job: ResearchJob, surfaceId: string): A2uiMessage[] {
  return surface(surfaceId, [
    { component: 'Text', id: 'title', variant: 'h2', text: '研究任务' },
    { component: 'Badge', id: 'status', label: STATUS_LABELS[job.status], variant: 'secondary' },
    { component: 'Text', id: 'job-id', variant: 'body', text: '任务编号：' + job.id },
    { component: 'Text', id: 'company', variant: 'body', text: '研究对象：' + job.company },
    { component: 'Text', id: 'scope', variant: 'body', text: '研究维度：' + job.dimensions.map((item) => DIMENSION_LABELS[item]).join(' · ') },
  ], {})
}
