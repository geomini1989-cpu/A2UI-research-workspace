import type { ResearchDimension } from './types.js'

export class InteractionValidationError extends Error {
  readonly code = 'INVALID_INTERACTION_INPUT'
  constructor(message: string) { super(message); this.name = 'InteractionValidationError' }
}

export function validateCompany(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new InteractionValidationError(`${label} must be a string`)
  const company = value.trim()
  if (!company) throw new InteractionValidationError(`${label} is required`)
  if (company.length > 80) throw new InteractionValidationError(`${label} is too long`)
  return company
}

export function validateComparison(context: Record<string, unknown>): { companyA: string; companyB: string } {
  const companyA = validateCompany(context.companyA, 'Company A')
  const companyB = validateCompany(context.companyB, 'Company B')
  if (companyA.toLowerCase() === companyB.toLowerCase()) throw new InteractionValidationError('Company A and Company B must be different')
  return { companyA, companyB }
}

const DIMENSIONS = ['financial', 'market', 'technology'] as const
export function validateDimensions(value: unknown): ResearchDimension[] {
  if (!Array.isArray(value) || value.length === 0) throw new InteractionValidationError('Select at least one research dimension')
  const dimensions = value.map((item) => {
    if (typeof item !== 'string' || !(DIMENSIONS as readonly string[]).includes(item)) throw new InteractionValidationError(`Invalid research dimension: ${String(item)}`)
    return item as ResearchDimension
  })
  return [...new Set(dimensions)]
}
