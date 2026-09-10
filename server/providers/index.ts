import { SecResearchProvider } from './secResearchProvider.js'
import { config } from '../config.js'
import { demoResearchProvider } from './demoResearchProvider.js'
import {
  ResearchProviderError,
  type ResearchDataProvider,
} from './researchProvider.js'

export type ResearchProviderId = 'demo' | 'sec'

/** 按启动配置选择演示数据或 SEC 财报。 / Select demo data or SEC filings at startup. */
export function createResearchProvider(
  providerId = config.researchProviderId,
): ResearchDataProvider {
  if (providerId === 'demo') return demoResearchProvider
  if (providerId === 'sec') return new SecResearchProvider()
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
