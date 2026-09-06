import type { AgentCard } from '@a2a-js/sdk'
import type { AgentMatch, RequiredSkill } from '../orchestration/types.js'

const agents = new Map<string, AgentCard>()

export function registerAgent(card: AgentCard): void { agents.set(card.name, card) }
export function listAgents(): AgentCard[] { return [...agents.values()] }
export function getAgent(name: string): AgentCard | undefined { return agents.get(name) }

export function findAgentsBySkill(skillIds: readonly string[]): AgentCard[] {
  if (skillIds.length === 0) return []
  return listAgents().map((card) => ({ card, matches: skillIds.filter((id) => card.skills.some((skill) => skill.id === id)).length })).filter(({ matches }) => matches > 0).sort((a, b) => b.matches - a.matches).map(({ card }) => card)
}

export function matchAgentsBySkills(skillIds: readonly RequiredSkill[]): AgentMatch[] {
  return listAgents().map((card) => {
    const matchedSkills = skillIds.filter((required) => card.skills.some((skill) => skill.id === required))
    const requiredTerms = skillIds.flatMap((id) => id.split('-'))
    const searchable = card.skills.map((skill) => `${skill.tags.join(' ')} ${skill.description}`).join(' ').toLowerCase()
    const descriptiveMatches = requiredTerms.filter((term) => searchable.includes(term)).length
    return { card, matchedSkills, score: matchedSkills.length * 100 + descriptiveMatches }
  }).filter((match) => match.matchedSkills.length > 0).sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
}

export function clearAgentRegistry(): void { agents.clear() }
