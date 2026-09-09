import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { buildTrustedA2uiMessages } from '../a2ui/a2uiGenerator.js'
import { RESEARCH_CATALOG_ID } from '../a2ui/a2uiSchema.js'
import type { PendingInteraction, ResearchDimension } from './types.js'

type Component = Record<string, unknown>
const ref = (id: string) => ({ id })

function surface(interaction: PendingInteraction, components: Component[], data: Record<string, unknown>): A2uiMessage[] {
  const nestedIds = new Set(
    components.flatMap((item) => Array.isArray(item.children)
      ? item.children.flatMap((child) => child && typeof child === 'object' && 'id' in child ? [String(child.id)] : [])
      : []),
  )
  const root = {
    component: 'Column', id: 'root', gap: 16,
    children: components.filter((item) => !nestedIds.has(String(item.id))).map((item) => ref(String(item.id))),
  }
  return buildTrustedA2uiMessages([
    { version: 'v0.9', createSurface: { surfaceId: interaction.surfaceId, catalogId: RESEARCH_CATALOG_ID, theme: {} } },
    { version: 'v0.9', updateDataModel: { surfaceId: interaction.surfaceId, path: '/', value: data } },
    { version: 'v0.9', updateComponents: { surfaceId: interaction.surfaceId, components: [root, ...components] } },
  ], { dataSource: false }).messages
}

function ids(interaction: PendingInteraction) {
  return { interactionId: interaction.interactionId, taskId: interaction.taskId }
}

function cancelButton(interaction: PendingInteraction): Component {
  return { component: 'Button', id: 'cancel', label: '取消', variant: 'outline', action: { event: { name: 'cancel_task', context: ids(interaction) } } }
}

export function missingInformationSurface(interaction: PendingInteraction): A2uiMessage[] {
  const material = interaction.type === 'material_ambiguity'
  const fields: Component[] = material
    ? [
        { component: 'TextField', id: 'company-a', label: '公司 A', value: { path: '/companyA' }, placeholder: '例如：Apple' },
        { component: 'ChoicePicker', id: 'company-b', label: '请选择存在歧义的对比对象', value: { path: '/companyBChoice' }, variant: 'mutuallyExclusive', options: (interaction.context.decision.ambiguousOptions ?? []).map((value) => ({ value, label: value })) },
      ]
    : [
        { component: 'TextField', id: 'company-a', label: '公司 A', value: { path: '/companyA' }, placeholder: '例如：NVIDIA' },
        { component: 'TextField', id: 'company-b', label: '公司 B', value: { path: '/companyB' }, placeholder: '例如：AMD' },
      ]
  const actionContext = material
    ? { ...ids(interaction), companyA: { path: '/companyA' }, companyB: { path: '/companyBChoice/0' } }
    : { ...ids(interaction), companyA: { path: '/companyA' }, companyB: { path: '/companyB' } }
  return surface(interaction, [
    { component: 'Text', id: 'title', variant: 'h2', text: '公司对比' },
    { component: 'Badge', id: 'status', label: material ? '需要澄清' : '缺少必要信息', variant: 'secondary' },
    ...fields,
    { component: 'Row', id: 'actions', gap: 12, children: [ref('continue'), ref('cancel')] },
    { component: 'Button', id: 'continue', label: '继续', variant: 'primary', action: { event: { name: 'submit_missing_information', context: actionContext } } },
    cancelButton(interaction),
  ], material ? { companyA: 'Apple', companyBChoice: [] } : { companyA: '', companyB: '' })
}

const DIMENSION_OPTIONS = [
  { value: 'financial', label: '财务' }, { value: 'market', label: '市场与新闻' }, { value: 'technology', label: '技术与产品' },
]

export function researchScopeSurface(interaction: PendingInteraction, dimensions: ResearchDimension[] = ['financial', 'market', 'technology']): A2uiMessage[] {
  return surface(interaction, [
    { component: 'Text', id: 'title', variant: 'h2', text: '选择研究重点' },
    { component: 'Text', id: 'help', variant: 'body', text: '仅选择你希望纳入本次研究的维度。' },
    { component: 'ChoicePicker', id: 'dimensions', label: '分析维度', value: { path: '/dimensions' }, variant: 'multipleSelection', options: DIMENSION_OPTIONS },
    { component: 'Row', id: 'actions', gap: 12, children: [ref('start'), ref('cancel')] },
    { component: 'Button', id: 'start', label: '开始研究', variant: 'primary', action: { event: { name: 'submit_research_scope', context: { ...ids(interaction), dimensions: { path: '/dimensions' } } } } },
    cancelButton(interaction),
  ], { dimensions })
}

export function planReviewSurface(interaction: PendingInteraction): A2uiMessage[] {
  const plan = interaction.context.plan
  const skills = plan?.requirement.requiredSkills.join(', ') || 'Standard comprehensive research'
  const selectedSkills = plan?.delegations.flatMap((item) => item.matchedSkills) ?? []
  const dimensions = [
    selectedSkills.some((skill) => /company|financial|valuation|risk/.test(skill)) ? '财务' : '',
    selectedSkills.some((skill) => /market|news|industry|competitive/.test(skill)) ? '市场' : '',
    selectedSkills.some((skill) => /technology|technical|product/.test(skill)) ? '技术' : '',
  ].filter(Boolean).join(', ')
  return surface(interaction, [
    { component: 'Text', id: 'title', variant: 'h2', text: '对比计划' },
    { component: 'Badge', id: 'status', label: '等待确认', variant: 'secondary' },
    { component: 'Text', id: 'targets', variant: 'body', text: `请求：${interaction.context.originalRequest}` },
    { component: 'Text', id: 'skills', variant: 'body', text: `分析内容：${skills}` },
    { component: 'Text', id: 'agents', variant: 'body', text: `研究领域：${dimensions || '确认后自动选择'}` },
    { component: 'Row', id: 'actions', gap: 12, children: [ref('start'), ref('modify'), ref('cancel')] },
    { component: 'Button', id: 'start', label: '开始', variant: 'primary', action: { event: { name: 'approve_plan', context: ids(interaction) } } },
    { component: 'Button', id: 'modify', label: '修改范围', variant: 'outline', action: { event: { name: 'modify_plan', context: ids(interaction) } } },
    cancelButton(interaction),
  ], {})
}

export function approvalSurface(interaction: PendingInteraction): A2uiMessage[] {
  return surface(interaction, [
    { component: 'Text', id: 'title', variant: 'h2', text: '需要确认' },
    { component: 'Text', id: 'description', variant: 'body', text: interaction.context.decision.explanation ?? 'Confirm this demo operation.' },
    { component: 'Row', id: 'actions', gap: 12, children: [ref('approve'), ref('cancel')] },
    { component: 'Button', id: 'approve', label: '确认并继续', variant: 'primary', action: { event: { name: 'approve_operation', context: ids(interaction) } } },
    cancelButton(interaction),
  ], {})
}

export function cancelledSurface(interaction: PendingInteraction): A2uiMessage[] {
  return surface(interaction, [
    { component: 'Text', id: 'title', variant: 'h2', text: '研究已取消。' },
    { component: 'Badge', id: 'status', label: '已取消', variant: 'secondary' },
  ], {})
}
