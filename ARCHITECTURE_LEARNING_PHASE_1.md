> 历史设计记录：当前运行架构、数据能力与验收方式以 [README](./README.md) 为准。

# AI Research Workspace：全链路架构学习（第一阶段）

> 本文基于当前代码库的只读审查整理。它描述的是实际实现，不把设计概念当作已实现事实。

## 审查范围与关键事实

- 当前系统是 React + Fastify + DeepSeek + A2A + MCP + A2UI 的研究助手 Demo。
- 所有市场与公司数据都是硬编码的 Demo 数据；没有真实市场数据源或数据库。
- A2A 使用真实的 HTTP/JSON-RPC 协议与官方 SDK。
- MCP 使用真实官方 SDK，但 Client 和 Server 通过进程内 `InMemoryTransport` 相连，不是远程 MCP HTTP 服务。
- Agent Discovery 在当前实现中基于启动时注册到内存 Registry 的 Agent Card；并不会在每个用户请求中重新通过 well-known URL 拉取 Card。
- 网络返回是 NDJSON `AgentEvent` 流。Coordinator 会先发出确定性 A2UI 骨架；Specialist 的 working/tool 事件经 A2A SSE 实时返回，每个 Agent 完成后立即更新同一 Surface 的 DataModel 和组件。DeepSeek 的最终综合仍不按 token 输出：完整 A2UI JSON 经验证后原位替换渐进视图。

## 真实完整链路

```text
启动期（不是每次用户请求）
[启动：main()](server/index.ts#L10)
  └─ registerSpecialistA2aRoutes()
       └─ 创建 Financial / Market / Technology Agent Card
            └─ registerAgent(card) 写入内存 Agent Registry

用户
  ↓ 输入文本
React ChatInput / ChatPanel                         [普通 React UI]
  ↓ onSend(text)
Zustand workspaceStore.sendMessage                  [前端壳层状态]
  ↓ POST /api/chat { message }
agentService.streamChat                             [HTTP 请求 + NDJSON 读取]
  ↓
Fastify POST /api/chat                              [NDJSON 写入]
  ↓
runResearchAgent                                    [Main Coordinator 入口]
  ├─ decideInteraction()                            [确定性 HITL 策略]
  │    └─ 若必须询问：后端确定性生成 A2UI 表单，任务暂停
  │
  └─ runAutonomousResearch()
       ↓
    analyzeTaskRequirements()                       [确定性规则，不是 LLM]
       ↓ TaskRequirement.requiredSkills
    Agent Registry.matchAgentsBySkills()
       ↓ Agent Card + skill 匹配
    executeDelegationPlan()                         [Promise.all 并行]
       ↓
    A2A Client — HTTP / JSON-RPC
       ↓
    Specialist A2A Server
       ↓
    Financial / Market / Technology Specialist
       ↓
    MCP Client — InMemoryTransport
       ↓
    MCP Server → allow-listed Demo tools
       ↓
    SpecialistResult
       ↓
    AggregationContext
       ↓
    DeepSeek chatText()                             [最终受控 A2UI 编排]
       ↓ 完整 A2UI JSON 数组
    buildA2uiMessages()
       ├─ A2UI wire schema 检查
       ├─ Component allow-list
       ├─ root 自动补全
       └─ 数据来源块自动补全
       ↓
    AgentEvent NDJSON（每行外层事件；message 字段内含 A2UI）
       ↓
agentService.consumeNdjson()
  ↓
Zustand：聊天消息、加载状态、活动记录、错误
  ↓
A2UI MessageProcessor：Surface / DataModel 状态
  ↓
React Component Catalog / Registry
  ↓
<A2uiSurface />
  ↓
已有 React 组件（MetricCard / Chart / Table 等）
  ↓
用户看到动态研究界面（Generative UI）
```

## 三个核心主题的位置

| 概念 | 当前项目中的准确位置 |
|---|---|
| Generative UI | DeepSeek 根据任务选择、组合并填充受限组件；从输出 A2UI 开始，到已有 React 组件渲染结束。|
| A2UI | Coordinator 与前端 Renderer 之间的受控 UI 描述协议；不是 JSX、HTML、CSS 或 JavaScript。|
| Agent Card | [agentCard.ts](server/a2a/agentCard.ts#L12) 创建，启动时注册到 [agentRegistry.ts](server/registry/agentRegistry.ts#L6)，用来匹配技能并提供 A2A endpoint。|
| Agent Registry | 内存 Card 集合；按 `skills[].id` 及描述性词汇打分，找出可完成任务的 Agent。|
| A2A | [client.ts](server/a2a/client.ts#L17) 通过 Agent Card 的 `supportedInterfaces` 向 Specialist 发 HTTP/JSON-RPC task。|
| MCP | Specialist 或 Coordinator 通过 MCP Client 调用已注册的工具；工具由后端执行。|

## Generative UI 的边界

### 普通 React UI

- `ChatInput`、聊天消息列表、加载态、错误态、Agent 过程展示。
- React 组件的具体 DOM、样式、Tailwind/shadcn/Recharts 实现。
- 这些由开发者预先写好；模型不创建它们。

### Generative UI

- 模型根据研究请求决定使用哪些受限组件，例如 `MetricCard`、`ComparisonCard`、`Chart`、`Table`、`RiskBadge`。
- 模型决定这些组件如何组合、每个组件显示哪些内容、以及有限的声明式 action 上下文。
- A2UI 描述被验证后，由已有 React 组件渲染。

### 五层模型

```text
1. Data
   SpecialistResult / AggregationContext / MCP Demo tool result
2. UI Intent
   当前项目没有独立的 TypeScript UIIntent 类型；主要由 Coordinator Prompt 与 DeepSeek 推理隐式表达
3. A2UI Description
   A2UI v0.9 JSON wire messages
4. Renderer
   MessageProcessor + Catalog + A2uiSurface
5. React Component
   MetricCard、Chart、Table 等预先实现的 React 组件
```

因此，这不是固定 Dashboard：开发者没有提前写死每一次请求都渲染哪些指标、图表或表格。动态的是受约束的“组件选择、树结构和数据/props”，不是任意可执行前端代码。

## 安全边界

模型不能输出任意 JSX、HTML、JavaScript、CSS 或执行任意 action，原因如下：

1. [systemPrompt.ts](server/agent/systemPrompt.ts#L10) 要求模型只输出 A2UI JSON，并只能选择 Catalog 中的名称。
2. [a2uiSchema.ts](server/a2ui/a2uiSchema.ts#L43) 用官方 `A2uiMessageSchema` 检查 wire message，再过滤不在 `ALLOWED_COMPONENTS` 中的 component。
3. `ALLOWED_COMPONENTS` 源自 [componentCatalog.ts](server/catalog/componentCatalog.ts#L32)；Prompt、服务端 allow-list 与客户端 Registry 围绕同一组件清单工作。
4. [actionRegistry.ts](server/interaction/actionRegistry.ts#L33) 拒绝未 allow-list 的 action；HITL action 还会验证 interactionId、taskId 与 surfaceId。
5. MCP tool name 在 Coordinator 与 MCP Client 两层被 allow-list；模型只提出 tool 与 arguments，后端才实际执行。

需要精确注意：服务端目前明确验证 A2UI wire 格式和 component 名称；每个组件的细粒度 props schema 位于客户端 `createComponentImplementation(... zod schema ...)`。因此“未知组件”有明确服务端拦截，但“所有非法 props 都有服务端逐字段 Zod 校验”不是当前代码已经实现的说法。

## Code / Prompt / LLM 的责任边界

| 决策 | 实际负责方 |
|---|---|
| 是否进入 HITL | Code：`decideInteraction()` 中的确定性规则。|
| 用户请求需要哪些 skills | Code：`analyzeTaskRequirements()` 的关键词/正则规则。|
| skill 对应哪些 Agent | Code + Agent Card：Registry 匹配 Card 的 `skills`。|
| 是否并行调用 | Code：`executeDelegationPlan()` 对匹配项 `Promise.all`。|
| A2A 通信、timeout、错误处理 | Code + A2A SDK。|
| Coordinator 直连 MCP 时选择 tool 和 arguments | LLM 选择；Code 解析、allow-list、执行工具。|
| Financial Specialist 的最终结构化综合 | LLM 尝试；失败时 Code 使用确定性 fallback。|
| Market/Technology Specialist 数据整理 | 主要是 Code。|
| 最终研究 UI 使用哪些 Catalog 组件及如何组合 | LLM，受 `SYSTEM_PROMPT` 和 Catalog 约束。|
| A2UI 是否能进入浏览器、如何渲染 | Code：验证器、MessageProcessor、Registry、React 组件。|

## Agent Card、Registry 与 A2A

Agent Card 类型来自 `@a2a-js/sdk`，不是项目自己定义的 interface。`createAgentCard()` 生成的 Card 包含：

- `name`、`description`、`version`
- `provider`
- `supportedInterfaces`：含 JSON-RPC 的 URL，即 A2A endpoint
- `capabilities`
- 输入/输出模式
- `skills`：每个 skill 有 `id`、`name`、`description`、`tags`、示例

关系如下：

```text
Agent Card = “这个 Agent 是谁、会什么、在哪里可以调用”
Agent Registry = “保存这些 Card，并按需要的 skill 找 Card”
A2A = “使用 Card 中的接口信息，以 HTTP/JSON-RPC 调用这个 Agent”
```

以“分析 NVIDIA 的估值”为例：

```text
Code：analyzeTaskRequirements() → valuation-analysis
Code：matchAgentsBySkills() → Financial Research Agent Card
Code：dispatchSpecialistTask(card, request) → HTTP JSON-RPC
Specialist：runFinancialSpecialist()
```

## MCP 与 Tool 的关系

```text
Agent Card：找哪个 Agent
A2A：怎么调用 Agent
MCP：Agent 怎么通过协议调用 Tool
Tool：最终执行数据查询/计算的具体后端函数
```

当前 Tool 清单为：

- `search_company`
- `get_company_profile`
- `get_financial_summary`

真正的执行点是 `executeResearchTool()`。工具数据是 `researchTools.ts` 中的 Demo 数据集。

## 核心函数导航（按运行链路）

> 文件名均可点击跳转；页面只显示短文件名，不显示目录路径。

| 核心函数 / 类 | 文件 | 重点 |
|---|---|
| `ChatInput.submit()` / `ChatPanel()` | [ChatInput.tsx](src/components/chat/ChatInput.tsx#L12) · [ChatPanel.tsx](src/components/chat/ChatPanel.tsx#L30) | 用户输入如何交给统一工作流；普通 React UI。|
| `sendMessage()` / `handleStreamEvent()` / `handleAction()` | [workspaceStore.ts](src/stores/workspaceStore.ts#L115) | 前端发送、接收流、状态变化与 action 回流。|
| `streamChat()` / `consumeNdjson()` / `streamAction()` | [agentService.ts](src/services/agentService.ts#L12) | `fetch`、NDJSON 行解析。|
| `chatRoutes()` / `beginNdjson()` | [chat.ts](server/routes/chat.ts#L16) | `/api/chat`、`/api/action` 和 NDJSON 写出。|
| `runResearchAgent()` / `runAutonomousResearch()` / `streamGeneratedMessages()` | [researchAgent.ts](server/agent/researchAgent.ts#L199) | Main Coordinator；唯一的最终 A2UI 输出编排入口。|
| `decideInteraction()` | [interactionPolicy.ts](server/interaction/interactionPolicy.ts#L35) | HITL 是否暂停的确定性规则。|
| `handleRegisteredAction()` / `missingInformationSurface()` | [actionRegistry.ts](server/interaction/actionRegistry.ts#L33) · [interactionUi.ts](server/interaction/interactionUi.ts#L34) | action allow-list、A2UI 表单、恢复任务。|
| `analyzeTaskRequirements()` / `createDelegationPlan()` / `executeDelegationPlan()` | [orchestrator.ts](server/orchestration/orchestrator.ts#L8) | 需求→skill→委派→聚合。|
| `TaskRequirement` / `SpecialistResult` / `AggregationContext` | [types.ts](server/orchestration/types.ts#L1) | 全链路输入输出契约。|
| `createFinancialAgentCard()` / `createMarketAgentCard()` / `createTechnologyAgentCard()` | [agentCard.ts](server/a2a/agentCard.ts#L27) | 实际 Agent Card、skills、endpoint。|
| `registerAgent()` / `matchAgentsBySkills()` | [agentRegistry.ts](server/registry/agentRegistry.ts#L6) | Card 保存与 skill 匹配。|
| `dispatchSpecialistTask()` | [client.ts](server/a2a/client.ts#L17) | A2A HTTP/JSON-RPC、timeout、artifact 解析。|
| `SpecialistAgentExecutor.execute()` / `registerSpecialistA2aRoutes()` | [server.ts](server/a2a/server.ts#L18) | Specialist Server 如何接收 task 与返回结果。|
| `runFinancialSpecialist()` | [financialAgent.ts](server/agent/financialAgent.ts#L139) | 最完整 Specialist：MCP、结构化结果、DeepSeek fallback。|
| `createResearchClient()` / `createResearchServer()` | [MCP client.ts](server/mcp/client.ts#L26) · [MCP server.ts](server/mcp/server.ts#L20) | MCP handshake、工具注册和调用。|
| `executeResearchTool()` | [researchTools.ts](server/mcp/tools/researchTools.ts#L343) | Tool allow-list、参数验证、Demo 数据与执行点。|
| `chatText()` / `chatWithTools()` | [deepseek.ts](server/llm/deepseek.ts#L176) | DeepSeek 调用、tool selection 与最终 A2UI 调用。|
| `COMPONENT_CATALOG` / `describeCatalog()` | [componentCatalog.ts](server/catalog/componentCatalog.ts#L32) | Component Catalog 的单一事实源。|
| `sanitizeMessage()` / `buildA2uiMessages()` | [a2uiSchema.ts](server/a2ui/a2uiSchema.ts#L43) · [a2uiGenerator.ts](server/a2ui/a2uiGenerator.ts#L213) | A2UI 验证、过滤、root/数据来源补全。|
| `ensureProcessor()` / `researchCatalog` / `A2UISurface()` | [a2uiEngine.ts](src/components/a2ui/a2uiEngine.ts#L24) · [catalog.tsx](src/components/a2ui/catalog.tsx#L713) · [A2UISurface.tsx](src/components/a2ui/A2UISurface.tsx#L12) | A2UI message 如何变成 React。|

## 三条学习链的实际行为

### Chain 1：分析 NVIDIA

按当前 `analyzeTaskRequirements()` 的实现，“分析 NVIDIA”属于没有显式维度的泛分析，因此会匹配 Financial、Market、Technology 三个 Specialist。

### Chain 2：比较 NVIDIA 和 AMD

普通“比较 NVIDIA 和 AMD”默认只匹配 Financial Agent。若目标是学习真实的多 Agent 对比，应使用“完整比较 NVIDIA 和 AMD”，或明确要求财务、市场和技术维度。

### Chain 3：帮我比较两家公司

由于请求中没有两个已识别公司名，`decideInteraction()` 会先生成带两个 `TextField` 和“继续”按钮的确定性 A2UI 表单。用户提交后，Action Registry 验证身份和公司名，再恢复原 task。

## 第一节：浏览器如何把一句话交给 Agent Workflow

### 位置

```text
用户输入
↓
【ChatInput → Zustand sendMessage】
↓
HTTP /api/chat
```

### 用人话解释

`ChatInput` 只收集文本，它不知道 Agent、A2UI、MCP 或 DeepSeek。真正的前端工作流入口是 `workspaceStore.sendMessage`：它清空上一轮 A2UI surface，写入用户消息和加载状态，再将文本交给 `streamChat()`。

### 对应文件与核心函数

- [ChatInput.tsx](src/components/chat/ChatInput.tsx#L12)：`submit()` 调用 `onSend(text)`。
- [ChatPanel.tsx](src/components/chat/ChatPanel.tsx#L56)：将 store 的 `sendMessage` 作为 `onSend` 传入输入框。
- [workspaceStore.ts](src/stores/workspaceStore.ts#L115)：`sendMessage(text)` 是真正入口。
- [agentService.ts](src/services/agentService.ts#L41)：`streamChat(message, onEvent)` 发起 HTTP 请求。

### 输入、处理、输出

```text
输入：text: string
示例："分析 NVIDIA"

处理：
  1. trim 并阻止空输入/重复提交
  2. clearSurfaces()
  3. Zustand 写入用户消息和 RUNNING 状态
  4. streamChat() 发 POST /api/chat

立即输出：React 显示用户消息与“正在分析”状态
异步输出：NDJSON AgentStreamEvent，随后更新状态、活动、A2UI message 或错误
```

关键代码概念：

```ts
clearSurfaces()
set({ isGenerating: true, taskStatus: 'RUNNING', ... })
await streamChat(trimmed, (event) => handleStreamEvent(get, set, event))
```

### 为什么需要这一层

它把普通 React 控件与长时间运行、可流式返回的 Agent 工作流隔离。输入框无需理解后端架构；后端也无需知道 React 组件实现。

### 与 Generative UI / A2UI / Agent Card 的关系

- Generative UI：此处尚未生成。`presentationMode` 只是本地展示密度提示，不参与 Agent 路由。
- A2UI：此处清理旧 surface，并为后续 A2UI event 建立接收通道。
- Agent Card：此处不参与；它在后端 Discovery 阶段才参与。

### 本节必须记住

1. `ChatInput` 是普通受控 React UI，不是 Generative UI。
2. `workspaceStore.sendMessage` 是浏览器侧真正的工作流入口。
3. Zustand 管理聊天、加载、活动等壳层状态。
4. A2UI 的 surface/data 状态主要在 `MessageProcessor`，不在 Zustand。
5. 前端发的是普通 JSON 请求，收的是 NDJSON 事件流。

### 自测问题

1. 为什么 `ChatInput` 不属于 Generative UI？
2. `sendMessage` 的立即输出与异步输出分别是什么？
3. 为什么 A2UI surface 状态不直接全部放进 Zustand？

## 第二节：NDJSON 流如何从后端进入 A2UI 管线

### 先复盘第一节答案

1. 正确。`ChatInput` 是开发者预先写好的普通 React 输入组件；它不决定动态 UI 的组件树，也不解析 A2UI。
2. 需要稍微精确：立即发生的是本地 Zustand `set(...)`，所以浏览器立刻显示用户消息、加载状态和空的结果区域；异步发生的是 `fetch('/api/chat')` 完成后，后端持续回传的 NDJSON 事件。不是“传到后端的是异步”，而是“请求发出后，响应以异步流抵达”。
3. 部分正确。更根本的原因是职责不同：Zustand 保存应用壳层状态（消息、加载、活动、错误、surface id）；`MessageProcessor` 保存 A2UI 专用的组件树、Surface 和 DataModel，并处理 A2UI 的数据绑定与 action。分开后，React 聊天应用不必重写 A2UI 协议运行时。

### 位置

```text
Zustand sendMessage
↓
【agentService.streamChat / consumeNdjson】
↓
handleStreamEvent
↓
Zustand 或 A2UI MessageProcessor
```

### 用人话解释

浏览器没有一次性等到“最终页面”。`/api/chat` 的 HTTP response body 是连续字节流；每一行都是一个 JSON object。`consumeNdjson()` 用 `ReadableStream` reader 读取字节、用 `TextDecoder` 还原文本、按换行符切出完整行、`JSON.parse` 成 `AgentStreamEvent`，然后交给 store。

这里有两个容易混淆的层：

```text
NDJSON 外层事件：{ type: 'message', message: <A2UI wire message> }
A2UI 内层消息：{ version: 'v0.9', createSurface / updateComponents / ... }
```

也就是说，NDJSON 是浏览器与 Fastify 之间的传输封装；A2UI 是其中某类 `message` event 携带的 UI 协议。

### 对应文件

- [agentService.ts](src/services/agentService.ts#L12)
  - `streamChat(message, onEvent)`：发出 `POST /api/chat`。
  - `consumeNdjson(res, onEvent)`：逐行读取并解析 response body。
- [workspaceStore.ts](src/stores/workspaceStore.ts#L29)
  - `handleStreamEvent(...)`：按 event 类型决定更新 Zustand，或调用 `processA2uiMessages([event.message])`。
- [chat.ts](server/routes/chat.ts#L16)
  - `beginNdjson()`：设置 `application/x-ndjson` 并以 `JSON.stringify(event) + '\\n'` 写出一行。

### 输入、处理、输出

```text
输入：Response.body 的 Uint8Array 数据块

处理：
  1. TextDecoder 解码
  2. buffer 累积不完整数据
  3. 找到 '\n'，切出一行
  4. JSON.parse → AgentStreamEvent
  5. onEvent(event)

输出：
  - status / activity / task_state：更新 Zustand
  - agent_text：追加聊天文字
  - message：交给 MessageProcessor，更新 A2UI Surface
  - done / error：结束加载或显示错误
```

### 谁调用它，它调用谁

```text
workspaceStore.sendMessage()
  → streamChat()
    → fetch('/api/chat')
    → consumeNdjson()
      → handleStreamEvent()
        → processA2uiMessages()（仅 message event）
```

### 为什么需要这一层

Coordinator、A2A 和 DeepSeek 都可能需要时间。NDJSON 让用户能先看到“正在分析”“已发现 Agent”“正在综合”等事件，而不必等整个任务完全结束。它也让 A2UI 可以在完成后以独立 message 事件送入 Renderer。

### 与 Generative UI / A2UI / Agent Card 的关系

- Generative UI：本层不决定生成什么；只负责把生成结果运输到浏览器。
- A2UI：`message` event 是 A2UI 从服务端进入 `MessageProcessor` 的唯一正常入口。
- Agent Card：本层不读取 Card，但 `activity` event 可以向用户展示由 Card Discovery 和 A2A 执行产生的过程信息。

### 本节必须记住

1. NDJSON 与 A2UI 不相同：前者是传输格式，后者是 UI 描述协议。
2. 一个 NDJSON 行对应一个 `AgentStreamEvent`，不一定是一个 A2UI message。
3. `buffer` 的存在是为了正确处理网络分块：一个 JSON 行可能被拆成多次 `reader.read()`。
4. 只有 `event.type === 'message'` 会进入 A2UI `MessageProcessor`。
5. 状态/活动文字走 Zustand；组件树/DataModel 走 A2UI runtime。

### 自测问题

1. 为什么不能假设一次 `reader.read()` 正好得到一整条 JSON？
2. `activity` event 和 `message` event 分别进入哪个状态系统？
3. 请用一句话区分 NDJSON 和 A2UI。

## 第三节：Fastify 路由如何把 HTTP 请求交给 Main Coordinator

### 先复盘第二节答案

1. 正确。`reader.read()` 返回网络字节块，可能只包含半条 JSON，也可能包含多条 JSON；必须通过 `buffer` 按换行符恢复完整记录。
2. `activity` event 进入 Zustand 的 `activities`；`message` event 进入 A2UI `MessageProcessor`，更新 Surface、组件树或 DataModel。
3. NDJSON 是承载多个事件的网络传输格式；A2UI 是其中 `message` event 携带的 UI 描述协议。

### 位置

```text
streamChat()
↓ POST /api/chat
【chatRoutes() / Fastify Route】
↓ runResearchAgent(message, emit)
Main Coordinator
```

### 用人话解释

Fastify Route 是浏览器与 Coordinator 的服务端边界。它不分析任务，不选择 Agent，也不生成 A2UI。它只做三件事：验证 HTTP body、建立 NDJSON response、把用户文本和 `emit` 回调交给 `runResearchAgent()`。

### 核心函数与文件

| 函数 | 文件 | 责任 |
|---|---|---|
| `chatRoutes()` | [chat.ts](server/routes/chat.ts#L51) | 注册 `/api/chat` 和 `/api/action` |
| `beginNdjson()` | [chat.ts](server/routes/chat.ts#L16) | 接管原始 HTTP response，并创建 `emit`/`finish` |
| `launch()` | [chat.ts](server/routes/chat.ts#L45) | 启动异步 Agent runner；无论成功失败都关闭流 |
| `runResearchAgent()` | [researchAgent.ts](server/agent/researchAgent.ts#L314) | Main Coordinator 的自然语言请求入口 |
| `runResearchAgentAction()` | [researchAgent.ts](server/agent/researchAgent.ts#L343) | A2UI action 的后端入口 |

### `/api/chat` 的输入

```json
{
  "message": "分析 NVIDIA"
}
```

Route 把未知 body 收窄为：

```ts
{ message?: unknown }
```

然后检查 `message` 是否为非空字符串。失败时立即返回 HTTP 400；成功时才创建 NDJSON stream。

### `/api/chat` 的处理与输出

```text
HTTP body
↓ 类型与空字符串校验
beginNdjson(reply)
↓ 得到 emit + finish
runResearchAgent(body.message, emit)
↓ Agent 通过 emit 产生事件
res.write(JSON.stringify(event) + "\n")
↓ runner settle
finish() → res.end()
```

Route 本身没有返回一个普通 JSON response。`reply.hijack()` 表示代码接管 Fastify 的底层 response，并自行写入和关闭它。

### 谁调用它，它调用谁

```text
浏览器 streamChat()
  → Fastify POST /api/chat handler
    → beginNdjson(reply)
    → runResearchAgent(message, emit)
      → emit(AgentEvent) 多次
    → finish()
```

### `launch()` 为什么存在

`runResearchAgent()` 是一个长时间运行的 `Promise<void>`。`launch()` 为它统一挂上：

```ts
promise
  .catch(...)
  .finally(finish)
```

因此无论 Agent 正常完成还是发生未捕获错误，HTTP response 都会最终执行 `res.end()`。否则浏览器的 `reader.read()` 会一直等待流结束。

### Code / Prompt / LLM 边界

- Code：HTTP 校验、创建 stream、事件序列化、启动 Coordinator、关闭连接。
- Prompt：本层没有 Prompt。
- LLM：本层没有模型推理。

Fastify Route 只是协议适配层，不能说“Fastify 分析了 NVIDIA”或“Route 选择了 Financial Agent”。

### 为什么需要这一层

它隔离了 HTTP 细节和 Agent 业务逻辑：Coordinator 只依赖 `userMessage` 与 `emit(event)`，无需知道 Fastify、response header 或网络 socket。将来即使换成 WebSocket 或任务队列，Coordinator 的核心入口仍可复用。

### 与 Generative UI / A2UI / Agent Card 的关系

- Generative UI：Route 不决定 UI 内容，只运输最终事件。
- A2UI：Route 不解析 A2UI；它把包含 A2UI message 的 `AgentEvent` 序列化为 NDJSON。
- Agent Card：Route 不读取 Card；进入 Coordinator 后才发生 skill 分析与 Registry 匹配。

### 本节必须记住

1. `/api/chat` 的输入只有 `{ message: string }`。
2. Fastify Route 是 HTTP 与 Coordinator 之间的适配层，不是 Agent 推理层。
3. `reply.hijack()` 让代码自行管理 NDJSON response。
4. `emit` 写一条事件，`finish` 关闭整个 HTTP stream。
5. `launch()` 保证 runner settle 后执行 `finish()`。
6. `/api/chat` 进入 `runResearchAgent()`；`/api/action` 进入 `runResearchAgentAction()`。

### 自测问题

1. `emit()` 和 `finish()` 的职责有什么区别？
2. 为什么 Fastify Route 不应该负责选择 Specialist Agent？
3. `/api/chat` 与 `/api/action` 分别进入哪个 Coordinator 函数？

## 第四节：两个 Coordinator 入口与 HITL 门卫

### 先复盘第三节答案

1. 正确。`emit()` 把一个事件写入仍然打开的 NDJSON stream；`finish()` 调用 `res.end()`，结束整个 HTTP response。
2. 正确。Fastify Route 只是 HTTP 适配层。真正的选择链是 `analyzeTaskRequirements()` 产生 skills，`createDelegationPlan()` 调用 Registry，最终由 `matchAgentsBySkills()` 匹配 Agent Card。
3. 正确。`/api/chat` 进入 `runResearchAgent()`；`/api/action` 进入 `runResearchAgentAction()`。

### 两个入口的核心区别

```text
runResearchAgent()
= 新的自然语言研究请求入口

runResearchAgentAction()
= 已渲染 A2UI 中的声明式 action 回流入口
```

它们的输入、第一道验证和可能结果都不同。

| 对比项 | `runResearchAgent()` | `runResearchAgentAction()` |
|---|---|---|
| 输入 | `userMessage: string` | `AgentActionPayload` |
| 来源 | Chat 输入框 | A2UI 组件点击/提交 |
| 第一阶段 | `decideInteraction(userMessage)` | `handleRegisteredAction(action)` |
| 主要问题 | 是否需要先询问用户 | action 是否允许、身份和 context 是否有效 |
| 可能暂停 | 创建新的 `PendingInteraction` | 修改、取消或恢复已有 interaction |
| 可能执行研究 | `runAutonomousResearch()` | resume 时调用 `runAutonomousResearch()`；semantic action 时调用下钻研究 |
| taskId | 通常创建新 taskId | HITL resume 时复用原 taskId |

### 位置

```text
POST /api/chat
↓
【runResearchAgent()】
↓
decideInteraction()
├─ 无需输入 → runAutonomousResearch()
└─ 需要输入 → PendingInteraction + A2UI Form + WAITING_FOR_USER

A2UI action
↓ POST /api/action
【runResearchAgentAction()】
↓
handleRegisteredAction()
├─ resume   → 恢复原 task
├─ modify   → 重新显示范围选择
├─ cancel   → CANCELLED
├─ semantic → 下钻研究
└─ legacy   → 兼容操作路径
```

### 对应文件与核心函数

| 函数 / 类型 | 文件 | 责任 |
|---|---|---|
| `runResearchAgent()` | [researchAgent.ts](server/agent/researchAgent.ts#L314) | 接收新的自然语言请求 |
| `runResearchAgentAction()` | [researchAgent.ts](server/agent/researchAgent.ts#L343) | 接收 A2UI action |
| `AgentActionPayload` | [researchAgent.ts](server/agent/researchAgent.ts#L35) | action 的服务端输入结构 |
| `decideInteraction()` | [interactionPolicy.ts](server/interaction/interactionPolicy.ts#L35) | 判断新请求是否需要 HITL |
| `handleRegisteredAction()` | [actionRegistry.ts](server/interaction/actionRegistry.ts#L33) | action allow-list、身份与 context 验证 |
| `createPendingInteraction()` | [interactionStore.ts](server/interaction/interactionStore.ts#L5) | 保存暂停任务 |
| `missingInformationSurface()` | [interactionUi.ts](server/interaction/interactionUi.ts#L34) | 生成缺失信息 A2UI 表单 |
| `runAutonomousResearch()` | [researchAgent.ts](server/agent/researchAgent.ts#L245) | 进入 skill、Registry、A2A/MCP 与 A2UI 主链 |

### `runResearchAgent()`：新请求入口

输入：

```ts
userMessage: string
emit: Emit
```

第一步不是直接选 Agent，而是：

```ts
const decision = decideInteraction(userMessage)
```

如果信息足够：

```ts
if (!decision.required) {
  await runAutonomousResearch(userMessage, emit)
  return
}
```

如果必须询问用户，代码会创建 `PendingInteraction`，生成确定性的 A2UI form，然后发出：

```text
task_state = WAITING_FOR_USER
```

此时不会继续执行 Specialist 研究。

### `decideInteraction()` 是代码，不是 LLM

当前规则通过正则判断：

- 比较请求少于两个公司：`missing_information`
- 比较目标具有实质歧义：`material_ambiguity`
- 用户明确要求选择或先看计划：`explicit_user_choice`
- Demo 操作需要确认：`approval_required`
- 其他情况：自动继续

因此“帮我比较两家公司”会暂停，不是 DeepSeek 临时决定提问，而是确定性后端策略命中了“比较目标不足”。

### `runResearchAgentAction()`：A2UI action 回流入口

输入不是自然语言，而是结构化对象：

```ts
{
  name: string
  surfaceId?: string
  sourceComponentId?: string
  context?: Record<string, unknown>
}
```

它首先调用：

```ts
registered = handleRegisteredAction(action)
```

这一步检查 action name 是否在 allow-list 中。对于 HITL action，还会验证：

```text
interactionId
taskId
surfaceId
```

必须与内存中的待处理任务一致，才能恢复。

### Action Registry 的五类结果

#### `resume`

用户补齐信息或批准计划后，调用：

```ts
runAutonomousResearch(
  registered.request,
  emit,
  registered.dimensions,
  originalTaskId,
)
```

这里复用原 taskId，所以是“恢复同一个任务”，不是悄悄创建一个无关的新聊天请求。

#### `modify`

重新生成研究范围选择 A2UI，并维持 `WAITING_FOR_USER`。

#### `cancel`

生成取消 surface，并把任务状态设为 `CANCELLED`。

#### `semantic`

例如用户点击营收、风险或公司。代码把 action context 转换为新的聚焦研究意图，经过 Coordinator、Registry、A2A/MCP，再追加一个下钻 A2UI surface。

#### `legacy`

兼容 `generate_report` 等旧 action；尝试通过模型/MCP生成新视图，失败时使用确定性 fallback。

### 两条路径在哪里汇合

```text
新聊天请求（无需 HITL）
      └─ runAutonomousResearch()

HITL action（resume）
      └─ runAutonomousResearch()
```

所以 `runAutonomousResearch()` 才是自然语言请求和 HITL 恢复请求共同进入 Agent 主链的汇合点。

### Code / Prompt / LLM 边界

- Code：HITL 判断、创建/验证 PendingInteraction、action allow-list、恢复/取消/修改分支。
- Prompt：到达研究执行或 legacy action 生成 UI 时才会出现；HITL 表单由代码确定性生成。
- LLM：不决定 action 是否被允许，也不能直接恢复任意 task。

### 为什么需要两个入口

自然语言消息和 UI action 的信任级别与语义不同。新消息需要判断任务能否开始；action 必须证明它来自有效 surface，并受 allow-list 和关联 ID 限制。若共用一个任意字符串入口，HITL 的身份关联和安全边界会变得模糊。

### 与 Generative UI / A2UI / Agent Card 的关系

- Generative UI：`runResearchAgentAction()` 让生成界面不仅可看，还能触发后续工作流。
- A2UI：HITL form 本身是代码确定性生成的 A2UI；button action 再通过 `/api/action` 返回后端。
- Agent Card：两个入口都不直接匹配 Card；真正进入 `runAutonomousResearch()` 后才分析 skills 并查询 Registry。

### 本节必须记住

1. `runResearchAgent()` 处理新的自然语言请求。
2. `runResearchAgentAction()` 处理来自 A2UI 的结构化 action。
3. 新请求先经过 `decideInteraction()`；action 先经过 `handleRegisteredAction()`。
4. HITL 是否发生由确定性代码决定。
5. HITL resume 会复用原 taskId，并重新进入 `runAutonomousResearch()`。
6. A2UI 组件不能直接选择 Agent。
7. action name、context 与 interaction identity 都是不可信输入，必须验证。

### 自测问题

1. 为什么“帮我比较两家公司”不会立即进入 Agent Discovery？
2. HITL 表单提交后，为什么要复用原来的 taskId？
3. `runResearchAgent()` 与 `runResearchAgentAction()` 最终在哪个函数汇合？

## 第五节：用户意图如何变成 Required Skills

### 先复盘第四节答案

1. 正确。请求缺少两个具体公司，确定性 HITL 策略会先要求用户补齐必要信息；这里更准确的是“补充缺失信息”，不只是笼统确认。
2. 需要修正。复用 taskId 的主要目的，是保持同一个暂停任务的连续性与关联性，让状态、interaction、日志和后续结果都属于原任务；它不是单纯为了下一次 A2UI action。
3. 正确。两条入口会在 `runAutonomousResearch()` 汇合。

### 位置

```text
runResearchAgent() 或 HITL resume
↓
【runAutonomousResearch()】
↓
analyzeTaskRequirements()
↓
TaskRequirement.requiredSkills
↓
createDelegationPlan()
```

### 用人话解释

`runAutonomousResearch()` 是主研究链的公共入口。它先把自然语言交给 `analyzeTaskRequirements()`，得到一个结构化 `TaskRequirement`。当前项目的技能分析不是 DeepSeek planning，而是 TypeScript 中的正则和条件判断。

### 核心函数与文件

| 函数 / 类型 | 文件 | 责任 |
|---|---|---|
| `runAutonomousResearch()` | [researchAgent.ts](server/agent/researchAgent.ts#L245) | 串起技能分析、Discovery、执行、聚合和 A2UI |
| `analyzeTaskRequirements()` | [orchestrator.ts](server/orchestration/orchestrator.ts#L8) | 从文本确定 required skills |
| `requirementForDimensions()` | [orchestrator.ts](server/orchestration/orchestrator.ts#L41) | 把 HITL 选择的维度转换为 skills |
| `TaskRequirement` | [types.ts](server/orchestration/types.ts#L7) | 技能分析的结构化输出类型 |
| `createDelegationPlan()` | [orchestrator.ts](server/orchestration/orchestrator.ts#L46) | 将 skills 交给 Registry 匹配 Agent Card |

### 输入与输出

输入：

```ts
request: string
```

输出：

```ts
interface TaskRequirement {
  requiredSkills: RequiredSkill[]
  canRunInParallel: boolean
  useCoordinatorMcp: boolean
}
```

三个字段分别表示：

- `requiredSkills`：后续 Registry 要寻找的能力 ID，不是 Agent 名称。
- `canRunInParallel`：需求包含多个 skill 的描述性标志。
- `useCoordinatorMcp`：没有 Specialist skill 时，Coordinator 是否走自己的 MCP tool loop。

需要注意：当前执行代码始终通过 `Promise.all()` 调用已匹配的 delegations，并没有读取 `canRunInParallel` 来切换串行/并行。因此该字段目前主要表达规划结果，并未真正控制执行策略。

### 三条真实路由

#### Direct A2UI

纯粹要求创建页面、且没有研究分析关键词：

```ts
{
  requiredSkills: [],
  canRunInParallel: false,
  useCoordinatorMcp: false
}
```

Coordinator 直接让 DeepSeek 编排 A2UI，不调用 Specialist 或 MCP。

#### Direct MCP

没有匹配到 Specialist 分析维度、但请求需要事实数据：

```ts
{
  requiredSkills: [],
  canRunInParallel: false,
  useCoordinatorMcp: true
}
```

Coordinator 使用 `chatWithTools()`；此时 DeepSeek 可以选择 tool 与 arguments，后端执行 MCP tool。

#### A2A Specialist

存在财务、市场或技术 skill：

```text
requiredSkills 非空
↓
createDelegationPlan()
↓
Agent Registry / Agent Card
↓
A2A
```

### Case 1：分析 NVIDIA

代码判断过程：

```text
包含“分析” → genericResearch = true
没有指定财务/市场/技术关键词 → hasDimension = false
genericResearch && !hasDimension → comprehensive = true
```

最终得到：

```ts
{
  requiredSkills: [
    'financial-analysis',
    'market-research',
    'technology-analysis'
  ],
  canRunInParallel: true,
  useCoordinatorMcp: false
}
```

所以当前真实代码会尝试发现三个 Specialist。

### Case 2：比较 NVIDIA 和 AMD

代码判断：

```text
comparison = true
没有市场关键词
没有技术关键词
financial = comparison && !technology && !market
```

得到：

```ts
{
  requiredSkills: [
    'financial-analysis',
    'company-comparison'
  ],
  canRunInParallel: true,
  useCoordinatorMcp: false
}
```

两个 skill 都在同一张 Financial Agent Card 上，因此最终通常只匹配一个 Financial Agent。`canRunInParallel: true` 不等于一定调用多个 Agent。

### Case 3：帮我比较两家公司

首次请求不会到达技能分析，因为 HITL 先暂停。用户提交 NVIDIA 与 AMD 后，`runResearchAgentAction()` 构造补齐目标的请求，再调用 `runAutonomousResearch()`；随后通常得到与 Case 2 相同的 Financial skills。

### HITL 选择维度时的特殊入口

如果用户在 A2UI 表单中选择：

```text
financial + technology
```

恢复时不会重新依赖关键词推断，而是调用：

```ts
requirementForDimensions(dimensions)
```

直接得到：

```ts
['financial-analysis', 'technology-analysis']
```

这保证用户明确选择的维度真正控制后续 Agent Discovery。

### 谁决定什么

#### Code

- `analyzeTaskRequirements()` 决定 required skills。
- `requirementForDimensions()` 转换用户选择的维度。
- `createDelegationPlan()` 发起 Registry 匹配。
- `Promise.all()` 决定匹配后的并行执行方式。

#### Prompt

本步骤没有 planning prompt。

#### LLM

DeepSeek 不决定 required skills，也不直接选择 Financial、Market 或 Technology Agent。它会在后面的 direct-MCP 路径选择工具，或在聚合完成后决定 A2UI 组件组合。

### 为什么不直接产生 Agent 名称

当前输出的是能力：

```text
valuation-analysis
market-research
technology-analysis
```

而不是：

```text
Financial Research Agent
Market Agent
Technology Agent
```

这样 Coordinator 描述“需要什么能力”，Registry 再根据 Agent Card 回答“谁能提供能力”。新增 Agent 时，规划层不必增加 `if (agentName)` 分支。

### 与 Generative UI / A2UI / Agent Card 的关系

- Generative UI：skill 决定能获得哪些研究数据，间接影响最终 UI，但不直接选择 `MetricCard` 或 `Chart`。
- A2UI：本层尚未生成 A2UI；A2UI 在 Specialist 结果聚合并交给 DeepSeek 后产生。
- Agent Card：下一步 Registry 会用 `requiredSkills` 对照每张 Card 的 `skills[].id`。

### 本节必须记住

1. `runAutonomousResearch()` 是新请求与 HITL resume 的公共主链。
2. required skills 由 TypeScript 规则决定，不是 LLM planning。
3. `requiredSkills` 保存能力 ID，不保存 Agent 名称。
4. “分析 NVIDIA”实际会要求财务、市场、技术三类能力。
5. “比较 NVIDIA 和 AMD”通常只匹配 Financial Agent。
6. 多个 skills 不一定意味着多个 Agent。
7. `canRunInParallel` 当前没有真正控制执行分支。
8. 用户明确选择研究维度时，`requirementForDimensions()` 会覆盖文本推断。

### 自测问题

1. “分析 NVIDIA”会产生哪三个 required skills？是谁决定的？
2. 为什么“比较 NVIDIA 和 AMD”有两个 skills，却通常只调用一个 Agent？
3. `canRunInParallel` 在当前代码中是否真正控制了并行执行？
