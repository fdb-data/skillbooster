import { create } from 'zustand'
import type { Scene, ExperienceCard, LLMConfig, LLMProviderConfig, HealthCheckResult, ProposalCard, ConversationMessage, AttachmentKind, KnowledgeKey, CanvasOp, CanvasPosition, ValidationResult, ValidationControl, SecurityCheckResult, SecurityFinding, RemediateResult } from '../contracts/ipc-types'
import { EventType } from '../contracts/agent-events'
import type { AgentEvent, AgentKey } from '../contracts/agent-events'
import { generateId } from '../utils/uuid'
import i18n from '../i18n'

type Page = 'home' | 'guide' | 'workbench' | 'validate' | 'settings'

export interface ValidationReportEntry { id: string; instruction: string; result: ValidationResult }
interface ValidationCaseInput { id: string; instruction: string }

interface LiveSceneDraft {
  name: string
  protagonist: string
  trigger: string
  includes: string[]
  excludes: string[]
  projectName: string
  done: boolean
}

interface SceneStore {
  scenes: Scene[]
  currentScene: Scene | null
  proposals: ProposalCard[]
  isLoading: boolean
  error: string | null
  llmConfig: LLMConfig | null
  llmProviders: LLMProviderConfig[]
  currentPage: Page
  highlightedEntries: string[]
  guideInput: string

  // agent 事件流（AG-UI）状态
  activeRunId: string | null
  activeAgent: AgentKey | null
  agentStatus: string | null
  streamingText: string | null
  liveSceneDraft: LiveSceneDraft | null

  // 安全检测独立面板状态（不进对话流）
  securityResult: SecurityCheckResult | null
  securityProgress: string
  securityPhase: 'idle' | 'running' | 'done' | 'error'
  securityRunId: string | null

  initAgentEvents: () => () => void
  initSecurityEvents: () => () => void
  abortRun: () => Promise<void>

  // 验证（A/B 对比）状态 —— 提到 store 以脱离 Validate 页生命周期，切页不丢
  valLoadedSceneId: string | null
  valCaseResults: Record<string, ValidationResult>
  valSingleEntry: ValidationReportEntry | null
  valControl: ValidationControl | null
  valBare: string
  valSkill: string
  valRunId: string | null
  valStreamsEnded: number
  valRunning: boolean
  valAnalyzing: boolean
  valRunningCaseId: string | null
  valRunAll: { done: number; total: number } | null

  valLoadResults: (sceneId: string) => Promise<void>
  valRunSingle: (sceneId: string, instruction: string) => Promise<void>
  valRunCase: (sceneId: string, caseId: string, instruction: string) => Promise<void>
  valRunAllCases: (sceneId: string, cases: ValidationCaseInput[]) => Promise<void>
  valDeleteCaseResult: (sceneId: string, caseId: string) => void
  valClearCaseResults: (sceneId: string) => void

  // 画布统一操作（用户编辑路径），带 undo/redo
  canUndo: boolean
  canRedo: boolean
  applyCanvasOp: (sceneId: string, op: CanvasOp) => void
  undoCanvas: (sceneId: string) => void
  redoCanvas: (sceneId: string) => void

  loadScenes: () => Promise<void>
  createScene: (name: string) => Promise<Scene | null>
  importSkill: (sourcePath: string) => Promise<Scene | null>
  selectScene: (id: string) => Promise<void>
  updateScene: (id: string, data: { name?: string; status?: string }) => Promise<void>
  deleteScene: (id: string) => Promise<void>

  addReference: (sceneId: string, filePath: string) => Promise<void>
  removeReference: (sceneId: string, refId: string) => Promise<void>
  setReferenceInclude: (sceneId: string, refId: string, include: boolean) => Promise<void>

  addAttachment: (sceneId: string, kind: AttachmentKind, filePath: string) => Promise<void>
  removeAttachment: (sceneId: string, kind: AttachmentKind, attId: string) => Promise<void>
  setAttachmentInclude: (sceneId: string, kind: AttachmentKind, attId: string, include: boolean) => Promise<void>
  openAttachment: (sceneId: string, attId: string) => Promise<void>

  runTurn: (sceneId: string, message: string) => Promise<void>
  draftFromDocs: (sceneId: string) => Promise<void>

  updateCanvas: (sceneId: string, canvasData: ExperienceCard) => Promise<void>
  applyProposal: (proposalId: string, position?: CanvasPosition, override?: { title: string; content: string }) => void
  rejectProposal: (proposalId: string) => void
  modifyProposal: (proposalId: string, content: string) => void

  healthCheck: (sceneId: string) => Promise<HealthCheckResult>
  buildPackage: (sceneId: string) => Promise<string>
  runSecurityCheck: (sceneId: string) => Promise<SecurityCheckResult | null>
  loadSecurityResult: (sceneId: string) => Promise<void>
  remediateFindings: (sceneId: string, findings: SecurityFinding[]) => Promise<RemediateResult | null>

  loadLLMConfig: () => Promise<void>
  saveLLMConfig: (config: LLMConfig) => Promise<void>
  loadLLMProviders: () => Promise<void>
  saveLLMProviders: (providers: LLMProviderConfig[]) => Promise<void>
  testConnection: (config: LLMConfig) => Promise<{ success: boolean; error?: string }>

  setCurrentPage: (page: Page) => void
  clearError: () => void
  setHighlightedEntries: (ids: string[]) => void
  setGuideInput: (input: string) => void
}

function handleIpc<T>(result: { success: boolean; data?: T; error?: { message: string } }): T {
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || i18n.t('common.operationFailed'))
  }
  return result.data
}

/** 纯函数：把一次画布操作应用到经验卡，返回新卡 */
export function applyOpToCard(card: ExperienceCard, op: CanvasOp): ExperienceCard {
  const layout = card.layout ?? { positions: {}, edges: [] }
  switch (op.kind) {
    case 'add': {
      const key = `${op.type}s` as KnowledgeKey
      const positions = op.position ? { ...layout.positions, [op.entry.id]: op.position } : layout.positions
      return {
        ...card,
        [key]: [...card[key], op.entry],
        layout: { ...layout, positions }
      }
    }
    case 'update': {
      const result = { ...card }
      for (const key of ['flows', 'rules', 'insights', 'concepts', 'relations'] as KnowledgeKey[]) {
        if (card[key].some(e => e.id === op.id)) {
          result[key] = card[key].map(e => e.id === op.id ? { ...e, ...op.patch, updatedAt: new Date().toISOString() } : e)
        }
      }
      return result
    }
    case 'delete': {
      const result = { ...card }
      for (const key of ['flows', 'rules', 'insights', 'concepts', 'relations'] as KnowledgeKey[]) {
        result[key] = card[key].filter(e => e.id !== op.id)
      }
      const positions = { ...layout.positions }
      delete positions[op.id]
      result.layout = {
        positions,
        edges: layout.edges.filter(e => e.source !== op.id && e.target !== op.id)
      }
      return result
    }
    case 'move':
      return { ...card, layout: { ...layout, positions: { ...layout.positions, [op.id]: op.position } } }
    case 'connect':
      if (layout.edges.some(e => (e.source === op.edge.source && e.target === op.edge.target) || e.id === op.edge.id)) return card
      return { ...card, layout: { ...layout, edges: [...layout.edges, op.edge] } }
    case 'disconnect':
      return { ...card, layout: { ...layout, edges: layout.edges.filter(e => e.id !== op.edgeId) } }
    case 'relayout':
      return { ...card, layout: { ...layout, positions: op.positions } }
  }
}

const UNDO_LIMIT = 50
let undoStack: ExperienceCard[] = []
let redoStack: ExperienceCard[] = []
let persistTimer: ReturnType<typeof setTimeout> | null = null

/** 防抖持久化画布（拖动等高频操作合并写盘） */
function schedulePersist(sceneId: string, canvas: ExperienceCard): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    window.api.canvas.update(sceneId, canvas)
  }, 300)
}

const TOOL_STATUS_KEYS: Record<string, string> = {
  canvas_add: 'status.addingEntry',
  canvas_update: 'status.updatingEntry',
  canvas_delete: 'status.deletingEntry',
  propose: 'status.generatingProposal',
  update_scene: 'status.updatingScene',
  ask_user: 'status.preparingQuestion'
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  scenes: [],
  currentScene: null,
  proposals: [],
  isLoading: false,
  error: null,
  llmConfig: null,
  llmProviders: [],
  currentPage: 'home',
  highlightedEntries: [],
  guideInput: '',

  activeRunId: null,
  activeAgent: null,
  agentStatus: null,
  streamingText: null,
  liveSceneDraft: null,

  securityResult: null,
  securityProgress: '',
  securityPhase: 'idle',
  securityRunId: null,

  valLoadedSceneId: null,
  valCaseResults: {},
  valSingleEntry: null,
  valControl: null,
  valBare: '',
  valSkill: '',
  valRunId: null,
  valStreamsEnded: 0,
  valRunning: false,
  valAnalyzing: false,
  valRunningCaseId: null,
  valRunAll: null,

  initAgentEvents: () => {
    return window.api.agent.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case EventType.RUN_STARTED:
          // validate 的 A/B 双流提到 store 持有（valBare/valSkill），不占用全局萃取/引导状态（否则切到萃取页会误显示"思考中"）
          set(event.agent === 'validate'
            ? { activeAgent: 'validate', valRunId: event.runId, valAnalyzing: false, valStreamsEnded: 0 }
            : { activeRunId: event.runId, activeAgent: event.agent, agentStatus: i18n.t('status.thinking'), streamingText: '' })
          break
        case EventType.TEXT_MESSAGE_START:
          // validate 的 A/B 双流写入 valBare/valSkill，不进全局 streamingText
          set(s => s.activeAgent === 'validate' ? s : ({
            agentStatus: null,
            streamingText: s.streamingText ? s.streamingText + '\n\n' : ''
          }))
          break
        case EventType.TEXT_MESSAGE_CONTENT:
          // messageId 为 bare/skill 的是验证 A/B 流，按 runId 归属写入对应栏
          if (event.messageId === 'bare' || event.messageId === 'skill') {
            set(s => s.valRunId !== event.runId ? s
              : event.messageId === 'bare'
                ? { valBare: s.valBare + event.delta }
                : { valSkill: s.valSkill + event.delta })
          } else {
            set(s => s.activeAgent === 'validate' ? s : ({ streamingText: (s.streamingText ?? '') + event.delta }))
          }
          break
        case EventType.TEXT_MESSAGE_END:
          // 验证两栏（bare+skill）都结束后，才进入裁判分析中
          if (event.messageId === 'bare' || event.messageId === 'skill') {
            set(s => {
              if (s.valRunId !== event.runId) return s
              const ended = s.valStreamsEnded + 1
              return ended >= 2 ? { valStreamsEnded: ended, valAnalyzing: true } : { valStreamsEnded: ended }
            })
          }
          break
        case EventType.TOOL_CALL_START:
          set({ agentStatus: TOOL_STATUS_KEYS[event.toolCallName] ? i18n.t(TOOL_STATUS_KEYS[event.toolCallName]) : i18n.t('status.runningTool', { tool: event.toolCallName }) })
          break
        case EventType.TOOL_CALL_END:
          set({ agentStatus: i18n.t('status.thinking') })
          break
        case EventType.CUSTOM: {
          if (event.name === 'canvas_update') {
            const update = event.value
            set(s => {
              if (!s.currentScene) return s
              const canvas = applyCanvasUpdates(s.currentScene.canvas, [update])
              const highlighted = update.action === 'add' || update.action === 'update'
                ? [...s.highlightedEntries, update.entry.id]
                : s.highlightedEntries
              return {
                currentScene: { ...s.currentScene, canvas },
                highlightedEntries: highlighted
              }
            })
            setTimeout(() => set(s => ({ highlightedEntries: s.highlightedEntries.filter(id => id !== update.entry.id) })), 3000)
          } else if (event.name === 'proposal') {
            const proposal = event.value
            set(s => s.proposals.some(p => p.id === proposal.id)
              ? s
              : { proposals: [...s.proposals, { id: proposal.id, proposal, status: 'pending' as const }] })
          } else if (event.name === 'scene_draft') {
            set({ liveSceneDraft: event.value })
          }
          break
        }
        case EventType.RUN_FINISHED:
        case EventType.RUN_ERROR:
          // validate run 结束只清自己的状态，不动萃取/引导的全局状态
          set(s => s.valRunId === event.runId
            ? { activeAgent: null, valRunId: null, valAnalyzing: false }
            : { activeRunId: null, activeAgent: null, agentStatus: null, streamingText: null })
          break
      }
    })
  },

  abortRun: async () => {
    const runId = get().activeRunId
    if (!runId) return
    try {
      await window.api.agent.abort(runId)
    } catch {
      // 中断失败不打扰用户
    }
  },

  initSecurityEvents: () => {
    return window.api.security.onProgress((data) => {
      set(s => ({
        securityProgress: data.delta ? s.securityProgress + data.delta : s.securityProgress,
        securityRunId: data.runId ?? s.securityRunId
      }))
    })
  },

  // ---------- 验证（A/B 对比） ----------
  valLoadResults: async (sceneId: string) => {
    // 同一场景只在首次加载，避免切回页面时用磁盘旧值覆盖正在进行/刚完成的内存结果
    if (get().valLoadedSceneId === sceneId) return
    set({
      valLoadedSceneId: sceneId,
      valCaseResults: {}, valSingleEntry: null, valControl: null,
      valBare: '', valSkill: '', valRunId: null, valStreamsEnded: 0,
      valRunning: false, valAnalyzing: false, valRunningCaseId: null, valRunAll: null
    })
    try {
      const r = await window.api.validation.getResults(sceneId)
      const data = handleIpc(r)
      const caseResults = data.caseResults ?? {}
      const singleEntry = (data.singleEntry as ValidationReportEntry | null) ?? null
      const control = singleEntry?.result.control ?? Object.values(caseResults)[0]?.control ?? null
      // 加载期间若已切换场景，丢弃本次结果
      if (get().valLoadedSceneId !== sceneId) return
      set({ valCaseResults: caseResults, valSingleEntry: singleEntry, valControl: control })
    } catch {
      // 无持久化结果或读取失败：保持空态
    }
  },

  valRunSingle: async (sceneId: string, instruction: string) => {
    set({ valRunning: true, valBare: '', valSkill: '' })
    try {
      const r = await window.api.validation.run(sceneId, instruction)
      const data = handleIpc(r)
      const entry: ValidationReportEntry = { id: 'single', instruction, result: data }
      set(s => {
        if (s.valLoadedSceneId !== sceneId) return s // 运行中已切换场景：不跨场景污染/误存
        window.api.validation.saveResults(sceneId, { caseResults: s.valCaseResults, singleEntry: entry })
        return { valSingleEntry: entry, valControl: data.control }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ valRunning: false, valAnalyzing: false })
    }
  },

  valRunCase: async (sceneId: string, caseId: string, instruction: string) => {
    set({ valRunningCaseId: caseId, valRunning: true, valBare: '', valSkill: '' })
    try {
      const r = await window.api.validation.runCase(sceneId, instruction)
      const data = handleIpc(r)
      set(s => {
        if (s.valLoadedSceneId !== sceneId) return s // 运行中已切换场景：不跨场景污染/误存
        const next = { ...s.valCaseResults, [caseId]: data }
        window.api.validation.saveResults(sceneId, { caseResults: next, singleEntry: s.valSingleEntry })
        return { valCaseResults: next, valControl: data.control }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ valRunningCaseId: null, valRunning: false, valAnalyzing: false })
    }
  },

  valRunAllCases: async (sceneId: string, cases: ValidationCaseInput[]) => {
    const valid = cases.filter(c => c.instruction.trim())
    if (valid.length === 0) return
    set({ valRunAll: { done: 0, total: valid.length }, valRunning: true })
    for (let i = 0; i < valid.length; i++) {
      const c = valid[i]
      set({ valRunningCaseId: c.id, valBare: '', valSkill: '' })
      try {
        const r = await window.api.validation.runCase(sceneId, c.instruction.trim())
        const data = handleIpc(r)
        set(s => {
          if (s.valLoadedSceneId !== sceneId) return s // 运行中已切换场景：不跨场景污染/误存
          const next = { ...s.valCaseResults, [c.id]: data }
          window.api.validation.saveResults(sceneId, { caseResults: next, singleEntry: s.valSingleEntry })
          return { valCaseResults: next, valControl: data.control }
        })
      } catch { /* 单条失败不阻断整集 */ }
      set({ valRunAll: { done: i + 1, total: valid.length } })
    }
    set({ valRunningCaseId: null, valRunAll: null, valRunning: false, valAnalyzing: false })
  },

  valDeleteCaseResult: (sceneId: string, caseId: string) => {
    set(s => {
      const next = { ...s.valCaseResults }
      delete next[caseId]
      window.api.validation.saveResults(sceneId, { caseResults: next, singleEntry: s.valSingleEntry })
      return { valCaseResults: next }
    })
  },

  valClearCaseResults: (sceneId: string) => {
    set(s => {
      window.api.validation.saveResults(sceneId, { caseResults: {}, singleEntry: s.valSingleEntry })
      return { valCaseResults: {} }
    })
  },

  canUndo: false,
  canRedo: false,

  applyCanvasOp: (sceneId: string, op: CanvasOp) => {
    const scene = get().currentScene
    if (!scene || scene.id !== sceneId) return
    undoStack.push(scene.canvas)
    if (undoStack.length > UNDO_LIMIT) undoStack.shift()
    redoStack = []
    const canvas = applyOpToCard(scene.canvas, op)
    set(s => ({
      currentScene: s.currentScene ? { ...s.currentScene, canvas } : s.currentScene,
      canUndo: true,
      canRedo: false
    }))
    schedulePersist(sceneId, canvas)
  },

  undoCanvas: (sceneId: string) => {
    const scene = get().currentScene
    if (!scene || scene.id !== sceneId || undoStack.length === 0) return
    const prev = undoStack.pop()!
    redoStack.push(scene.canvas)
    set(s => ({
      currentScene: s.currentScene ? { ...s.currentScene, canvas: prev } : s.currentScene,
      canUndo: undoStack.length > 0,
      canRedo: true
    }))
    schedulePersist(sceneId, prev)
  },

  redoCanvas: (sceneId: string) => {
    const scene = get().currentScene
    if (!scene || scene.id !== sceneId || redoStack.length === 0) return
    const next = redoStack.pop()!
    undoStack.push(scene.canvas)
    set(s => ({
      currentScene: s.currentScene ? { ...s.currentScene, canvas: next } : s.currentScene,
      canUndo: true,
      canRedo: redoStack.length > 0
    }))
    schedulePersist(sceneId, next)
  },

  loadScenes: async () => {
    try {
      const result = await window.api.scenes.list()
      const scenes = handleIpc(result)
      set({ scenes })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  createScene: async (name: string) => {
    try {
      const result = await window.api.scenes.create({ name })
      const scene = handleIpc(result)
      set(s => ({ scenes: [scene, ...s.scenes] }))
      return scene
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },

  importSkill: async (sourcePath: string) => {
    try {
      const result = await window.api.skill.import(sourcePath)
      const scene = handleIpc(result)
      undoStack = []
      redoStack = []
      set(s => ({
        scenes: [scene, ...s.scenes],
        currentScene: scene,
        proposals: [],
        highlightedEntries: [],
        canUndo: false,
        canRedo: false
      }))
      return scene
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },

  selectScene: async (id: string) => {
    try {
      const result = await window.api.scenes.get(id)
      const scene = handleIpc(result)
      undoStack = []
      redoStack = []
      set({ currentScene: scene, proposals: [], highlightedEntries: [], canUndo: false, canRedo: false, securityResult: null, securityPhase: 'idle', securityProgress: '', securityRunId: null })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  updateScene: async (id: string, data: { name?: string; status?: string }) => {
    try {
      const result = await window.api.scenes.update(id, data)
      const scene = handleIpc(result)
      set(s => ({
        scenes: s.scenes.map(sc => sc.id === id ? scene : sc),
        currentScene: s.currentScene?.id === id ? scene : s.currentScene
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  deleteScene: async (id: string) => {
    try {
      await window.api.scenes.delete(id)
      set(s => ({
        scenes: s.scenes.filter(sc => sc.id !== id),
        currentScene: s.currentScene?.id === id ? null : s.currentScene
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  addReference: async (sceneId: string, filePath: string) => {
    try {
      const result = await window.api.references.add(sceneId, filePath)
      const ref = handleIpc(result)
      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return s
        return {
          currentScene: {
            ...s.currentScene,
            references: [...s.currentScene.references, ref]
          }
        }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  removeReference: async (sceneId: string, refId: string) => {
    try {
      await window.api.references.remove(sceneId, refId)
      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return s
        return {
          currentScene: {
            ...s.currentScene,
            references: s.currentScene.references.filter(r => r.id !== refId)
          }
        }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  setReferenceInclude: async (sceneId: string, refId: string, include: boolean) => {
    try {
      await window.api.references.setInclude(sceneId, refId, include)
      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return s
        return {
          currentScene: {
            ...s.currentScene,
            references: s.currentScene.references.map(r =>
              r.id === refId ? { ...r, includeInPackage: include } : r
            )
          }
        }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  addAttachment: async (sceneId: string, kind: AttachmentKind, filePath: string) => {
    try {
      const result = await window.api.attachments.add(sceneId, kind, filePath)
      const att = handleIpc(result)
      const key = kind === 'script' ? 'scripts' : 'assets'
      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return s
        return { currentScene: { ...s.currentScene, [key]: [...s.currentScene[key], att] } }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  removeAttachment: async (sceneId: string, kind: AttachmentKind, attId: string) => {
    try {
      await window.api.attachments.remove(sceneId, attId)
      const key = kind === 'script' ? 'scripts' : 'assets'
      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return s
        return { currentScene: { ...s.currentScene, [key]: s.currentScene[key].filter(a => a.id !== attId) } }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  setAttachmentInclude: async (sceneId: string, kind: AttachmentKind, attId: string, include: boolean) => {
    try {
      await window.api.attachments.setInclude(sceneId, attId, include)
      const key = kind === 'script' ? 'scripts' : 'assets'
      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return s
        return {
          currentScene: {
            ...s.currentScene,
            [key]: s.currentScene[key].map(a => a.id === attId ? { ...a, includeInPackage: include } : a)
          }
        }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  openAttachment: async (sceneId: string, attId: string) => {
    try {
      const result = await window.api.attachments.open(sceneId, attId)
      handleIpc(result)
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  runTurn: async (sceneId: string, message: string) => {
    // 乐观渲染：用户消息立即上屏，随后才显示思考中/流式回复（否则要等整轮跑完才一起出现）
    const userMsg: ConversationMessage = {
      id: generateId(),
      sceneId,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString()
    }
    set(s => (s.currentScene && s.currentScene.id === sceneId)
      ? { isLoading: true, error: null, currentScene: { ...s.currentScene, conversation: [...s.currentScene.conversation, userMsg] } }
      : { isLoading: true, error: null })
    try {
      const result = await window.api.extraction.runTurn(sceneId, message)
      const data = handleIpc(result)

      const newHighlighted = data.canvasUpdates
        .filter(u => u.action === 'add')
        .map(u => u.entry.id)

      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return { isLoading: false }

        const canvas = applyCanvasUpdates(s.currentScene.canvas, data.canvasUpdates)
        const assistantMsg: ConversationMessage = {
          id: generateId(),
          sceneId,
          role: 'assistant',
          content: data.reply,
          createdAt: new Date().toISOString(),
          options: data.options,
          allowFreeText: data.allowFreeText
        }

        const proposals: ProposalCard[] = data.proposals
          .filter(p => !s.proposals.some(existing => existing.id === p.id))
          .map(p => ({
            id: p.id,
            proposal: p,
            status: 'pending' as const
          }))

        return {
          isLoading: false,
          currentScene: {
            ...s.currentScene,
            canvas,
            conversation: [...s.currentScene.conversation, assistantMsg]
          },
          proposals: [...s.proposals, ...proposals],
          highlightedEntries: [...s.highlightedEntries, ...newHighlighted]
        }
      })

      setTimeout(() => set({ highlightedEntries: [] }), 3000)
    } catch (err) {
      const msg = (err as Error).message
      set({ isLoading: false, error: msg === '已中断' ? null : msg })
    }
  },

  draftFromDocs: async (sceneId: string) => {
    // 乐观渲染：先上屏一条用户消息（从《xx》、《xx》文档萃取经验），再跑 agent
    const allRefs = get().currentScene?.references ?? []
    const checkedRefs = allRefs.filter(r => r.includeInPackage)
    const refs = checkedRefs.length > 0 ? checkedRefs : allRefs
    const docList = refs.map(r => `《${r.filename}》`).join('、')
    const userMsg: ConversationMessage = {
      id: generateId(),
      sceneId,
      role: 'user',
      content: i18n.t('reference.draftFromDocsMessage', { docs: docList }),
      createdAt: new Date().toISOString()
    }
    set(s => (s.currentScene && s.currentScene.id === sceneId)
      ? { isLoading: true, error: null, currentScene: { ...s.currentScene, conversation: [...s.currentScene.conversation, userMsg] } }
      : { isLoading: true, error: null })
    try {
      const result = await window.api.extraction.draftFromDocs(sceneId)
      const data = handleIpc(result)

      const newHighlighted = data.canvasUpdates
        .filter(u => u.action === 'add')
        .map(u => u.entry.id)

      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return { isLoading: false }

        const canvas = applyCanvasUpdates(s.currentScene.canvas, data.canvasUpdates)
        const assistantMsg: ConversationMessage = {
          id: generateId(),
          sceneId,
          role: 'assistant',
          content: data.openingMessage,
          createdAt: new Date().toISOString()
        }

        return {
          isLoading: false,
          currentScene: {
            ...s.currentScene,
            canvas,
            conversation: [...s.currentScene.conversation, assistantMsg]
          },
          highlightedEntries: [...s.highlightedEntries, ...newHighlighted]
        }
      })

      setTimeout(() => set({ highlightedEntries: [] }), 3000)
    } catch (err) {
      const msg = (err as Error).message
      set({ isLoading: false, error: msg === '已中断' ? null : msg })
    }
  },

  updateCanvas: async (sceneId: string, canvasData: ExperienceCard) => {
    try {
      await window.api.canvas.update(sceneId, canvasData)
      set(s => {
        if (!s.currentScene || s.currentScene.id !== sceneId) return s
        return { currentScene: { ...s.currentScene, canvas: canvasData } }
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  applyProposal: (proposalId: string, position?: CanvasPosition, override?: { title: string; content: string }) => {
    const state = get()
    const card = state.proposals.find(p => p.id === proposalId)
    if (!card || !state.currentScene) return

    const { proposal } = card
    const entry = {
      id: generateId(),
      title: override?.title ?? proposal.title,
      content: override?.content ?? proposal.content,
      verified: false,
      source: 'ai' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    get().applyCanvasOp(state.currentScene.id, { kind: 'add', type: proposal.type, entry, position })
    set(s => ({
      proposals: s.proposals.filter(p => p.id !== proposalId),
      highlightedEntries: [...s.highlightedEntries, entry.id]
    }))
    setTimeout(() => set(s => ({ highlightedEntries: s.highlightedEntries.filter(id => id !== entry.id) })), 3000)
  },

  rejectProposal: (proposalId: string) => {
    set(s => ({ proposals: s.proposals.filter(p => p.id !== proposalId) }))
  },

  modifyProposal: (proposalId: string, content: string) => {
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === proposalId
          ? { ...p, status: 'modifying' as const, proposal: { ...p.proposal, content } }
          : p
      )
    }))
  },

  healthCheck: async (sceneId: string) => {
    const result = await window.api.export.healthCheck(sceneId)
    return handleIpc(result)
  },

  buildPackage: async (sceneId: string) => {
    const result = await window.api.export.buildPackage(sceneId)
    const data = handleIpc(result)
    return data.filePath
  },

  runSecurityCheck: async (sceneId: string) => {
    set({ error: null, securityPhase: 'running', securityProgress: '', securityResult: null })
    try {
      const result = await window.api.export.securityCheck(sceneId)
      const data = handleIpc(result)
      set({ securityResult: data, securityPhase: 'done' })
      try { await window.api.security.saveResults(sceneId, data) } catch (e) { console.error('[security] save failed:', e) }
      return data
    } catch (err) {
      const msg = (err as Error).message
      set({ securityPhase: 'error', error: msg === '已中断' ? null : msg })
      return null
    }
  },

  loadSecurityResult: async (sceneId: string) => {
    try {
      const result = await window.api.security.getResults(sceneId)
      console.log('[security] load result:', sceneId, result)
      if (result.success && result.data) {
        set({ securityResult: result.data, securityPhase: 'done' })
      }
    } catch (e) { console.error('[security] load failed:', e) }
  },

  remediateFindings: async (sceneId: string, findings: SecurityFinding[]) => {
    set({ error: null, securityPhase: 'running', securityProgress: '' })
    try {
      const result = await window.api.extraction.remediateFindings(sceneId, findings)
      const data = handleIpc(result)
      for (const u of data.updates) {
        get().applyCanvasOp(sceneId, { kind: 'update', id: u.id, patch: { title: u.title, content: u.content } })
      }
      const remediatedIds = new Set(findings.filter(f => data.updates.some(u => u.id === f.location?.entryId)).map(f => f.id))
      set(s => {
        if (!s.securityResult) return { securityPhase: 'done' }
        const remaining = s.securityResult.findings.filter(f => !remediatedIds.has(f.id))
        const updated: SecurityCheckResult = {
          ...s.securityResult,
          findings: remaining,
          passed: !remaining.some(f => f.severity === 'critical' || f.severity === 'high')
        }
        return { securityPhase: 'done', securityResult: updated }
      })
      try { await window.api.security.saveResults(sceneId, get().securityResult!) } catch (e) { console.error('[security] save after remediate failed:', e) }
      return data
    } catch (err) {
      const msg = (err as Error).message
      set({ securityPhase: 'error', error: msg === '已中断' ? null : msg })
      return null
    }
  },

  loadLLMConfig: async () => {
    try {
      const result = await window.api.settings.getLLM()
      if (result.success) {
        set({ llmConfig: result.data ?? null })
      } else {
        set({ llmConfig: null })
      }
    } catch {
      set({ llmConfig: null })
    }
  },

  saveLLMConfig: async (config: LLMConfig) => {
    try {
      await window.api.settings.setLLM(config)
      set({ llmConfig: config })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  loadLLMProviders: async () => {
    try {
      const result = await window.api.settings.getLLMProviders()
      if (result.success) {
        set({ llmProviders: result.data ?? [] })
      } else {
        set({ llmProviders: [] })
      }
    } catch {
      set({ llmProviders: [] })
    }
  },

  saveLLMProviders: async (providers: LLMProviderConfig[]) => {
    try {
      const result = await window.api.settings.saveLLMProviders(providers)
      if (result.success) {
        set({ llmProviders: providers })
      }
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  testConnection: async (config: LLMConfig) => {
    try {
      const result = await window.api.settings.testConnection(config)
      const data = handleIpc(result)
      return { success: data.success, error: data.error }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  },

  setCurrentPage: (page: Page) => set({ currentPage: page }),
  clearError: () => set({ error: null }),
  setHighlightedEntries: (ids: string[]) => set({ highlightedEntries: ids }),
  setGuideInput: (input: string) => set({ guideInput: input })
}))

function applyCanvasUpdates(canvas: ExperienceCard, updates: import('../contracts/ipc-types').CanvasUpdate[]): ExperienceCard {
  const newCanvas = { ...canvas }
  for (const update of updates) {
    const typeKey = `${update.type}s` as KnowledgeKey
    switch (update.action) {
      case 'add':
        // 幂等：事件流可能已先行应用过同一条目
        newCanvas[typeKey] = newCanvas[typeKey].some(e => e.id === update.entry.id)
          ? newCanvas[typeKey].map(e => e.id === update.entry.id ? update.entry : e)
          : [...newCanvas[typeKey], update.entry]
        break
      case 'update':
        newCanvas[typeKey] = newCanvas[typeKey].map(e => e.id === update.entry.id ? update.entry : e)
        break
      case 'delete':
        newCanvas[typeKey] = newCanvas[typeKey].filter(e => e.id !== update.entry.id)
        break
    }
  }
  return newCanvas
}
