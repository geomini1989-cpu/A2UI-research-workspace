# Conversation-native UI design

This phase keeps the conversation shell and extends it with semantic drill-down. Agent routing,
A2A, MCP, A2UI messages, streaming, tool calling, and the Phase 6 pause/resume workflow keep
their existing semantics.

## Principles

- **Conversation first:** generated UI belongs to an assistant response, not a parallel dashboard.
- **Extreme restraint:** hierarchy comes from type, spacing, alignment, and thin boundaries.
- **Adaptive density:** focused requests are compact; normal research is structured; comparisons and comprehensive research may become rich.
- **Container responsive:** components respond to their host width, with 400px as a supported first-class container.
- **Host theme first:** `.genui-root` aliases existing host variables; it does not create a competing theme.
- **Progressive disclosure:** process traces and large visualizations stay available without dominating the answer.
- **Progressive rendering:** keep the Agent progress surface visible, then reveal each validated final root block in dependency-safe paint steps.
- **Autonomy first:** HITL controls appear only when the Coordinator already determined input or approval is required.
- **Research continues from UI:** an intentional metric, risk, company, row, or chart-point click is a declarative semantic action, not a client-side detail mock.

## Presentation boundaries

The model selects semantic components and data. It cannot choose CSS classes, colors,
spacing, shadows, or arbitrary layout rules. The renderer constrains gaps, chart colors,
metric emphasis, table previews, drawer behavior, and responsive degradation.

The three widths are behavioral rather than device-specific:

- Small container: one-column metrics/actions, priority table columns, horizontal comparison fallback.
- Medium container: wrapped one/two-column groups and compact charts.
- Large container: limited metric grids and wider rich content, never full viewport width.

## Detail and accessibility

Tables over seven rows and charts over ten points use a compact preview plus a native
`dialog` drawer. Native dialog supplies focus trapping, Escape-to-close, and focus
restoration. Tables retain `table/thead/tbody/th` semantics. Charts expose an accessible
title and text summary. All actions have visible keyboard focus, mobile-sized touch targets,
and nonessential animation is disabled under `prefers-reduced-motion`.

## Drill-down boundaries

The renderer preserves the parent A2UI surface and appends each generated detail surface in the
same answer. It renders lightweight local loading/error states, a three-level trail, and
Collapse/Reopen/Back controls. Back and Reopen read the frontend's in-memory surface history;
they never invoke the Coordinator. Complex large-table/chart detail still uses the native drawer,
which becomes full-screen in a narrow host.

The model can choose only semantic targets and compact action context. It cannot emit callbacks,
CSS, layouts, or an agent name. The backend validates the allow-list and context, normalizes it
into a research intent, then allows the Main Coordinator to perform requirement analysis and Agent
Discovery again. This keeps natural-language follow-ups and UI clicks on one orchestration path.
