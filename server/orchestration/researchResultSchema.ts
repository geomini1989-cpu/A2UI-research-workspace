import { z } from 'zod'

import type { StructuredResearchResult } from './types.js'

const Importance = z.enum(['low', 'medium', 'high'])
const Sentiment = z.enum(['positive', 'neutral', 'negative', 'mixed'])

const Evidence = z.object({
  id: z.string().min(1).max(160),
  sourceName: z.string().min(1).max(120),
  sourceType: z.enum(['mcp', 'demo']),
  tool: z.string().max(80).optional(),
  ref: z.string().max(200).optional(),
  description: z.string().max(240).optional(),
})

const Entity = z.object({
  name: z.string().min(1).max(100),
  ticker: z.string().max(24).optional(),
})

const Metric = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(120),
  company: z.string().max(100).optional(),
  category: z.string().max(80).optional(),
  period: z.string().max(60).optional(),
  unit: z.string().max(40).optional(),
  direction: z.enum(['up', 'down', 'flat', 'unknown']).optional(),
  evidenceIds: z.array(z.string().min(1).max(160)).max(8),
})

const Trend = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(100),
  company: z.string().max(100).optional(),
  unit: z.string().max(40).optional(),
  points: z.array(z.object({
    period: z.string().min(1).max(60),
    value: z.number().finite(),
  })).min(1).max(64),
  evidenceIds: z.array(z.string().min(1).max(160)).max(8),
})

const Finding = z.object({
  id: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(360),
  importance: Importance,
  sentiment: Sentiment.optional(),
  evidenceIds: z.array(z.string().min(1).max(160)).max(8),
})

const Risk = z.object({
  id: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(360),
  severity: Importance,
  evidenceIds: z.array(z.string().min(1).max(160)).max(8),
})

const Activity = z.object({
  stage: z.enum(['working', 'tool']),
  message: z.string().min(1).max(240),
})

const NeedUserInput = z.object({
  reason: z.string().min(1).max(240),
  fields: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(100),
    type: z.enum(['text', 'single_choice', 'multiple_choice', 'boolean']),
    required: z.boolean(),
    options: z.array(z.string().max(100)).max(30).optional(),
  })).min(1).max(12),
})

export const StructuredResearchResultSchema = z.object({
  schemaVersion: z.literal('research-result/v2'),
  agentId: z.string().min(1).max(80),
  dimension: z.enum(['financial', 'market', 'technology']),
  subject: z.string().min(1).max(160),
  entities: z.array(Entity).min(1).max(8),
  metrics: z.array(Metric).max(120),
  trends: z.array(Trend).max(30),
  findings: z.array(Finding).max(40),
  risks: z.array(Risk).max(40),
  evidence: z.array(Evidence).min(1).max(80),
  activities: z.array(Activity).max(100),
  note: z.string().max(240).optional(),
  needUserInput: NeedUserInput.optional(),
}).superRefine((value, ctx) => {
  const ids = value.evidence.map((item) => item.id)
  const uniqueIds = new Set(ids)
  if (uniqueIds.size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'Evidence ids must be unique' })
  }

  const checkRefs = (items: Array<{ evidenceIds: string[] }>, path: string) => {
    items.forEach((item, index) => {
      for (const evidenceId of item.evidenceIds) {
        if (!uniqueIds.has(evidenceId)) {
          ctx.addIssue({
            code: 'custom',
            path: [path, index, 'evidenceIds'],
            message: `Unknown evidence id: ${evidenceId}`,
          })
        }
      }
    })
  }

  checkRefs(value.metrics, 'metrics')
  checkRefs(value.trends, 'trends')
  checkRefs(value.findings, 'findings')
  checkRefs(value.risks, 'risks')
})

export function parseStructuredResearchResult(value: unknown): StructuredResearchResult | null {
  const parsed = StructuredResearchResultSchema.safeParse(value)
  return parsed.success ? parsed.data as StructuredResearchResult : null
}

export function assertStructuredResearchResult(value: unknown): StructuredResearchResult {
  return StructuredResearchResultSchema.parse(value) as StructuredResearchResult
}
