import type { AgentCard } from '@a2a-js/sdk'

export const AGENT_CARD_PATH = '/.well-known/agent-card.json'
export const FINANCIAL_A2A_PATH = '/a2a/financial'
export const MARKET_AGENT_CARD_PATH = '/agents/market/.well-known/agent-card.json'
export const MARKET_A2A_PATH = '/a2a/market'
export const TECHNOLOGY_AGENT_CARD_PATH = '/agents/technology/.well-known/agent-card.json'
export const TECHNOLOGY_A2A_PATH = '/a2a/technology'

type CardDefinition = Pick<AgentCard, 'name' | 'description' | 'skills'> & { id: string; endpoint: string }

function createAgentCard(baseUrl: string, definition: CardDefinition): AgentCard {
  return {
    name: definition.name, description: definition.description, version: '1.1.0',
    provider: { organization: 'AI Research Workspace', url: baseUrl },
    supportedInterfaces: [{ url: `${baseUrl}${definition.endpoint}`, protocolBinding: 'JSONRPC', protocolVersion: '1.0', tenant: '' }],
    capabilities: { streaming: true, pushNotifications: false, extensions: [] },
    defaultInputModes: ['text/plain'], defaultOutputModes: ['application/json'], skills: definition.skills,
    securitySchemes: {}, securityRequirements: [], signatures: [],
  }
}

function skill(domain: string, id: string, name: string, description: string, examples: string[]) {
  return { id, name, description, tags: [domain, id], examples, inputModes: ['text/plain'], outputModes: ['application/json'], securityRequirements: [] }
}

export function createFinancialAgentCard(baseUrl: string): AgentCard {
  return createAgentCard(baseUrl, {
    id: 'financial', endpoint: FINANCIAL_A2A_PATH,
    name: 'Financial Research Agent',
    description: 'Specialist for company fundamentals, financial metrics, trends, valuation and risk analysis. Returns validated research-result/v2 JSON with evidence references.',
    skills: [
      skill('finance', 'company-analysis', 'Company Analysis', 'Analyze company fundamentals and business profile.', ['Analyze NVIDIA fundamentals']),
      skill('finance', 'financial-analysis', 'Financial Analysis', 'Analyze growth, profitability, and financial metrics.', ['Analyze NVIDIA growth and margins']),
      skill('finance', 'company-comparison', 'Company Comparison', 'Compare company financial metrics.', ['Compare NVIDIA and AMD']),
      skill('finance', 'valuation-analysis', 'Valuation Analysis', 'Assess relative valuation metrics and valuation risk.', ['Analyze NVIDIA valuation']),
      skill('finance', 'risk-analysis', 'Financial Risk Analysis', 'Identify financial, concentration, and valuation risks.', ['Analyze NVIDIA financial risk']),
    ],
  })
}

export function createMarketAgentCard(baseUrl: string): AgentCard {
  return createAgentCard(baseUrl, {
    id: 'market', endpoint: MARKET_A2A_PATH, name: 'Market & News Research Agent',
    description: 'Specialist for market dynamics, events and competitive intelligence. Returns validated research-result/v2 JSON with evidence references.',
    skills: [
      skill('market', 'market-research', 'Market Research', 'Research market dynamics and positioning.', ['Summarize NVIDIA market changes']),
      skill('market', 'news-research', 'News Research', 'Summarize company and industry news.', ['Summarize recent NVIDIA news']),
      skill('market', 'industry-trends', 'Industry Trends', 'Analyze industry-level trends.', ['Analyze semiconductor trends']),
      skill('market', 'competitive-intelligence', 'Competitive Intelligence', 'Track competitor and market positioning changes.', ['Analyze NVIDIA competition']),
      skill('market', 'market-events', 'Market Events', 'Summarize relevant market events.', ['List market events affecting NVIDIA']),
    ],
  })
}

export function createTechnologyAgentCard(baseUrl: string): AgentCard {
  return createAgentCard(baseUrl, {
    id: 'technology', endpoint: TECHNOLOGY_A2A_PATH, name: 'Technology & Product Research Agent',
    description: 'Specialist for technology roadmaps, products, competitive moat and technology risk. Returns validated research-result/v2 JSON with evidence references.',
    skills: [
      skill('technology', 'technology-analysis', 'Technology Analysis', 'Analyze technology capabilities and roadmaps.', ['Analyze NVIDIA technology moat']),
      skill('technology', 'product-analysis', 'Product Analysis', 'Analyze products and portfolio positioning.', ['Analyze NVIDIA products']),
      skill('technology', 'technical-trends', 'Technical Trends', 'Analyze relevant technical trends.', ['Analyze AI accelerator trends']),
      skill('technology', 'product-comparison', 'Product Comparison', 'Compare product positioning and strengths.', ['Compare NVIDIA and AMD products']),
      skill('technology', 'technology-risk', 'Technology Risk', 'Identify technical and product execution risks.', ['Analyze NVIDIA technology risks']),
    ],
  })
}
