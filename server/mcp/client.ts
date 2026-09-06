import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createResearchServer } from './server.js'
import { RESEARCH_TOOL_NAMES, ResearchToolError } from './tools/researchTools.js'

export interface CallToolOutcome {
  /** Human/LLM-readable tool text result. */
  text: string
  /** Structured payload (`structuredContent`), if the tool provided one. */
  data: unknown
}

export interface ResearchClient {
  /** Names of tools exposed by the server. */
  listTools(): Promise<string[]>
  /** Call a named tool. Enforces the allow-list and throws on any error. */
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolOutcome>
  close(): Promise<void>
}

/**
 * Connect a real MCP `Client` to the in-process Research server over an
 * in-memory transport. This performs a genuine MCP handshake and routes tool
 * calls through the protocol — the backend agent never executes tools directly.
 */
export async function createResearchClient(): Promise<ResearchClient> {
  const server = createResearchServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const client = new Client({ name: 'research-demo-client', version: '1.0.0' })
  // The server must be listening before the client sends its `initialize`
  // handshake, otherwise `client.connect()` hangs forever. Start the server
  // side first, then connect the client. Either may reject if the pair fails to
  // handshake; the caller wraps this in try/catch so it never crashes Node.
  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return {
    async listTools() {
      const res = await client.listTools()
      return res.tools.map((t) => t.name)
    },

    async callTool(name, args) {
      // Enforce the allow-list at the boundary as well; unknown tools are
      // rejected before they ever reach the server.
      if (!(RESEARCH_TOOL_NAMES as readonly string[]).includes(name)) {
        throw new ResearchToolError(`Unknown tool: "${name}"`, 'UNKNOWN_TOOL')
      }
      const res = await client.callTool({ name, arguments: args })
      const text = extractText(res)
      if (res.isError) {
        throw new ResearchToolError(text || `Tool "${name}" returned an error`, 'TOOL_ERROR')
      }
      return { text, data: res.structuredContent }
    },

    async close() {
      await client.close()
    },
  }
}

function extractText(res: unknown): string {
  if (!res || typeof res !== 'object') return ''
  const content = (res as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => {
      const block = c as { type?: string; text?: string }
      return block.type === 'text' ? (block.text ?? '') : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}
