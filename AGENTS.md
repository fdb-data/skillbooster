# AGENTS.md

SkillBooster — Electron 桌面应用，做"经验萃取"：用户对话描述专业经验，系统结构化为可复用 Skill 包。
主语言中文。技术栈：Electron + electron-vite + React + TypeScript(strict) + Zustand + better-sqlite3 + Tailwind v4 + @xyflow/react。

更详细的项目约定见 `CLAUDE.md`（所有者 jetfang@sina.com 的产品规范，优先级高于本文件）。

## 命令

```bash
npm run dev          # electron-vite dev（热重载）
npm run build        # electron-vite build
npm run package      # build + electron-builder（NSIS/DMG）
npm run lint         # eslint . --ext .ts,.tsx
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run test:watch   # vitest
```

改完代码按 `lint -> typecheck -> test` 顺序验证，全过才算完成。

跑单个测试文件：`npx vitest run tests/main/store.test.ts`
按名过滤：`npx vitest run -t "用例名"`

环境：Node ≥ 18，Windows / macOS。`npm install` 会编译 better-sqlite3 原生模块；`postinstall` 还会装 electron 并清理 electron-vite 内嵌的 esbuild 副本——别手动删 postinstall。

## 架构（不直观的部分）

electron-vite 三进程构建，入口在 `electron.vite.config.ts`：
- `electron/main/index.ts` — 主进程（Node.js）：agent 循环、LLM 客户端、SQLite、IPC handler
- `electron/preload/index.ts` — contextBridge，暴露 `window.api`
- `src/` — 渲染进程（React），`index.html` 为入口

路径别名 `@/` → `src/`（vitest 和 vite renderer 都配了）。

数据存储分两处，别搞混：
- **SQLite** (`SkillBooster.db` 在 userData 目录)：scenes、references、conversations、LLM/Agent 配置
- **JSON 文件** (`canvas/{sceneId}.json`)：ExperienceCard 画布数据。不进 SQLite。

`resources/` 是三个智能体的提示词（guide/extraction/validate），运行时由主进程读取。

## 必须遵守的约定（违反会出 bug）

1. **IPC 信封**：所有 handler 用 `errorHandler.ts` 的 `wrapHandler()` 包，返回 `IpcResult<T>`（`{success,data}` / `{success,error}`）。渲染进程通过 `handleIpc()` 解包。别直接 throw。
2. **新增 IPC channel 要改三处**：`electron/main/ipcHandlers.ts` 注册 → `electron/preload/index.ts` 暴露 → `src/global.d.ts` 加类型。漏一处渲染进程类型不通过。
3. **LLM 响应解析**：用 `parseLLMResponse` 解 JSON（兼容 markdown code fence）。别手写 JSON.parse。
4. **渲染进程禁止直接用 Node API**：必须走 preload contextBridge。
5. **不要换技术栈**：better-sqlite3 编译失败就排查根因（重装/重编译），不许换 sql.js。LLM API 超时/429 就重试，别换方案——内置 1.1s 速率限制是有意的。

## 测试

- vitest，jsdom 环境，globals 开启，超时 15s
- `tests/setup.ts` 全局 mock 了 `electron`、`better-sqlite3`、`fs`、`path`、`pdf-parse`、`mammoth`、`electron-log`、`window.api`。还补了 jsdom 缺的 `matchMedia`/`ResizeObserver`/`scrollIntoView`，并 import `src/i18n` 初始化
- 分 `tests/main/`（主进程逻辑）和 `tests/renderer/`（React 组件，用 @testing-library）
- 写渲染进程测试时直接用 setup 里 mock 好的 `window.api`，别重新 mock 整套

## 风格

- TypeScript strict 全局开
- 不加注释除非被要求
- 只改任务相关代码：不重构、不重命名、不格式化无关文件
- 提交信息中文，带版本号前缀（见 git log：`v0.1.2: ...`）
