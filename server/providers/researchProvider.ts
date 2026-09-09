import type {
  CompanyFinancialData,
  CompanyProfile,
  CompanySearchResult,
} from '../domain/research.js'

export type ResearchProviderKind = 'demo' | 'live'

export interface ResearchProviderMetadata {
  id: string
  name: string
  kind: ResearchProviderKind
  sourceLabel: string
}

/**
 * Stable provider contract consumed by the MCP adapter.
 *
 * Providers may call JSON fixtures, HTTP APIs, databases or other services, but
 * must return the provider-neutral domain model above.
 */
export interface ResearchDataProvider {
  readonly metadata: ResearchProviderMetadata
  searchCompanies(query: string): Promise<CompanySearchResult[]>
  getCompanyProfile(company: string): Promise<CompanyProfile>
  getFinancialSummary(company: string): Promise<CompanyFinancialData>
}

export class ResearchProviderError extends Error {
  readonly code: 'BAD_ARGS' | 'NOT_FOUND' | 'UPSTREAM_ERROR' | 'UNSUPPORTED_PROVIDER'

  constructor(
    message: string,
    code: ResearchProviderError['code'],
  ) {
    super(message)
    this.name = 'ResearchProviderError'
    this.code = code
  }
}
