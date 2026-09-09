import type { AgentCard } from '@a2a-js/sdk'

export type RequiredSkill =
  | 'company-analysis' | 'financial-analysis' | 'company-comparison' | 'valuation-analysis' | 'risk-analysis'
  | 'market-research' | 'news-research' | 'industry-trends' | 'competitive-intelligence' | 'market-events'
  | 'technology-analysis' | 'product-analysis' | 'technical-trends' | 'product-comparison' | 'technology-risk'

export interface TaskRequirement {
  requiredSkills: RequiredSkill[]
  canRunInParallel: boolean
  useCoordinatorMcp: boolean
}

export interface AgentMatch {
  card: AgentCard
  matchedSkills: RequiredSkill[]
  score: number
}

export interface DelegationPlan {
  requirement: TaskRequirement
  delegations: AgentMatch[]
  unmatchedSkills: RequiredSkill[]
}

export type ResearchDimension = 'financial' | 'market' | 'technology'
export type ResearchImportance = 'low' | 'medium' | 'high'
export type ResearchSentiment = 'positive' | 'neutral' | 'negative' | 'mixed'

export interface ResearchEntity {
  name: string
  ticker?: string
}

export interface ResearchEvidence {
  id: string
  sourceName: string
  sourceType: 'mcp' | 'demo'
  tool?: string
  ref?: string
  description?: string
}

export interface ResearchMetric {
  key: string
  label: string
  value: string
  company?: string
  category?: string
  period?: string
  unit?: string
  direction?: 'up' | 'down' | 'flat' | 'unknown'
  evidenceIds: string[]
}

export interface ResearchTrendPoint {
  period: string
  value: number
}

export interface ResearchTrend {
  key: string
  label: string
  company?: string
  unit?: string
  points: ResearchTrendPoint[]
  evidenceIds: string[]
}

export interface ResearchFinding {
  id: string
  category: string
  title: string
  detail: string
  importance: ResearchImportance
  sentiment?: ResearchSentiment
  evidenceIds: string[]
}

export interface ResearchRisk {
  id: string
  category: string
  title: string
  detail: string
  severity: ResearchImportance
  evidenceIds: string[]
}

export interface SpecialistActivity {
  stage: 'working' | 'tool'
  message: string
}

export interface NeedUserInputField {
  id: string
  label: string
  type: 'text' | 'single_choice' | 'multiple_choice' | 'boolean'
  required: boolean
  options?: string[]
}

export interface NeedUserInput {
  reason: string
  fields: NeedUserInputField[]
}

/**
 * Versioned, cross-specialist research contract.
 *
 * Specialists return facts, trends, findings, risks and evidence as structured
 * fields. Natural-language prose is no longer the primary integration format.
 */
export interface StructuredResearchResult {
  schemaVersion: 'research-result/v2'
  agentId: string
  dimension: ResearchDimension
  subject: string
  entities: ResearchEntity[]
  metrics: ResearchMetric[]
  trends: ResearchTrend[]
  findings: ResearchFinding[]
  risks: ResearchRisk[]
  evidence: ResearchEvidence[]
  activities: SpecialistActivity[]
  /** Optional short operator/debug note; never the primary research payload. */
  note?: string
  /** A Specialist may request structured input, but only the Coordinator may render interaction UI. */
  needUserInput?: NeedUserInput
}

/** Compatibility name retained at the A2A/orchestrator boundary. */
export type SpecialistResult = StructuredResearchResult

export interface DelegationResult {
  agentName: string
  matchedSkills: RequiredSkill[]
  status: 'completed' | 'failed'
  taskId?: string
  result?: SpecialistResult
  error?: string
}

export interface AggregationContext {
  schemaVersion: 'aggregation-context/v2'
  subject: string
  dimensions: Partial<Record<ResearchDimension, SpecialistResult>>
  unavailable: { agentName: string; skills: RequiredSkill[]; reason: string }[]
  unmatchedSkills: RequiredSkill[]
  completedAgents: string[]
  evidence: ResearchEvidence[]
}

export type AgentActivityEvent =
  | { stage: 'planning'; actor: 'Research Coordinator'; detail: string }
  | { stage: 'agent_discovered'; actor: string; detail: string }
  | { stage: 'delegation_started' | 'agent_working' | 'tool_call' | 'agent_completed' | 'agent_failed'; actor: string; detail?: string }
  | { stage: 'aggregation_started' | 'a2ui_generation' | 'complete'; actor: 'Research Coordinator' | 'UI'; detail?: string }
