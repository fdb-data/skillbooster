import type {
  Scene, Reference, Attachment, AttachmentKind, ConversationMessage, ExperienceCard,
  LLMConfig, LLMProviderConfig, HealthCheckResult, RunTurnResult, DraftResult,
  Proposal, ProposalCard, KnowledgeType, KnowledgeEntry,
  CanvasUpdate, AppError, IpcResult,
  ValidationResult, ValidationVerdict, DimensionVerdict, VerdictResult, OverallVerdict, TokenUsage,
  TestCase, EvalCaseExport, EvalExportPayload, ValidationResultsBundle, GuideMessageRecord
} from './contracts/ipc-types'
import type { AgentEvent } from './contracts/agent-events'

interface GuideResult {
  reply: string
  options: string[]
  optionsMultiSelect: boolean
  allowFreeText: boolean
  sceneDraft: { name: string; protagonist: string; trigger: string; includes: string[]; excludes: string[] }
  projectName: string
  done: boolean
}

interface GuideDraft {
  name: string
  protagonist: string
  trigger: string
  includes: string[]
  excludes: string[]
  projectName: string
  done: boolean
}

interface AgentConfig {
  agentKey: string
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
}

interface ElectronApi {
  agent: {
    onEvent: (callback: (event: AgentEvent) => void) => () => void
    abort: (runId: string) => Promise<IpcResult<{ aborted: boolean }>>
  }
  scenes: {
    list: () => Promise<IpcResult<Scene[]>>
    get: (id: string) => Promise<IpcResult<Scene>>
    create: (data: { name: string }) => Promise<IpcResult<Scene>>
    update: (id: string, data: { name?: string; status?: string }) => Promise<IpcResult<Scene>>
    delete: (id: string) => Promise<IpcResult<{ success: boolean }>>
  }
  references: {
    add: (sceneId: string, filePath: string) => Promise<IpcResult<Reference>>
    remove: (sceneId: string, refId: string) => Promise<IpcResult<{ success: boolean }>>
    list: (sceneId: string) => Promise<IpcResult<Reference[]>>
    setInclude: (sceneId: string, refId: string, include: boolean) => Promise<IpcResult<{ success: boolean }>>
  }
  attachments: {
    add: (sceneId: string, kind: AttachmentKind, filePath: string) => Promise<IpcResult<Attachment>>
    remove: (sceneId: string, attId: string) => Promise<IpcResult<{ success: boolean }>>
    list: (sceneId: string, kind: AttachmentKind) => Promise<IpcResult<Attachment[]>>
    setInclude: (sceneId: string, attId: string, include: boolean) => Promise<IpcResult<{ success: boolean }>>
    open: (sceneId: string, attId: string) => Promise<IpcResult<{ success: boolean }>>
  }
  skill: {
    pickImportPath: (mode: 'file' | 'folder') => Promise<IpcResult<{ path: string | null }>>
    import: (sourcePath: string) => Promise<IpcResult<Scene>>
  }
  guide: {
    runTurn: (sceneId: string, userInput: string) => Promise<IpcResult<GuideResult>>
    getDraft: (sceneId: string) => Promise<IpcResult<GuideDraft>>
    getMessages: (sceneId: string) => Promise<IpcResult<GuideMessageRecord[]>>
  }
  extraction: {
    runTurn: (sceneId: string, message: string) => Promise<IpcResult<RunTurnResult>>
    draftFromDocs: (sceneId: string) => Promise<IpcResult<DraftResult>>
  }
  validation: {
    run: (sceneId: string, instruction: string) => Promise<IpcResult<ValidationResult>>
    runCase: (sceneId: string, instruction: string) => Promise<IpcResult<ValidationResult>>
    listCases: (sceneId: string) => Promise<IpcResult<TestCase[]>>
    generateCases: (sceneId: string) => Promise<IpcResult<string[]>>
    saveCases: (sceneId: string, cases: TestCase[]) => Promise<IpcResult<TestCase[]>>
    getResults: (sceneId: string) => Promise<IpcResult<ValidationResultsBundle>>
    saveResults: (sceneId: string, bundle: ValidationResultsBundle) => Promise<IpcResult<{ saved: boolean }>>
    exportResults: (sceneId: string, format: 'json' | 'markdown', payload: EvalExportPayload) => Promise<IpcResult<{ filePath: string }>>
  }
  canvas: {
    update: (sceneId: string, canvasData: ExperienceCard) => Promise<IpcResult<ExperienceCard>>
  }
  export: {
    buildPackage: (sceneId: string) => Promise<IpcResult<{ filePath: string }>>
    healthCheck: (sceneId: string) => Promise<IpcResult<HealthCheckResult>>
  }
  settings: {
    getLLM: () => Promise<IpcResult<LLMConfig | null>>
    setLLM: (config: LLMConfig) => Promise<IpcResult<LLMConfig>>
    getLLMProviders: () => Promise<IpcResult<LLMProviderConfig[]>>
    saveLLMProviders: (providers: LLMProviderConfig[]) => Promise<IpcResult<LLMProviderConfig[]>>
    testConnection: (config: LLMConfig) => Promise<IpcResult<{ success: boolean; error?: string }>>
    getAgentConfigs: () => Promise<IpcResult<AgentConfig[]>>
    saveAgentConfig: (config: AgentConfig) => Promise<IpcResult<AgentConfig>>
    openPromptFile: (relativePath: string) => Promise<IpcResult<{ success: boolean; error?: string }>>
    getLanguage: () => Promise<IpcResult<'en' | 'zh'>>
    setLanguage: (lang: 'en' | 'zh') => Promise<IpcResult<'en' | 'zh'>>
    getTheme: () => Promise<IpcResult<'light' | 'dark' | 'system'>>
    setTheme: (theme: 'light' | 'dark' | 'system') => Promise<IpcResult<'light' | 'dark' | 'system'>>
  }
}

declare global {
  interface Window {
    api: ElectronApi
  }
}

export type {
  Scene, Reference, Attachment, AttachmentKind, ConversationMessage, ExperienceCard,
  LLMConfig, LLMProviderConfig, HealthCheckResult, RunTurnResult, DraftResult,
  Proposal, ProposalCard, KnowledgeType, KnowledgeEntry,
  CanvasUpdate, AppError, IpcResult, ElectronApi,
  ValidationResult, ValidationVerdict, DimensionVerdict, VerdictResult, OverallVerdict, TokenUsage,
  TestCase, EvalCaseExport, EvalExportPayload,
  GuideResult, GuideDraft, AgentConfig
}
