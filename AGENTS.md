# Repository coding conventions / 仓库编码约定

## Bilingual code comments / 中英双语代码注释

- 所有新增或修改的代码注释必须同时包含简体中文和英文；优先“中文在前，英文在后”。
- Every new or modified code comment must include both Simplified Chinese and English; prefer Chinese first, English second.
- 单行注释推荐格式：`// 中文说明。 / English explanation.`
- Preferred single-line format: `// 中文说明。 / English explanation.`
- 多行注释与 JSDoc 应在同一注释块中同时提供中文与英文含义，不要求逐句机械直译，但两种语言必须表达相同技术意图。
- Multi-line comments and JSDoc should carry the same technical intent in both languages; literal sentence-by-sentence translation is not required.
- 修改包含历史单语注释的代码区域时，应顺手将相关注释改为双语，避免继续扩大单语注释范围。
- When editing code near an existing monolingual comment, convert the relevant comment to bilingual form instead of expanding monolingual comments.
