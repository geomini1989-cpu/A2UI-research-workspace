import type { ZodRawShape } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  executeResearchTool,
  RESEARCH_TOOL_NAMES,
  ResearchToolError,
  searchCompanyArgs,
  getCompanyProfileArgs,
  getFinancialSummaryArgs,
} from './tools/researchTools.js'

/**
 * Build the Research MCP server exposing the demo tools.
 *
 * Registering each tool here genuinely exposes it over the MCP protocol. The
 * backend agent calls these through the client (`client.ts`) and the callback
 * below dispatches to the shared `executeResearchTool` handler — so the LLM can
 * never execute anything; the backend always goes through the MCP boundary.
 */
export function createResearchServer(): McpServer {
  const server = new McpServer({ name: 'research-demo', version: '1.0.0' })

  register(server, 'search_company', 'Search companies', 'Search the mock company universe by name or ticker.', searchCompanyArgs)
  register(server, 'get_company_profile', 'Get company profile', 'Get business profile by name or ticker.', getCompanyProfileArgs)
  register(server, 'get_financial_summary', 'Get financial summary', 'Get financial metrics by name or ticker.', getFinancialSummaryArgs)

  return server
}

function register(
  server: McpServer,
  name: (typeof RESEARCH_TOOL_NAMES)[number],
  title: string,
  description: string,
  inputSchema: ZodRawShape,
): void {
  server.registerTool(name, { title, description, inputSchema : inputSchema }, async (args) => {
    try {
      const result = executeResearchTool(name, args)
      return {
        content: [{ type: 'text', text: result.text }],
        structuredContent: result.data as Record<string, unknown>,
      }
    } catch (err) {
      const message = err instanceof ResearchToolError ? err.message : 'Tool execution failed'
      return { content: [{ type: 'text', text: message }], isError: true }
    }
  })
}
