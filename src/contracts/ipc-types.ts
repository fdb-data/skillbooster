export type KnowledgeType = 'flow' | 'rule' | 'insight' | 'concept' | 'relation'

export type SceneStatus = 'active' | 'completed'

export type ProposalAction = 'confirm' | 'reject' | 'modify'

export type HealthCheckCode = 'EMPTY_CANVAS' | 'MISSING_SKILL_MD' | 'MISSING_REFERENCES' | 'EMPTY_CONVERSATION' | 'INVALID_FRONTMATTER' | 'MISSING_ATTACHMENT'

export type HealthCheckSeverity = 'error' | 'warning'

/** 流程节点的单个步骤；content 由 steps 自动拼接，steps 为编辑真相 */
export interface FlowStep {
  title: string
  desc: string
}

export interface KnowledgeEntry {
  id: string
  title: string
  content: string
  /** 仅流程节点使用：结构化步骤。content 与之自动同步，旧数据无此字段时按 content 行拆分 */
  steps?: FlowStep[]
  verified: boolean
  source?: 'ai' | 'user' | 'doc'
  evidenceLevel?: 'institutional' | 'validated' | 'sample' | 'exploratory'
  provenance?: string
  createdAt: string
  updatedAt: string
}

/** 五类知识在 ExperienceCard 上的数组键名 */
export type KnowledgeKey = 'flows' | 'rules' | 'insights' | 'concepts' | 'relations'

export const KNOWLEDGE_KEYS: KnowledgeKey[] = ['flows', 'rules', 'insights', 'concepts', 'relations']

export interface CanvasPosition {
  x: number
  y: number
}

/** 画布上的连线（视觉组装关系，独立于知识条目） */
export interface CanvasEdge {
  id: string
  source: string // 条目 id
  target: string // 条目 id
  kind: 'flow-order' | 'link'
  label?: string
}

/** 画布布局：节点位置 + 连线。可选字段，旧数据无此字段时自动排版 */
export interface CanvasLayout {
  positions: Record<string, CanvasPosition>
  edges: CanvasEdge[]
}

export interface ExperienceCard {
  flows: KnowledgeEntry[]
  rules: KnowledgeEntry[]
  insights: KnowledgeEntry[]
  concepts: KnowledgeEntry[]
  relations: KnowledgeEntry[]
  layout?: CanvasLayout
}

/** 画布统一操作：用户拖拽、行内编辑、agent 工具调用都走这一套 */
export type CanvasOp =
  | { kind: 'add'; type: KnowledgeType; entry: KnowledgeEntry; position?: CanvasPosition }
  | { kind: 'update'; id: string; patch: Partial<Pick<KnowledgeEntry, 'title' | 'content' | 'steps' | 'evidenceLevel' | 'provenance' | 'verified'>> }
  | { kind: 'delete'; id: string }
  | { kind: 'move'; id: string; position: CanvasPosition }
  | { kind: 'connect'; edge: CanvasEdge }
  | { kind: 'disconnect'; edgeId: string }

export interface Reference {
  id: string
  filename: string
  storedPath: string
  extractedText: string
  includeInPackage: boolean
}

/** 脚本 / 资产：不解析、不喂 agent 的纯文件附件 */
export type AttachmentKind = 'script' | 'asset'

export interface Attachment {
  id: string
  kind: AttachmentKind
  filename: string
  storedPath: string
  includeInPackage: boolean
}

export interface ConversationMessage {
  id: string
  sceneId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface Scene {
  id: string
  name: string
  status: SceneStatus
  canvas: ExperienceCard
  references: Reference[]
  scripts: Attachment[]
  assets: Attachment[]
  conversation: ConversationMessage[]
  createdAt: string
  updatedAt: string
}

export interface Proposal {
  id: string
  type: KnowledgeType
  title: string
  content: string
}

export interface ProposalCard {
  id: string
  proposal: Proposal
  status: 'pending' | 'confirmed' | 'rejected' | 'modifying'
}

export interface CanvasUpdate {
  type: KnowledgeType
  action: 'add' | 'update' | 'delete'
  entry: KnowledgeEntry
}

export interface RunTurnResult {
  reply: string
  canvasUpdates: CanvasUpdate[]
  proposals: Proposal[]
}

export interface DraftResult {
  openingMessage: string
  canvasUpdates: CanvasUpdate[]
}

export interface LLMConfig {
  provider: 'openai' | 'azure' | 'custom'
  apiKey: string
  model: string
  baseUrl?: string
}

export interface LLMProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface HealthWarning {
  code: HealthCheckCode
  message: string
  severity: HealthCheckSeverity
}

export interface HealthCheckResult {
  passed: boolean
  warnings: HealthWarning[]
}

/** 单侧 LLM 调用的 token 用量（来自 API usage） */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 裁判逐维度结论；result 站在「带 skill 那侧」视角：win=带skill更好 */
export type VerdictResult = 'win' | 'tie' | 'loss'
export type OverallVerdict = 'helpful' | 'no_difference' | 'worse'

export interface DimensionVerdict {
  dimension: string
  result: VerdictResult
  evidence: string
}

/** 映射回 A/B 之后、对外呈现的裁判结论 */
export interface ValidationVerdict {
  verdict: OverallVerdict
  summary: string
  dimensions: DimensionVerdict[]
}

/** 本次对比的受控条件：两侧共用，唯一差异 = skill */
export interface ValidationControl {
  model: string
  temperature: number
}

export interface ValidationResult {
  bare: string
  withSkill: string
  verdict: ValidationVerdict | null
  /** verdict 为空时的降级文本（裁判失败或旧格式） */
  diffSummary?: string
  bareTokens?: TokenUsage
  skillTokens?: TokenUsage
  bareLatencyMs?: number
  skillLatencyMs?: number
  control: ValidationControl
}

/** 场景测试集中的一条测试指令 */
export interface TestCase {
  id: string
  instruction: string
  sortOrder: number
}

/** 引导对话的一条消息（独立于萃取 conversations，保留选项/多选等 UI 元数据以便完整恢复） */
export interface GuideMessageRecord {
  role: 'user' | 'assistant'
  content: string
  options?: string[]
  optionsMultiSelect?: boolean
  allowFreeText?: boolean
  done?: boolean
}

/** 某场景已持久化的验证结果（逐条结果 + 单条对比结果），随场景一起回读 */
export interface ValidationResultsBundle {
  caseResults: Record<string, ValidationResult>
  singleEntry: { id: string; instruction: string; result: ValidationResult } | null
}

/** 导出评测时单条用例的载荷（指令 + 该条的完整对比结果） */
export interface EvalCaseExport {
  instruction: string
  result: ValidationResult
}

/** 评测结果导出载荷（渲染端组装，主进程格式化落盘） */
export interface EvalExportPayload {
  cases: EvalCaseExport[]
}

export interface AppError {
  code: string
  message: string
  details?: unknown
}

export interface IpcResult<T> {
  success: boolean
  data?: T
  error?: AppError
}

export function emptyExperienceCard(): ExperienceCard {
  return {
    flows: [],
    rules: [],
    insights: [],
    concepts: [],
    relations: []
  }
}