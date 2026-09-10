import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

// 仅用于自动化验收，独立启动，生产服务不会加载。 / A separate acceptance-test server, never loaded by the production app.
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') { res.end('ok'); return }
  const parts = await Array.fromAsync(req)
  const body = JSON.parse(Buffer.concat(parts).toString())
  const system = body.messages.find(message => message.role === 'system')?.content ?? ''
  const user = body.messages.filter(message => message.role === 'user').map(message => message.content).join('\n')
  const isReasoning = system.includes('Financial Research Agent')
  const controller = new AbortController()
  res.on('close', () => controller.abort())
  if (user.includes('慢速验收')) {
    try { await delay(20000, undefined, { signal: controller.signal }) } catch { return }
  }
  let content
  let toolCalls
  if (isReasoning) content = '{"findings":[]}'
  else if (system.includes('研究问答助手')) content = '营收反映企业的销售规模。当前数字来自演示数据，可结合利润率继续分析。'
  else if (body.tools && !body.messages.some(message => message.role === 'tool')) {
    content = ''
    toolCalls = [{ id: 'fixture-tool', type: 'function', function: { name: 'get_financial_summary', arguments: '{"company":"NVIDIA"}' } }]
  } else content = JSON.stringify({ version: 'v0.9', updateComponents: { surfaceId: 'fixture', components: user.includes('非法输出验收')
    ? [{ component: 'UnknownComponent', id: 'bad' }]
    : [
      { component: 'MetricCard', id: 'revenue', title: '营收', value: '$91.5B', action: { event: { name: 'explore_metric', context: { company: 'NVIDIA', metric: 'Revenue' } } } },
      { component: 'ResearchSummaryCard', id: 'summary', summary: '演示数据用于验证研究流程。', keyPoints: ['查看来源后再解释指标。'] },
    ],
  } })
  const usage = { prompt_tokens: 100, completion_tokens: 50 }
  const finish_reason = toolCalls ? 'tool_calls' : 'stop'
  if (body.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const data = toolCalls ? { tool_calls: toolCalls.map((tool, index) => ({ ...tool, index })) } : { content }
    res.write('data: ' + JSON.stringify({ choices: [{ delta: data, finish_reason }] }) + '\n\n')
    res.end('data: ' + JSON.stringify({ choices: [], usage }) + '\n\ndata: [DONE]\n\n')
  } else res.end(JSON.stringify({ choices: [{ message: { content, tool_calls: toolCalls }, finish_reason }], usage }))
})
server.listen(3202, '127.0.0.1', () => console.log('Acceptance LLM fixture: 3202'))
