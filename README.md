> 🌐 **中文** | [English](./README.en.md)

# SkillBooster

**把你的专业经验，教给 AI。**

SkillBooster 是一款隐性知识显性化的桌面工具：你通过对话描述自己的专业经验，智能体把它结构化为可视化的**经验画布**（七巧板式知识积木），一键打包成可直接部署给大模型的 Skill 包。

## 它解决什么问题

专业领域的隐性经验（"怎么做的"、"怎么判的"、"踩过什么坑"）长期停留在个人头脑中，难以传承、复用和验证。传统知识管理工具只管"存"，不管"萃"——真正值钱的判断逻辑和决策规则从未被结构化表达。

## 核心特性

- 🗣️ **对话即萃取** — 萃取智能体通过多步工具调用边对话边搭积木，全程流式可见、随时可中断；回复 Markdown 渲染（含表格）
- 🧩 **七巧板画布** — 三类知识积木（流程·怎么做 / 规则·怎么判 / 洞察·怎么看）自由拖拽组装、连线、双击展开编辑、撤销重做；没有智能体也能纯手工搭建（概念/关系为企业级特性，数据模型已预留）
- 👻 **幽灵积木** — 诚实分界：你确认过的内容直接上画布；智能体归纳推断的内容以半透明虚线积木呈现，由你原地采纳、修改或拒绝
- 🎯 **缺口驱动追问** — 系统实时追踪三类知识覆盖度，智能体围绕缺失类别和待验证条目设计追问
- 🏷️ **证据分级** — 每条知识标注证据等级：制度级 / 已验证 / 样本级 / 探索性
- ⚖️ **A/B 验证** — 裸模型 vs 带 Skill 模型双流对比，从专业判断、操作性、边界意识、风险提示、幻觉劣化五个维度量化 Skill 的真实增益
- 📦 **一键打包** — 导出 ZIP（SKILL.md + experience-card.json + 参考文档），直接部署给大模型
- 🔒 **完全本地** — 数据存本地，LLM 通过你自己配置的 API 接入（OpenAI 兼容接口均可）

## 工作流

```
输入经验描述（可附文档）→ 场景引导（2~4 轮补全上下文，选项可多选/直接说）
  → 对话萃取（智能体边说边搭积木）→ 画布组装（拖拽 / 连线 / 采纳提议）
  → A/B 验证 → 打包导出
```

工作台顶栏可在 **场景定义 / 经验萃取 / 验证 / 导出部署** 四个阶段间随时切换，场景草稿自动保存恢复。

## 快速开始

### 环境要求

- Node.js ≥ 18
- Windows / macOS

### 安装与运行

```bash
npm install        # 安装依赖（含 better-sqlite3 原生模块编译）
npm run dev        # 开发模式启动
```

首次使用：进入 **设置 → LLM 配置**，添加你的 API Provider（baseUrl + API Key + 模型名）。支持 OpenAI、Azure 及任何 OpenAI 兼容端点；三个智能体（引导/萃取/验证）可在 **智能体配置** 中分别指定不同模型。界面与 AI 输出语言可在 **设置 → 通用** 切换（中文 / English）。

### 常用命令

```bash
npm run dev          # 开发服务器（热重载）
npm run build        # 生产构建
npm run package      # 构建 + 打包安装程序（NSIS / DMG）
npm run typecheck    # TypeScript 类型检查
npm run test         # 运行测试（vitest）
npm run test:watch   # 监听模式测试
```

## 技术架构

```
Electron 双进程 + AG-UI 事件流双通道

主进程（Node.js）                      渲染进程（React）
├── llm.ts        流式/工具调用/退避重试   ├── FlowCanvas    七巧板画布（React Flow）
├── agentLoop.ts  多步工具循环+JSON降级   ├── sceneStore    Zustand + CanvasOp + undo/redo
├── canvasTools   画布工具（agent的手）   ├── Conversation  流式对话 + 中断
├── extraction    萃取agent（缺口驱动）   └── Validate      A/B 双流 + 维度卡片
├── agents        引导/验证 agent
└── store         SQLite + Canvas JSON
        │                                      ▲
        ├── invoke + IpcResult 信封（请求-响应）──┤
        └── agent:event 推送（AG-UI 事件流）─────┘
```

| 选型 | 说明 |
|------|------|
| Electron + electron-vite | 桌面框架，三端统一构建 |
| React + TypeScript (strict) + Zustand | 渲染进程 |
| better-sqlite3 | 本地数据库（场景/文档/对话/配置） |
| [@xyflow/react](https://reactflow.dev) | 经验画布（节点/连线/小地图） |
| [@ag-ui/core](https://docs.ag-ui.com) | 智能体↔UI 事件流的标准事件类型 |

智能体能力要点：原生 function calling 优先，模型不支持时自动降级 JSON 协议；超时/5xx 自动退避重试，429 限流走专用长退避（适配"每分钟 N 次"型限速）；长对话自动摘要压缩；增量画布操作（不回吐整卡 JSON）。

## 项目结构

```
├── docs/
│   ├── 0.design/           # 产品与技术设计文档
│   └── 1.ui_design/        # UI 界面设计稿（drawio）
├── electron/main/          # 主进程：agent 循环、LLM 客户端、持久化、IPC
├── electron/preload/       # contextBridge 桥接层
├── src/
│   ├── contracts/          # 进程间共享类型（ipc-types / agent-events / card.schema）
│   ├── store/              # Zustand 状态（事件订阅 + CanvasOp + undo/redo）
│   ├── pages/              # Home / Guide / Workbench / Validate / Settings
│   └── components/         # FlowCanvas / Conversation / Markdown / ReferencePanel …
├── resources/              # 三个智能体的提示词（英文；对用户的输出语言运行时控制）
└── tests/                  # vitest（主进程 + 渲染进程）
```

详细设计见 [`docs/0.design/`](./docs/0.design/)：产品构想、功能设计、UI/UX、技术栈、系统架构、开发规范。

## Skill 包格式

导出的 ZIP 包含：

```
{场景名}-skill.zip
├── SKILL.md                # YAML frontmatter + 结构化知识 Markdown，可直接作为大模型 system prompt（画布连线以「关联」行内联）
├── experience-card.json    # 结构化经验卡（含证据等级、来源、画布布局）
└── references/             # 勾选打包的参考文档原件
```

## 数据存储

全部数据保存在本地用户目录（`%APPDATA%/SkillBooster` / `~/Library/Application Support/SkillBooster`）：

- `SkillBooster.db` — SQLite：场景、参考文档索引、对话记录、LLM/Agent 配置
- `canvas/{sceneId}.json` — 经验画布数据
- `references/{sceneId}/` — 参考文档副本

API Key 仅存于本地数据库，不写日志、UI 掩码显示；LLM 请求全部由主进程发起。

## License

AGPL-3.0
