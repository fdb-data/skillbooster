import { app } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import fs from 'fs'
import log from 'electron-log'
import type { ExperienceCard, LLMConfig, LLMProviderConfig, ConversationMessage, Reference, Attachment, AttachmentKind, TestCase, ValidationResultsBundle, GuideMessageRecord, SecurityCheckResult } from '../../src/contracts/ipc-types'
import { emptyExperienceCard } from '../../src/contracts/ipc-types'

let db: Database.Database | null = null

function getDbPath(): string {
  return path.join(app.getPath('userData'), 'skillbooster.db')
}

function getCanvasDir(): string {
  return path.join(app.getPath('userData'), 'canvas')
}

function getReferencesDir(): string {
  return path.join(app.getPath('userData'), 'references')
}

/** 附件（脚本/资产）按 kind 分根目录：{userData}/scripts | {userData}/assets */
function getAttachmentsRoot(kind: AttachmentKind): string {
  return path.join(app.getPath('userData'), kind === 'script' ? 'scripts' : 'assets')
}

/**
 * 按当前 userData 重新解析参考文档的磁盘路径。
 * DB 里存的是历史绝对路径，app 改名后 userData 目录会变（mindstudio/skillstudio/skillbooster），
 * 文件名恒为 {refId}{ext}，故只取 basename 拼到当前目录，规避改名导致的失配。
 */
function resolveRefPath(sceneId: string, storedPath: string): string {
  return path.join(getReferencesDir(), sceneId, path.basename(storedPath))
}

/** 同理，按当前 userData 重新解析附件磁盘路径 */
function resolveAttPath(sceneId: string, kind: AttachmentKind, storedPath: string): string {
  return path.join(getAttachmentsRoot(kind), sceneId, path.basename(storedPath))
}

export function initDatabase(): void {
  const dbPath = getDbPath()
  const canvasDir = getCanvasDir()
  const refsDir = getReferencesDir()

  if (!fs.existsSync(canvasDir)) fs.mkdirSync(canvasDir, { recursive: true })
  if (!fs.existsSync(refsDir)) fs.mkdirSync(refsDir, { recursive: true })
  for (const kind of ['script', 'asset'] as AttachmentKind[]) {
    const dir = getAttachmentsRoot(kind)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "references" (
      id                TEXT PRIMARY KEY,
      scene_id          TEXT NOT NULL,
      filename          TEXT NOT NULL,
      stored_path       TEXT NOT NULL,
      extracted_text    TEXT DEFAULT '',
      include_in_package INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT NOT NULL,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id                 TEXT PRIMARY KEY,
      scene_id           TEXT NOT NULL,
      kind               TEXT NOT NULL,
      filename           TEXT NOT NULL,
      stored_path        TEXT NOT NULL,
      include_in_package INTEGER NOT NULL DEFAULT 1,
      created_at         TEXT NOT NULL,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      scene_id    TEXT NOT NULL,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      options     TEXT DEFAULT NULL,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS llm_config (
      id        INTEGER PRIMARY KEY CHECK (id = 1),
      provider  TEXT NOT NULL,
      api_key   TEXT NOT NULL,
      model     TEXT NOT NULL,
      base_url  TEXT DEFAULT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS llm_provider (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      base_url  TEXT NOT NULL DEFAULT '',
      api_key   TEXT NOT NULL DEFAULT '',
      models    TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preferences (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_config (
      agent_key  TEXT PRIMARY KEY,
      provider   TEXT NOT NULL DEFAULT '',
      api_key    TEXT NOT NULL DEFAULT '',
      model      TEXT NOT NULL DEFAULT '',
      base_url   TEXT DEFAULT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id          TEXT PRIMARY KEY,
      scene_id    TEXT NOT NULL,
      instruction TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS validation_results (
      scene_id   TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS guide_messages (
      scene_id   TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS security_results (
      scene_id   TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_references_scene ON "references"(scene_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_scene ON attachments(scene_id, kind);
    CREATE INDEX IF NOT EXISTS idx_conversations_scene ON conversations(scene_id);
    CREATE INDEX IF NOT EXISTS idx_test_cases_scene ON test_cases(scene_id);
  `)

  // 旧库迁移：为 conversations 补 options 列（保存萃取智能体的选项卡片）
  const convCols = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>
  if (!convCols.some(c => c.name === 'options')) {
    db.exec('ALTER TABLE conversations ADD COLUMN options TEXT DEFAULT NULL')
  }

  log.info('Database initialized:', dbPath)
}

function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function createScene(id: string, name: string): void {
  const now = new Date().toISOString()
  getDb().prepare('INSERT INTO scenes (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, 'active', now, now)
  saveCanvas(id, emptyExperienceCard())
}

export function listScenes(): Array<{ id: string; name: string; status: string; created_at: string; updated_at: string }> {
  return getDb().prepare('SELECT id, name, status, created_at, updated_at FROM scenes ORDER BY updated_at DESC').all() as Array<{ id: string; name: string; status: string; created_at: string; updated_at: string }>
}

export function getScene(id: string): { id: string; name: string; status: string; created_at: string; updated_at: string } | undefined {
  return getDb().prepare('SELECT id, name, status, created_at, updated_at FROM scenes WHERE id = ?').get(id) as { id: string; name: string; status: string; created_at: string; updated_at: string } | undefined
}

export function updateScene(id: string, data: { name?: string; status?: string }): void {
  const scene = getScene(id)
  if (!scene) throw new Error(`Scene not found: ${id}`)
  const name = data.name ?? scene.name
  const status = data.status ?? scene.status
  const now = new Date().toISOString()
  getDb().prepare('UPDATE scenes SET name = ?, status = ?, updated_at = ? WHERE id = ?').run(name, status, now, id)
}

export function deleteScene(id: string): void {
  getDb().prepare('DELETE FROM scenes WHERE id = ?').run(id)
  const canvasPath = path.join(getCanvasDir(), `${id}.json`)
  if (fs.existsSync(canvasPath)) fs.unlinkSync(canvasPath)
  const refsDir = path.join(getReferencesDir(), id)
  if (fs.existsSync(refsDir)) fs.rmSync(refsDir, { recursive: true, force: true })
  for (const kind of ['script', 'asset'] as AttachmentKind[]) {
    const dir = path.join(getAttachmentsRoot(kind), id)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  }
}

export function saveCanvas(sceneId: string, canvas: ExperienceCard): void {
  const canvasPath = path.join(getCanvasDir(), `${sceneId}.json`)
  fs.writeFileSync(canvasPath, JSON.stringify(canvas, null, 2), 'utf-8')
}

export function loadCanvas(sceneId: string): ExperienceCard {
  const canvasPath = path.join(getCanvasDir(), `${sceneId}.json`)
  if (!fs.existsSync(canvasPath)) return emptyExperienceCard()
  const raw = fs.readFileSync(canvasPath, 'utf-8')
  return JSON.parse(raw) as ExperienceCard
}

export function addReference(ref: Reference, sceneId: string): void {
  getDb().prepare('INSERT INTO "references" (id, scene_id, filename, stored_path, extracted_text, include_in_package, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(ref.id, sceneId, ref.filename, ref.storedPath, ref.extractedText, ref.includeInPackage ? 1 : 0, new Date().toISOString())
}

export function listReferences(sceneId: string): Reference[] {
  const rows = getDb().prepare('SELECT id, filename, stored_path, extracted_text, include_in_package FROM "references" WHERE scene_id = ?').all(sceneId) as Array<{ id: string; filename: string; stored_path: string; extracted_text: string; include_in_package: number }>
  return rows.map(r => ({
    id: r.id,
    filename: r.filename,
    storedPath: resolveRefPath(sceneId, r.stored_path),
    extractedText: r.extracted_text,
    includeInPackage: r.include_in_package === 1
  }))
}

export function removeReference(sceneId: string, refId: string): void {
  const ref = getDb().prepare('SELECT stored_path FROM "references" WHERE id = ? AND scene_id = ?').get(refId, sceneId) as { stored_path: string } | undefined
  if (ref) {
    const p = resolveRefPath(sceneId, ref.stored_path)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  getDb().prepare('DELETE FROM "references" WHERE id = ? AND scene_id = ?').run(refId, sceneId)
}

export function setReferenceInclude(sceneId: string, refId: string, include: boolean): void {
  getDb().prepare('UPDATE "references" SET include_in_package = ? WHERE id = ? AND scene_id = ?').run(include ? 1 : 0, refId, sceneId)
}

export function updateReferenceText(sceneId: string, refId: string, text: string): void {
  getDb().prepare('UPDATE "references" SET extracted_text = ? WHERE id = ? AND scene_id = ?').run(text, refId, sceneId)
}

/** 附件目录：{userData}/{scripts|assets}/{sceneId}，按需创建 */
export function getAttachmentSceneDir(sceneId: string, kind: AttachmentKind): string {
  const dir = path.join(getAttachmentsRoot(kind), sceneId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function addAttachment(att: Attachment, sceneId: string): void {
  getDb().prepare('INSERT INTO attachments (id, scene_id, kind, filename, stored_path, include_in_package, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(att.id, sceneId, att.kind, att.filename, att.storedPath, att.includeInPackage ? 1 : 0, new Date().toISOString())
}

export function listAttachments(sceneId: string, kind: AttachmentKind): Attachment[] {
  const rows = getDb().prepare('SELECT id, kind, filename, stored_path, include_in_package FROM attachments WHERE scene_id = ? AND kind = ? ORDER BY created_at ASC').all(sceneId, kind) as Array<{ id: string; kind: string; filename: string; stored_path: string; include_in_package: number }>
  return rows.map(r => ({
    id: r.id,
    kind: r.kind as AttachmentKind,
    filename: r.filename,
    storedPath: resolveAttPath(sceneId, r.kind as AttachmentKind, r.stored_path),
    includeInPackage: r.include_in_package === 1
  }))
}

export function getAttachment(sceneId: string, attId: string): Attachment | undefined {
  const r = getDb().prepare('SELECT id, kind, filename, stored_path, include_in_package FROM attachments WHERE id = ? AND scene_id = ?').get(attId, sceneId) as { id: string; kind: string; filename: string; stored_path: string; include_in_package: number } | undefined
  if (!r) return undefined
  return { id: r.id, kind: r.kind as AttachmentKind, filename: r.filename, storedPath: resolveAttPath(sceneId, r.kind as AttachmentKind, r.stored_path), includeInPackage: r.include_in_package === 1 }
}

export function removeAttachment(sceneId: string, attId: string): void {
  const att = getDb().prepare('SELECT kind, stored_path FROM attachments WHERE id = ? AND scene_id = ?').get(attId, sceneId) as { kind: string; stored_path: string } | undefined
  if (att) {
    const p = resolveAttPath(sceneId, att.kind as AttachmentKind, att.stored_path)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  getDb().prepare('DELETE FROM attachments WHERE id = ? AND scene_id = ?').run(attId, sceneId)
}

export function setAttachmentInclude(sceneId: string, attId: string, include: boolean): void {
  getDb().prepare('UPDATE attachments SET include_in_package = ? WHERE id = ? AND scene_id = ?').run(include ? 1 : 0, attId, sceneId)
}

export function addConversationMessage(msg: ConversationMessage): void {
  const options = msg.options && msg.options.length > 0
    ? JSON.stringify({ options: msg.options, allowFreeText: msg.allowFreeText })
    : null
  getDb().prepare('INSERT INTO conversations (id, scene_id, role, content, created_at, options) VALUES (?, ?, ?, ?, ?, ?)').run(msg.id, msg.sceneId, msg.role, msg.content, msg.createdAt, options)
}

export function listConversation(sceneId: string): ConversationMessage[] {
  const rows = getDb().prepare('SELECT id, scene_id, role, content, created_at, options FROM conversations WHERE scene_id = ? ORDER BY created_at ASC').all(sceneId) as Array<{ id: string; scene_id: string; role: string; content: string; created_at: string; options: string | null }>
  return rows.map(r => {
    let options: string[] | undefined
    let allowFreeText: boolean | undefined
    if (r.options) {
      try {
        const parsed = JSON.parse(r.options) as { options?: string[]; allowFreeText?: boolean }
        if (Array.isArray(parsed.options) && parsed.options.length > 0) {
          options = parsed.options
          allowFreeText = parsed.allowFreeText
        }
      } catch { /* 损坏的选项数据忽略 */ }
    }
    return {
      id: r.id,
      sceneId: r.scene_id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      createdAt: r.created_at,
      options,
      allowFreeText
    }
  })
}

export function getLLMConfig(): LLMConfig | null {
  const providers = getAllLLMProviders()
  if (providers.length === 0) return null
  const p = providers[0]
  const providerType: 'openai' | 'azure' | 'custom' = p.name.toLowerCase() === 'openai' ? 'openai' : p.name.toLowerCase() === 'azure' ? 'azure' : 'custom'
  return {
    provider: providerType,
    apiKey: p.apiKey,
    model: p.models[0] || 'gpt-4o',
    baseUrl: p.baseUrl || undefined
  }
}

export function saveLLMConfig(config: LLMConfig): void {
  const existing = getDb().prepare('SELECT id FROM llm_config WHERE id = 1').get()
  const now = new Date().toISOString()
  if (existing) {
    getDb().prepare('UPDATE llm_config SET provider = ?, api_key = ?, model = ?, base_url = ?, updated_at = ? WHERE id = 1').run(config.provider, config.apiKey, config.model, config.baseUrl ?? null, now)
  } else {
    getDb().prepare('INSERT INTO llm_config (id, provider, api_key, model, base_url, updated_at) VALUES (1, ?, ?, ?, ?, ?)').run(config.provider, config.apiKey, config.model, config.baseUrl ?? null, now)
  }
}

export function getSceneDir(sceneId: string): string {
  const dir = path.join(getReferencesDir(), sceneId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export interface AgentConfig {
  agentKey: string
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
}

export function getAgentConfig(agentKey: string): AgentConfig | null {
  const row = getDb().prepare('SELECT agent_key, provider, api_key, model, base_url FROM agent_config WHERE agent_key = ?').get(agentKey) as { agent_key: string; provider: string; api_key: string; model: string; base_url: string | null } | undefined
  if (!row) return null
  return { agentKey: row.agent_key, provider: row.provider, apiKey: row.api_key, model: row.model, baseUrl: row.base_url ?? undefined }
}

export function getAllAgentConfigs(): AgentConfig[] {
  const rows = getDb().prepare('SELECT agent_key, provider, api_key, model, base_url FROM agent_config').all() as Array<{ agent_key: string; provider: string; api_key: string; model: string; base_url: string | null }>
  return rows.map(r => ({ agentKey: r.agent_key, provider: r.provider, apiKey: r.api_key, model: r.model, baseUrl: r.base_url ?? undefined }))
}

export function saveAgentConfig(config: AgentConfig): void {
  const now = new Date().toISOString()
  const existing = getDb().prepare('SELECT agent_key FROM agent_config WHERE agent_key = ?').get(config.agentKey)
  if (existing) {
    getDb().prepare('UPDATE agent_config SET provider = ?, api_key = ?, model = ?, base_url = ?, updated_at = ? WHERE agent_key = ?').run(config.provider, config.apiKey, config.model, config.baseUrl ?? null, now, config.agentKey)
  } else {
    getDb().prepare('INSERT INTO agent_config (agent_key, provider, api_key, model, base_url, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(config.agentKey, config.provider, config.apiKey, config.model, config.baseUrl ?? null, now)
  }
}

/** 解析某个 agent 实际使用的 LLM 配置：agent_config 完整则用之，否则回落全局配置 */
export function resolveAgentLLMConfig(agentKey: string): LLMConfig | null {
  const ac = getAgentConfig(agentKey)
  if (ac && ac.apiKey && ac.model) {
    const name = ac.provider.toLowerCase()
    const providerType: 'openai' | 'azure' | 'custom' = name === 'openai' ? 'openai' : name === 'azure' ? 'azure' : 'custom'
    return { provider: providerType, apiKey: ac.apiKey, model: ac.model, baseUrl: ac.baseUrl }
  }
  return getLLMConfig()
}

/** 测试集上限：每个场景最多 10 条测试指令 */
export const MAX_TEST_CASES = 10

export function listTestCases(sceneId: string): TestCase[] {
  const rows = getDb().prepare('SELECT id, instruction, sort_order FROM test_cases WHERE scene_id = ? ORDER BY sort_order ASC').all(sceneId) as Array<{ id: string; instruction: string; sort_order: number }>
  return rows.map(r => ({ id: r.id, instruction: r.instruction, sortOrder: r.sort_order }))
}

/** 整集替换某场景的测试用例（增删改调序统一走这条路），最多保留前 MAX_TEST_CASES 条 */
export function saveTestCases(sceneId: string, cases: TestCase[]): TestCase[] {
  const now = new Date().toISOString()
  const capped = cases.slice(0, MAX_TEST_CASES)
  const tx = getDb().transaction(() => {
    getDb().prepare('DELETE FROM test_cases WHERE scene_id = ?').run(sceneId)
    const stmt = getDb().prepare('INSERT INTO test_cases (id, scene_id, instruction, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
    capped.forEach((c, i) => {
      const text = c.instruction.trim()
      if (text) stmt.run(c.id, sceneId, text, i, now)
    })
  })
  tx()
  return listTestCases(sceneId)
}

const EMPTY_VALIDATION_RESULTS: ValidationResultsBundle = { caseResults: {}, singleEntry: null }

export function getValidationResults(sceneId: string): ValidationResultsBundle {
  const row = getDb().prepare('SELECT data FROM validation_results WHERE scene_id = ?').get(sceneId) as { data: string } | undefined
  if (!row) return { ...EMPTY_VALIDATION_RESULTS }
  try {
    return JSON.parse(row.data) as ValidationResultsBundle
  } catch {
    return { ...EMPTY_VALIDATION_RESULTS }
  }
}

export function saveValidationResults(sceneId: string, bundle: ValidationResultsBundle): void {
  const now = new Date().toISOString()
  getDb().prepare('INSERT INTO validation_results (scene_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(scene_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .run(sceneId, JSON.stringify(bundle), now)
}

export function listGuideMessages(sceneId: string): GuideMessageRecord[] {
  const row = getDb().prepare('SELECT data FROM guide_messages WHERE scene_id = ?').get(sceneId) as { data: string } | undefined
  if (!row) return []
  try {
    const parsed = JSON.parse(row.data)
    return Array.isArray(parsed) ? parsed as GuideMessageRecord[] : []
  } catch {
    return []
  }
}

export function saveGuideMessages(sceneId: string, messages: GuideMessageRecord[]): void {
  const now = new Date().toISOString()
  getDb().prepare('INSERT INTO guide_messages (scene_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(scene_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .run(sceneId, JSON.stringify(messages), now)
}

export function getSecurityResults(sceneId: string): SecurityCheckResult | null {
  const row = getDb().prepare('SELECT data FROM security_results WHERE scene_id = ?').get(sceneId) as { data: string } | undefined
  log.info(`[security] getSecurityResults sceneId=${sceneId} found=${!!row}`)
  if (!row) return null
  try {
    return JSON.parse(row.data) as SecurityCheckResult
  } catch {
    return null
  }
}

export function saveSecurityResults(sceneId: string, result: SecurityCheckResult): void {
  const now = new Date().toISOString()
  log.info(`[security] saveSecurityResults sceneId=${sceneId} findings=${result.findings?.length ?? 0}`)
  getDb().prepare('INSERT INTO security_results (scene_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(scene_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .run(sceneId, JSON.stringify(result), now)
}

export function getPreference(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setPreference(key: string, value: string): void {
  getDb().prepare('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function getAllLLMProviders(): LLMProviderConfig[] {
  const rows = getDb().prepare('SELECT id, name, base_url, api_key, models FROM llm_provider ORDER BY sort_order ASC').all() as Array<{ id: string; name: string; base_url: string; api_key: string; models: string }>
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    apiKey: r.api_key,
    models: JSON.parse(r.models) as string[]
  }))
}

export function saveAllLLMProviders(providers: LLMProviderConfig[]): void {
  const now = new Date().toISOString()
  const tx = getDb().transaction(() => {
    getDb().prepare('DELETE FROM llm_provider').run()
    const stmt = getDb().prepare('INSERT INTO llm_provider (id, name, base_url, api_key, models, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    providers.forEach((p, i) => {
      stmt.run(p.id, p.name, p.baseUrl, p.apiKey, JSON.stringify(p.models), i, now)
    })
  })
  tx()
}
