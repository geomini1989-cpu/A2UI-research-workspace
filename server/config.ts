import 'dotenv/config'
import { randomUUID } from 'node:crypto'

export interface AppConfig {
  production: boolean
  host: string
  accessKey: string | undefined
  sessionSecret: string
  agentToken: string
  allowedOrigins: string[]
  maxDailyRuns: number
  secUserAgent: string
  /** DeepSeek API key. Server-side only — never exposed to the browser. */
  deepseekApiKey: string | undefined
  /** Model id; defaults to a stable DeepSeek model but overridable via .env. */
  deepseekModel: string
  /** DeepSeek OpenAI-compatible base URL. */
  deepseekBaseUrl: string
  /** Backend HTTP port. */
  port: number
  /** Research data provider id selected at process startup. */
  researchProviderId: string
  /** Public base URL advertised by the Financial Agent Card. Override to exercise A2A failure fallback. */
  financialAgentBaseUrl: string
  marketAgentBaseUrl: string
  technologyAgentBaseUrl: string
}

export const config: AppConfig = {
  production: process.env.NODE_ENV === 'production',
  host: process.env.HOST || '127.0.0.1',
  accessKey: process.env.APP_ACCESS_KEY,
  sessionSecret: process.env.SESSION_SECRET || randomUUID(),
  agentToken: process.env.AGENT_TOKEN || randomUUID(),
  allowedOrigins: (process.env.PUBLIC_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001').split(','),
  maxDailyRuns: Number(process.env.MAX_DAILY_RUNS || 100),
  secUserAgent: process.env.SEC_USER_AGENT || 'A2UIResearchWorkspace/1.0 (https://github.com/geomini1989-cpu/A2UI-research-workspace)',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  port: Number(process.env.PORT || 3001),
  researchProviderId: process.env.RESEARCH_PROVIDER || 'demo',
  financialAgentBaseUrl: process.env.FINANCIAL_AGENT_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 3001)}`,
  marketAgentBaseUrl: process.env.MARKET_AGENT_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 3001)}`,
  technologyAgentBaseUrl: process.env.TECHNOLOGY_AGENT_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 3001)}`,
}
