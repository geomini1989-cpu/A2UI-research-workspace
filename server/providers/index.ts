import { demoResearchProvider } from './demoResearchProvider.js'
import {
  ResearchProviderError,
  type ResearchDataProvider,
} from './researchProvider.js'

export type ResearchProviderId = 'demo'

/**
 * Composition root for research data.
 *
 * Today only the deterministic demo provider is registered. A live provider can
 * be added here later without changing MCP tools or specialist agents.
 */
export function createResearchProvider(
  providerId = process.env.RESEARCH_PROVIDER ?? 'demo',
): ResearchDataProvider {
  if (providerId === 'demo') return demoResearchProvider
  throw new ResearchProviderError(
    `Unsupported research provider: "${providerId}"`,
    'UNSUPPORTED_PROVIDER',
  )
}

let activeProvider: ResearchDataProvider | undefined

export function getResearchProvider(): ResearchDataProvider {
  activeProvider ??= createResearchProvider()
  return activeProvider
}

/** Test-only dependency override. */
export function setResearchProviderForTests(provider: ResearchDataProvider | undefined): void {
  activeProvider = provider
}
