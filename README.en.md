> 🌐 [中文](./README.md) | **English**

# SkillBooster

**Teach your expertise to AI.**

SkillBooster is a desktop tool for making tacit knowledge explicit: you describe your professional experience through conversation, and the agent structures it into a visual **experience canvas** (tangram-style knowledge blocks), then packages it into a Skill bundle ready to deploy to an LLM with one click.

## The problem it solves

Tacit experience in professional domains ("how it's done", "how to judge", "what pitfalls to avoid") tends to stay locked in individual minds — hard to pass on, reuse, or validate. Traditional knowledge-management tools only "store", they don't "extract" — the truly valuable judgment logic and decision rules are never expressed in a structured form.

## Key features

- 🗣️ **Conversation is extraction** — the extraction agent builds blocks as it talks through multi-step tool calls, fully streamed and interruptible at any time; replies are Markdown-rendered (tables included)
- 🧩 **Tangram canvas** — three kinds of knowledge blocks (Flow · how to do / Rule · how to judge / Insight · how to read) can be freely dragged, connected, double-clicked to expand and edit, undone/redone; you can build it entirely by hand without the agent (concept/relation are enterprise-tier features, the data model is reserved)
- 👻 **Ghost blocks** — an honest divide: content you've confirmed goes straight onto the canvas; content the agent inferred appears as semi-transparent dashed blocks for you to accept, edit, or reject in place
- 🎯 **Gap-driven follow-ups** — the system tracks coverage of the three knowledge kinds in real time, and the agent designs follow-up questions around missing categories and unverified entries
- 🏷️ **Evidence grading** — every entry is tagged with an evidence level: institutional / validated / sample / exploratory
- ⚖️ **A/B validation** — bare model vs Skill-loaded model, side by side, quantifying the Skill's real gain across five dimensions: professional judgment, actionability, boundary awareness, risk warnings, hallucination & degradation
- 📦 **One-click packaging** — export a ZIP (SKILL.md + experience-card.json + reference documents), ready to deploy to an LLM
- 🔒 **Fully local** — data is stored locally; the LLM is accessed through an API you configure yourself (any OpenAI-compatible endpoint)

## Workflow

```
Enter an experience description (documents optional) → Scene setup (2-4 turns to fill in context, options support multi-select / free text)
  → Conversational extraction (the agent builds blocks as it talks) → Canvas assembly (drag / connect / accept proposals)
  → A/B validation → Package & export
```

The workbench top bar lets you switch any time between the four stages — **Scene definition / Extraction / Validation / Export & deploy** — and the scene draft is auto-saved and restored.

## Quick start

### Requirements

- Node.js ≥ 18
- Windows / macOS

### Install and run

```bash
npm install        # install dependencies (compiles the better-sqlite3 native module)
npm run dev        # start in development mode
```

First time: go to **Settings → LLM** and add your API provider (baseUrl + API key + model name). OpenAI, Azure, and any OpenAI-compatible endpoint are supported; the three agents (guide / extraction / validation) can each be assigned a different model under **Agents**. The interface and AI output language can be switched under **Settings → General** (English / 中文).

### Common commands

```bash
npm run dev          # dev server (hot reload)
npm run build        # production build
npm run package      # build + package installer (NSIS / DMG)
npm run typecheck    # TypeScript type check
npm run test         # run tests (vitest)
npm run test:watch   # tests in watch mode
```

## Architecture

```
Electron two-process + AG-UI event-stream dual channel

Main process (Node.js)                  Renderer (React)
├── llm.ts        streaming/tool calls/backoff   ├── FlowCanvas    tangram canvas (React Flow)
├── agentLoop.ts  multi-step tool loop + JSON fallback   ├── sceneStore    Zustand + CanvasOp + undo/redo
├── canvasTools   canvas tools (the agent's hands)   ├── Conversation  streaming chat + interrupt
├── extraction    extraction agent (gap-driven)   └── Validate      A/B dual stream + dimension cards
├── agents        guide / validation agents
└── store         SQLite + Canvas JSON
        │                                      ▲
        ├── invoke + IpcResult envelope (request-response)──┤
        └── agent:event push (AG-UI event stream)──────────┘
```

| Choice | Notes |
|------|------|
| Electron + electron-vite | desktop framework, unified build across platforms |
| React + TypeScript (strict) + Zustand | renderer |
| better-sqlite3 | local database (scenes/documents/conversations/config) |
| [@xyflow/react](https://reactflow.dev) | experience canvas (nodes/edges/minimap) |
| [@ag-ui/core](https://docs.ag-ui.com) | standard event types for the agent↔UI event stream |

Agent capability highlights: native function calling first, automatic fallback to a JSON protocol when the model doesn't support it; automatic backoff retry on timeout/5xx, a dedicated long backoff for 429 rate limits (suited to "N per minute" style limits); automatic summarization of long conversations; incremental canvas operations (no echoing back the whole card JSON).

## Project structure

```
├── docs/
│   ├── 0.design/           # product and technical design docs
│   └── 1.ui_design/        # UI design mockups (drawio)
├── electron/main/          # main process: agent loop, LLM client, persistence, IPC
├── electron/preload/       # contextBridge bridge layer
├── src/
│   ├── contracts/          # cross-process shared types (ipc-types / agent-events / card.schema)
│   ├── store/              # Zustand state (event subscription + CanvasOp + undo/redo)
│   ├── pages/              # Home / Guide / Workbench / Validate / Settings
│   └── components/         # FlowCanvas / Conversation / Markdown / ReferencePanel …
├── resources/              # prompts for the three agents (English; output language is controlled at runtime)
└── tests/                  # vitest (main process + renderer)
```

See [`docs/0.design/`](./docs/0.design/) for detailed design: product vision, feature design, UI/UX, tech stack, system architecture, development conventions.

## Skill package format

The exported ZIP contains:

```
{scene-name}-skill.zip
├── SKILL.md                # YAML frontmatter + structured-knowledge Markdown, usable directly as an LLM system prompt (canvas edges inlined as "Related" lines)
├── experience-card.json    # structured experience card (evidence levels, sources, canvas layout)
└── references/             # original reference documents selected for packaging
```

## Data storage

All data is saved in the local user directory (`%APPDATA%/SkillBooster` / `~/Library/Application Support/SkillBooster`):

- `SkillBooster.db` — SQLite: scenes, reference-document index, conversation history, LLM/Agent config
- `canvas/{sceneId}.json` — experience canvas data
- `references/{sceneId}/` — copies of reference documents

API keys are stored only in the local database, never written to logs, masked in the UI; all LLM requests are issued by the main process.

## License

AGPL-3.0
