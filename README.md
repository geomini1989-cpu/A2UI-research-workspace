# AI Research Workspace — Generative UI Demo

A runnable demo of a **conversation-native generative UI** research assistant. The
Main Research Agent picks from a **controlled Component Catalog** (not a fixed dashboard)
and composes a **live A2UI component tree** directly inside the assistant response.
When the task needs company facts, the Agent asks the backend to run a
**real MCP research tool** and pulls the result into the UI.

```
 User
  │  natural-language request
  ▼
 Research Coordinator ─┬─ simple UI ───────────────────────────────────┐
                       ├─ facts ──▶ MCP ──▶ Research Tools ───────────┤
                       └─ Requirement Analysis (skills only)          │
                                      └─ Agent Registry / Cards       │
                                         ├─ Financial Agent ─▶ MCP   │
                                         ├─ Market Agent ─────▶ MCP  │
                                         └─ Technology Agent ─▶ MCP  │
                                              └─ Structured Results ─┘
                                                   └─ Aggregation
  ▼
 Coordinator composes UI from the Component Catalog ──▶ A2UI v0.9 JSONL
  ▼
 A2UI Renderer ──▶ React components (Basic + Business)
```

Everything the Agent draws is built from a **single, allow-listed Component Catalog** the
server validates. The model can describe UI but **can never emit executable code**, and it
**never executes a tool itself** — the backend always runs the tool.

## Stack

- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind v4 + shadcn/ui + Zustand + Recharts
- **Renderer:** official [@a2ui/web_core](https://www.npmjs.com/package/@a2ui/web_core) +
  [@a2ui/react](https://www.npmjs.com/package/@a2ui/react) `v0.9` — the demo uses the real
  `MessageProcessor` / `SurfaceModel` / `Catalog` / `createComponentImplementation`
  machinery, but provides its **own** React catalog (Tailwind + shadcn) so the generated UI
  looks like a real research product.
- **Backend:** Fastify + [DeepSeek](https://platform.deepseek.com/) (OpenAI-compatible API) +
  official `@modelcontextprotocol/sdk` and official `@a2a-js/sdk` v1.x (A2A Protocol v1.0).
- **Streaming:** `application/x-ndjson` (one `AgentStreamEvent` per line) over `POST /api/chat`
  and `POST /api/action`, proxied by Vite `/api` → `http://localhost:3001`.

## Hybrid Agent streaming and progressive A2UI

Research renders before the slow work finishes. The Coordinator first emits a deterministic,
validated A2UI surface with stable component ids. Specialist `working` and MCP-tool activities then
flow over real A2A JSON-RPC/SSE streams and update their visible cards on that same surface. Each
Specialist result is written to the A2UI DataModel and rendered as soon as that Agent settles; the
other parallel Agents do not need to finish first. Finally, the Coordinator performs one coherent
LLM synthesis and replaces the progressive `root` in place without creating a second surface. The
validated final tree is revealed one top-level block at a time: each block's complete dependency
closure is sent first, then `root.children` expands during separate browser paint windows.

```text
createSurface + progress skeleton
  ├─ Financial A2A SSE ── working → tool → result ─┐
  ├─ Market A2A SSE ──── working → tool → result ──├─→ final synthesis → root update
  └─ Technology A2A SSE ─ working → tool → result ─┘
```

The final DeepSeek JSON completion remains atomic by design: untrusted model output is fully parsed
and validated before progressive rendering begins. This keeps true Agent/tool/result streaming and
visible component-by-component rendering while preserving the server-side A2UI safety boundary.

## Component Catalog

Two layers, both registered through one shared catalog so the prompt, the server allow-list
and the renderer can never drift apart:

- **Basic** — `Text, Card, Button, Badge, TextField, Select, ChoicePicker, List, Row, Column, Divider, Table, Chart`
- **Business** — `MetricCard, ComparisonCard, StockOverview, ResearchSummary, RiskBadge, InsightList`

**Single source of truth:** `server/catalog/componentCatalog.ts` holds each component's
`name / description / props / category`. The server derives its allow-list and the system
prompt from it; the client registry `src/components/a2ui/catalog.tsx` maps each name to a
React implementation (fail-fast if a catalog name has no renderer). The Agent only ever sees
the machine-readable **metadata** (name, description, prop types) — never JSX/React internals.

The Agent composes components **per task** — a risk-only request gets a small, focused
layout, not a full dashboard. Example compositions:

| Input | What the Agent draws |
|---|---|
| “分析 NVIDIA” | StockOverview, MetricCard(s), Chart, ResearchSummary, RiskBadge |
| “比较 NVIDIA 和 AMD” | **ComparisonCard**, MetricCard(s), Chart, Table, RiskBadge |
| “帮我做一个公司研究页面” | StockOverview, MetricCard, InsightList, ResearchSummary |
| “我只想看风险” | RiskBadge, InsightList, ResearchSummary |

Clicking a generated semantic target (for example **营收**, a risk, a segment, a chart period,
or a comparison row) uses the same `/api/action` stream to ask the Coordinator for focused
follow-up research. The original result stays visible and the new A2UI surface is appended in
the same assistant answer; Back/Collapse only switches in-memory surface history and never calls
an agent again.

> All market data is **Demo / Sample data** from the MCP Research tool. No real stock API,
> no database, no live feed is connected. The normal UI presents the internal Demo/MCP
> source as neutral **Demo research data** so it is never mistaken for live data.

## How to run

```bash
npm install

# 1. Provide your DeepSeek key (server-side only — never touches the browser).
cp .env.example .env
#    edit .env and set DEEPSEEK_API_KEY=sk-...

# 2. Start both the backend (3001) and frontend (5173).
npm run dev
```

Open http://localhost:5173 and chat.



## Research Composer: point-and-build Generative UI

The home screen now exposes a **Research Composer** demo designed to make A2UI behavior visible.
Instead of immediately producing a report, the user adds and removes research modules such as
Financial & Valuation, Market & Risk, and Technology & Product. Each click sends an A2UI Action and
the backend recomposes the **same surface** with `updateDataModel` + `updateComponents`.

Example:

```text
帮我打开 NVIDIA 研究组合器，我想自己逐项添加研究模块
```

Adding AMD switches the same surface into comparison mode. The execution preview changes with the
selected modules, and **Start research** reuses that same surface id for the existing progressive
Coordinator → Agent Card discovery → A2A → MCP → final A2UI pipeline. This keeps the interaction
fast before execution while making the Catalog-driven UI composition explicit.

## Persistent Research Job workflow

The workspace now includes one real write-oriented business flow in addition to read/analysis tasks:
**create → edit → save draft → submit → start research**.

Example:

```text
帮我创建一个 NVIDIA 深度研究任务，重点研究财务和技术，暂时不要执行
```

The Coordinator returns an A2UI form for company, dimensions, depth and extra instructions. **Save draft**
persists the job on the backend under `.data/research-jobs.json`; **Submit** moves the authoritative job
state from `DRAFT` to `SUBMITTED`. A repeated submit for the same job id is idempotent. **Start research**
then reuses the existing Coordinator → Agent Card discovery → A2A specialists → MCP → progressive A2UI
pipeline and records `RUNNING / COMPLETED / FAILED` on the job.

To demonstrate persistence after a browser refresh or server restart, use the id shown in the form:

```text
打开研究任务 RJ-20260907-XXXXXXXX
```

This is intentionally a small file-backed business service rather than a database/framework migration.
It proves the write-operation boundary and task lifecycle while keeping the research architecture unchanged.

## Human-in-the-loop

HITL is exception-based, not the default. The Coordinator applies an autonomy-first policy:

```text
                           User
                             │
                     Main Coordinator
                             │
                    Interaction Policy
                       /            \
                Auto Proceed      HITL Required
                      │                │
                      │           A2UI Interaction
                      │                │
                      └───────┬────────┘
                              ▼
                         Resume same task
                              │
                        Agent Registry
                   ┌──────────┼──────────┐
                   ▼          ▼          ▼
              Financial    Market   Technology
                   └──────────┼──────────┘
                              ▼
                          Synthesis
                              │
                             A2UI
```

If required information exists, a safe default is available, or ambiguity is minor, research
proceeds automatically. Interaction is allowed only for missing required information, material
ambiguity, an explicit user request to choose/review, or an approval-gated Demo operation.

Examples:

- `分析 NVIDIA` and `深入研究 NVIDIA` automatically run standard/deep multi-agent research.
- `帮我比较两家公司` pauses and generates an A2UI form for Company A and Company B.
- `让我选择分析 NVIDIA 的哪些维度` generates an A2UI `ChoicePicker`; the selected dimensions
  genuinely control Registry discovery and A2A execution.
- `先给我 NVIDIA 和 AMD 的完整比较计划，我确认后再执行` creates a plan surface. No Specialist
  runs before Start. Modify can remove dimensions; Cancel prevents all later execution.

Every pause creates an in-memory `PendingInteraction` correlated by `interactionId`, `taskId`, and
`surfaceId`. Text fields and choices use A2UI DataModel bindings. On click, the existing A2UI action
handler sends these identifiers and resolved values through `POST /api/action`; the backend checks
the centralized allow-list, validates identity and input, resolves the pending record, and resumes
the original task ID. Unknown action names and invalid dimensions/companies are rejected without
discarding the form.

Coordinator task states are `RUNNING`, `WAITING_FOR_USER`, `COMPLETED`, `FAILED`, and `CANCELLED`.
The frontend only displays “Waiting for your input” for a genuine paused interaction.

> Demo limitation: Human-in-the-loop pending task state is stored in memory. A server restart loses
> pending tasks. No database or workflow framework is used.


## A2UI message-level streaming

Final research UI is generated with DeepSeek streaming enabled. The server buffers token deltas only until a complete top-level A2UI JSON message closes, then immediately validates that message with the A2UI schema and component allow-list and forwards it through the existing NDJSON response stream.

The renderer therefore receives real generation-time updates instead of a fully generated page that is merely replayed afterward. The model is instructed to emit one complete A2UI message object per line and to grow the `root` container only with component ids that already exist. Cached/fallback payloads still use the existing atomic parser.

```text
DeepSeek SSE tokens
  -> complete A2UI message
  -> A2UI schema + catalog allow-list
  -> /api/chat NDJSON event
  -> MessageProcessor
  -> React surface update
```

## Conversation-native Generative UI

The demo shell models one reading flow: user message, short assistant transition,
generated result, and optional process disclosure. It no longer uses a split Chat +
Dashboard workspace.

| Task shape | Presentation |
|---|---|
| Simple / focused | `compact`: prose-first, one metric group, zero or one action |
| Standard research | `standard`: summary, adaptive metrics, compact chart, insights |
| Comparison / comprehensive | `rich`: wider (but bounded) research block with detail drawers |

- **Adaptive density:** a presentation-only hint selects compact, standard, or rich sizing; it never changes Coordinator routing.
- **Adaptive layout:** CSS container queries collapse ~400px hosts to one column, retain one/two-column groups at medium widths, and permit limited multi-column content in large hosts.
- **Host theme:** `.genui-root` tokens inherit the host font, colors, border, accent, and radius variables. The same components work in light and dark themes.
- **Progressive disclosure:** activity is summarized as Analyzing, Researching, Synthesizing, or complete. The full trace remains under **View process**.
- **Large content:** tables preview seven rows, complex charts use a compact preview, and full content opens in an accessible native-dialog drawer.
- **Stable streaming:** compact/standard/rich skeletons reserve result space and use restrained transitions with reduced-motion support.

See [`UI_DESIGN.md`](./UI_DESIGN.md) for the presentation rules and implementation boundaries.

## Interactive drill-down

The semantic Action vocabulary lives in `server/interaction/semanticActions.ts` and is enforced
by the existing centralized `server/interaction/actionRegistry.ts` allow-list. Context is treated
as untrusted input: only constrained strings such as `company`, `metric`, `period`, `segment`, and
`risk` are accepted; unknown keys never reach an LLM prompt.

`ResearchSession` is in-memory and records the root task, generated surfaces, drill depth/path,
and raw result cache. A semantic click becomes a structured Chinese research intent, then goes
through the same Main Coordinator requirement analysis, Agent Discovery, A2A/MCP path, and A2UI
generation as a typed chat request. Components do not select agents. The coordinator can therefore
narrow revenue/risk work to financial research while a segment may require both financial and
technology skills.

- `MetricCard`, `StockOverview`, and `RiskBadge` accept optional semantic `action`.
- `Table` and `ComparisonCard` accept `rowAction`, merging the clicked row into validated context.
- `Chart.interaction.pointAction` / `barAction` merges the clicked `xKey` as `period`.
- A drill is capped at three levels. Duplicate clicks are locked while one action is streaming;
  collapsed surfaces remain in memory and reopen without another request.
- Errors remain local to the drill region, so the overview is never discarded. Drawers continue to
  adapt to full-screen on small containers.

Each Specialist has an independent A2A v1 Agent Card and JSON-RPC interface:

| Specialist | Agent Card | A2A endpoint |
|---|---|---|
| Financial Research | `/.well-known/agent-card.json` | `/a2a/financial` |
| Market & News Research | `/agents/market/.well-known/agent-card.json` | `/a2a/market` |
| Technology & Product Research | `/agents/technology/.well-known/agent-card.json` | `/a2a/technology` |

All paths use `http://127.0.0.1:3001` by default. The Coordinator never imports or calls a
Specialist implementation directly. It analyzes required skills, matches Agent Cards in the
Registry, then uses the official A2A client to send independent HTTP tasks in parallel. Set
`MARKET_AGENT_BASE_URL=http://127.0.0.1:3999` to demonstrate partial failure: Financial and
Technology still complete, Market is marked unavailable, and synthesis continues.

Protocol boundaries:

- **Agent Card** describes an agent's capabilities and skills.
- **Agent Registry** maintains available cards and scores exact skill, tag, and description matches.
- **Discovery** maps task requirements to Agent Cards without naming agents in the planning step.
- **A2A** is agent-to-agent communication over HTTP/JSON-RPC.
- **MCP** connects either agent to tools/data.
- **A2UI** is the Coordinator's single UI output channel.
- **Component Catalog** is the allow-listed UI vocabulary available to the Coordinator.

## Safety boundary

Every object the model produces is validated server-side:
`server/a2ui/a2uiSchema.ts` uses the official `A2uiMessageSchema`, then enforces the
allow-list derived from the Component Catalog. An unknown component (`UnknownComponent`) is
**rejected/dropped**, and a business component with missing props **degrades gracefully** to
a placeholder instead of crashing the surface. The model only ever emits **structured JSON**
— there is **no** `eval`, `new Function`, or `dangerouslySetInnerHTML` anywhere. The API key
lives only in `server/config.ts` and is never sent to the browser. Tools are executed by the
backend through the MCP client (allow-list enforced), never by the LLM.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run backend + frontend together |
| `npm run dev:client` | Vite only |
| `npm run dev:server` | Fastify only (`tsx watch`) |
| `npm run typecheck` | Type-check app / server / node configs |
| `npm run test` | Vitest (renderer, generator, MCP, catalog) |
| `npm run build` | `tsc -b` + `vite build` |

## Project layout

```
src/
  components/a2ui/
    catalog.tsx            # Component Registry: catalog name -> React impl (+ researchCatalog)
    businessComponents.tsx # 6 business components (data-driven, defensive)
    a2uiEngine.ts          # MessageProcessor singleton wrapper
    A2UISurface.tsx        # <A2uiSurface> bound to the active surface id
    A2UIRenderer.tsx       # embedded loading / error states + surface
    DetailDrawer.tsx       # accessible adaptive chart/table detail drawer
    presentation.ts        # presentation-only compact/standard/rich rules
  components/chat/         # ChatInput, MessageList, ChatPanel
  components/ui/           # shadcn/ui primitives
  components/workspace/    # conversation host shell + theme control
  services/agentService.ts # NDJSON stream consumer
  stores/workspaceStore.ts # Zustand store (sendMessage / handleAction)
server/
  agent/
    researchAgent.ts       # Coordinator routing + MCP/A2A + sole A2UI generation
    financialAgent.ts      # MCP-backed specialist returning validated structured data
    marketAgent.ts         # Market/news specialist returning unified Demo research data
    technologyAgent.ts     # Technology/product specialist returning unified Demo research data
    systemPrompt.ts        # rules + the live Component Catalog block
  catalog/
    componentCatalog.ts    # SINGLE source of truth: names/desc/props/category + describeCatalog()
  a2ui/
    a2uiSchema.ts          # server-side validation + allow-list (derived from catalog)
    a2uiGenerator.ts       # extract/parse/normalize → canonical A2UI stream (+ data-source block)
    progressiveA2ui.ts     # deterministic skeleton + live Agent/result/DataModel updates
  mcp/
    tools/researchTools.ts # mock dataset, tool handlers, allow-list, DeepSeek function defs
    server.ts              # createResearchServer() via McpServer
    client.ts              # createResearchClient() via InMemoryTransport
  llm/deepseek.ts          # chatComplete + chatWithTools (tool-calling)
  routes/chat.ts           # POST /api/chat + /api/action (NDJSON streaming)
  a2a/
    agentCard.ts           # A2A v1 Agent Card and well-known/interface paths
    client.ts              # official SDK discovery, timeout, sendMessageStream, artifact parsing
    server.ts              # official SDK task lifecycle + Fastify JSON-RPC/SSE adapter
  orchestration/
    types.ts               # requirement/match/plan/result/aggregation/activity contracts
    orchestrator.ts        # deterministic planning, dynamic selection, parallel calls, aggregation
  registry/agentRegistry.ts # in-memory cards and scored deterministic skill matching
  interaction/
    interactionPolicy.ts    # deterministic autonomy-first rules and over-asking prevention
    interactionStore.ts     # in-memory correlated pending tasks
    interactionUi.ts        # deterministic A2UI forms, plan, approval and cancellation surfaces
    actionRegistry.ts       # centralized action allow-list and known handlers
    validation.ts           # company, dimension, identity and form validation
    types.ts                # decision, pending interaction and coordinator task states
  protocols/a2a.ts         # compatibility exports for the live A2A implementation
  protocols/mcp.ts         # extension boundary (legacy stub)
  index.ts                 # Fastify bootstrap
```

## Dynamic multi-agent orchestration

- “帮我创建一个公司研究页面” → Coordinator directly generates A2UI.
- “查一下 NVIDIA 的基础信息” → Coordinator uses MCP and generates A2UI.
- “分析 NVIDIA 的估值和财务风险” → Financial Agent.
- “总结 NVIDIA 最近的市场变化和竞争动态” → Market Agent.
- “分析 NVIDIA 的产品和技术竞争力” → Technology Agent.
- “分析 NVIDIA 的财务表现和技术竞争力” → Financial + Technology in parallel.
- “全面分析 NVIDIA，包含财务、市场和技术” → all three Specialists in parallel.

`analyzeTaskRequirements()` returns only `requiredSkills`, `canRunInParallel`, and the direct-MCP
fallback flag. `createDelegationPlan()` resolves those skills against the Registry's Agent Cards.
Independent A2A requests start together. Their activity events and settled results are forwarded
immediately, and each failure is captured as data rather than rejecting the whole request.
`aggregateSpecialistResults()` builds one typed context with financial, market, and technology
dimensions plus unavailable/unmatched capabilities. The Coordinator then performs final synthesis
and remains the only component allowed to emit A2UI.

The NDJSON stream includes execution-derived `activity` events. The normal UI reduces these to
plain-language progress and keeps the detailed trace behind **View process**. Server logs retain
the protocol-level discovery and A2A evidence for developer inspection. No timer-based statuses
or hard-coded React analysis sections are used.
- **Database** — no persistence yet; state lives in the client store.
- **Real data feed** — swap the mock handlers in `server/mcp/tools/researchTools.ts` for a real
  one (it already carries the `Demo` label). The catalog and renderer stay unchanged.

## Demo data caveat

All company figures are fictional-but-plausible values served by the MCP Research tool. The
system prompt forbids the model from claiming a live API, and the UI labels demo content
as **Demo Data** / **Demo research data**. The architecture
(DataModel + GenericBinder + MCP client) is ready to swap Demo values for live data without
changing the catalog.
