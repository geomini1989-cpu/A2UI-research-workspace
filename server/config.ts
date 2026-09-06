import 'dotenv/config'

export interface AppConfig {
  /** DeepSeek API key. Server-side only — never exposed to the browser. */
  deepseekApiKey: string | undefined
  /** Model id; defaults to a stable DeepSeek model but overridable via .env. */
  deepseekModel: string
  /** DeepSeek OpenAI-compatible base URL. */
  deepseekBaseUrl: string
  /** Backend HTTP port. */
  port: number
  /** Public base URL advertised by the Financial Agent Card. Override to exercise A2A failure fallback. */
  financialAgentBaseUrl: string
  marketAgentBaseUrl: string
  technologyAgentBaseUrl: string
}

export const config: AppConfig = {
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  port: Number(process.env.PORT || 3001),
  financialAgentBaseUrl: process.env.FINANCIAL_AGENT_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 3001)}`,
  marketAgentBaseUrl: process.env.MARKET_AGENT_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 3001)}`,
  technologyAgentBaseUrl: process.env.TECHNOLOGY_AGENT_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 3001)}`,
}
