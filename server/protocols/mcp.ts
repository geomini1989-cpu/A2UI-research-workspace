/**
 * Model Context Protocol (MCP) boundary.
 *
 * Extension point for wiring real tools (market data, docs, databases) via MCP.
 * NOT implemented — only the resource/tool shapes are declared. The root agent
 * currently operates on Demo data only; nothing resolves or executes tools yet.
 */

export interface McpResource {
  id: string
  name: string
  description?: string
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

/** List tools a registered MCP server would expose. */
export function listMcpTools(): McpTool[] {
  // Intentionally empty until an MCP server is connected.
  return []
}
