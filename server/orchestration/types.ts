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

export interface SpecialistInsight { title: string; detail: string; sentiment?: 'positive' | 'neutral' | 'negative' }
export interface SpecialistRisk { title: string; detail: string; level: 'low' | 'medium' | 'high' }
export interface SpecialistMetric { label: string; value: string; company?: string; category?: string }
export interface SpecialistSource { name: string; type: 'mcp' | 'demo'; description: string }
export interface SpecialistActivity { stage: 'working' | 'tool'; message: string }
export interface NeedUserInputField { id: string; label: string; type: 'text' | 'single_choice' | 'multiple_choice' | 'boolean'; required: boolean; options?: string[] }
export interface NeedUserInput { reason: string; fields: NeedUserInputField[] }

export interface SpecialistResult {
  agentId: string
  taskType: 'financial' | 'market' | 'technology'
  subject: string
  summary: string
  insights: SpecialistInsight[]
  risks: SpecialistRisk[]
  metrics: SpecialistMetric[]
  sources: SpecialistSource[]
  activities: SpecialistActivity[]
  /** A Specialist may request structured input, but only the Coordinator may render interaction UI. */
  needUserInput?: NeedUserInput
}

export interface DelegationResult {
  agentName: string
  matchedSkills: RequiredSkill[]
  status: 'completed' | 'failed'
  taskId?: string
  result?: SpecialistResult
  error?: string
}

export interface AggregationContext {
  subject: string
  dimensions: Partial<Record<SpecialistResult['taskType'], SpecialistResult>>
  unavailable: { agentName: string; skills: RequiredSkill[]; reason: string }[]
  unmatchedSkills: RequiredSkill[]
  completedAgents: string[]
}

export type AgentActivityEvent =
  | { stage: 'planning'; actor: 'Research Coordinator'; detail: string }
  | { stage: 'agent_discovered'; actor: string; detail: string }
  | { stage: 'delegation_started' | 'agent_working' | 'tool_call' | 'agent_completed' | 'agent_failed'; actor: string; detail?: string }
  | { stage: 'aggregation_started' | 'a2ui_generation' | 'complete'; actor: 'Research Coordinator' | 'UI'; detail?: string }
