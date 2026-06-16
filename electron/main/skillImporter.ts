import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import log from 'electron-log'
import type { Scene, SceneStatus, Reference, Attachment, AttachmentKind } from '../../src/contracts/ipc-types'
import { generateId } from '../../src/utils/uuid'
import * as store from './store'
import { parseDocument } from './docParser'
import { mt } from './i18n'

/** 原始 SKILL.md 改名后进参考文档的固定名（避免与导出生成的新 SKILL.md 冲突） */
export const ORIGINAL_SKILL_FILENAME = 'original-skill.md'

export interface SkillFrontmatter {
  name?: string
  description?: string
}

/**
 * 最小 frontmatter 分隔器：取出开头 `---\n...\n---` 之间的 name/description。
 * 不依赖 js-yaml——只解析顶层 `key: value`，缩进的嵌套键（如 metadata 下的字段）天然被跳过。
 */
export function parseFrontmatter(md: string): { frontmatter: SkillFrontmatter; body: string } {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(md)
  if (!m) return { frontmatter: {}, body: md }
  const body = md.slice(m[0].length)
  const frontmatter: SkillFrontmatter = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1].toLowerCase()
    let val = kv[2].trim()
    if (val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
      val = val.slice(1, -1)
    }
    if (key === 'name') frontmatter.name = val
    else if (key === 'description') frontmatter.description = val
  }
  return { frontmatter, body }
}

/** 在目录里找 SKILL.md（大小写不敏感） */
function findSkillMd(dir: string): string {
  const found = fs.readdirSync(dir).find(e => e.toLowerCase() === 'skill.md')
  if (!found) throw new Error(mt('skillMdNotFound'))
  return path.join(dir, found)
}

/** zip 解压后 SKILL.md 可能在根、也可能在唯一的单层子目录里，定位真正的技能根 */
function locateRootWithSkillMd(dir: string): string {
  const entries = fs.readdirSync(dir)
  if (entries.some(e => e.toLowerCase() === 'skill.md')) return dir
  const subDirs = entries.filter(e => fs.statSync(path.join(dir, e)).isDirectory())
  if (subDirs.length === 1) {
    const sub = path.join(dir, subDirs[0])
    if (fs.readdirSync(sub).some(e => e.toLowerCase() === 'skill.md')) return sub
  }
  return dir // 交给 findSkillMd 抛出清晰错误
}

interface ResolvedSkill {
  rootDir: string
  skillMdPath: string
  /** 是否枚举 references/scripts/assets 子目录（单文件导入时为 false） */
  bundled: boolean
  cleanup: () => void
}

/** 识别输入类型（文件 / 文件夹 / zip），定位技能根与 SKILL.md */
export function resolveSkillRoot(sourcePath: string): ResolvedSkill {
  const stat = fs.statSync(sourcePath)
  if (stat.isDirectory()) {
    return { rootDir: sourcePath, skillMdPath: findSkillMd(sourcePath), bundled: true, cleanup: () => {} }
  }
  const ext = path.extname(sourcePath).toLowerCase()
  if (ext === '.zip') {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbooster-import-'))
    new AdmZip(sourcePath).extractAllTo(tmpDir, true)
    const rootDir = locateRootWithSkillMd(tmpDir)
    return {
      rootDir,
      skillMdPath: findSkillMd(rootDir),
      bundled: true,
      cleanup: () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* 清理失败忽略 */ } }
    }
  }
  // 单个文件：必须是 SKILL.md 或其它 .md
  if (path.basename(sourcePath).toLowerCase() !== 'skill.md' && ext !== '.md') {
    throw new Error(mt('invalidSkillSource'))
  }
  return { rootDir: path.dirname(sourcePath), skillMdPath: sourcePath, bundled: false, cleanup: () => {} }
}

/** 复制一个文件进参考文档，可指定展示名；解析文本失败不阻断（存空文本仍归档） */
async function addReferenceFromFile(sceneId: string, filePath: string, displayName: string): Promise<void> {
  let extractedText = ''
  try {
    extractedText = await parseDocument(filePath)
  } catch (err) {
    log.warn(`Import: failed to parse reference ${displayName}, stored with empty text:`, (err as Error).message)
  }
  const refId = generateId()
  const sceneDir = store.getSceneDir(sceneId)
  const storedPath = path.join(sceneDir, `${refId}${path.extname(displayName)}`)
  fs.copyFileSync(filePath, storedPath)
  const ref: Reference = { id: refId, filename: displayName, storedPath, extractedText, includeInPackage: true }
  store.addReference(ref, sceneId)
}

/** 把某子目录下的文件归位到脚本区 / 资产区（只复制，不解析） */
function importAttachmentDir(sceneId: string, dir: string, kind: AttachmentKind): void {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return
  for (const name of fs.readdirSync(dir)) {
    const filePath = path.join(dir, name)
    if (!fs.statSync(filePath).isFile()) continue
    const attId = generateId()
    const sceneDir = store.getAttachmentSceneDir(sceneId, kind)
    const storedPath = path.join(sceneDir, `${attId}${path.extname(name)}`)
    fs.copyFileSync(filePath, storedPath)
    const att: Attachment = { id: attId, kind, filename: name, storedPath, includeInPackage: true }
    store.addAttachment(att, sceneId)
  }
}

function buildScene(sceneId: string): Scene {
  const scene = store.getScene(sceneId)!
  return {
    id: scene.id,
    name: scene.name,
    status: scene.status as SceneStatus,
    canvas: store.loadCanvas(sceneId),
    references: store.listReferences(sceneId),
    scripts: store.listAttachments(sceneId, 'script'),
    assets: store.listAttachments(sceneId, 'asset'),
    conversation: store.listConversation(sceneId),
    createdAt: scene.created_at,
    updatedAt: scene.updated_at
  }
}

/**
 * 导入一个已存在的第三方 skill，建一个普通场景：
 * - 原始 SKILL.md 改名为 original-skill.md 进参考文档（默认打包，保留出处）
 * - 包自带的 references/scripts/assets 归位到各自的区
 * 返回完整 Scene（含 scripts，供渲染端做脚本轻提示）。正文结构化由调用方复用 draftFromDocs 触发。
 */
export async function importSkill(sourcePath: string): Promise<Scene> {
  const resolved = resolveSkillRoot(sourcePath)
  try {
    const md = fs.readFileSync(resolved.skillMdPath, 'utf-8')
    const { frontmatter } = parseFrontmatter(md)
    const sceneName = frontmatter.name?.trim() || path.basename(resolved.rootDir) || 'imported-skill'

    const sceneId = generateId()
    store.createScene(sceneId, sceneName)

    // 原始 SKILL.md 改名进参考文档
    await addReferenceFromFile(sceneId, resolved.skillMdPath, ORIGINAL_SKILL_FILENAME)

    // 包自带的捆绑文件归位（单文件导入无此步）
    if (resolved.bundled) {
      const refsDir = path.join(resolved.rootDir, 'references')
      if (fs.existsSync(refsDir) && fs.statSync(refsDir).isDirectory()) {
        for (const name of fs.readdirSync(refsDir)) {
          const filePath = path.join(refsDir, name)
          if (fs.statSync(filePath).isFile()) await addReferenceFromFile(sceneId, filePath, name)
        }
      }
      importAttachmentDir(sceneId, path.join(resolved.rootDir, 'scripts'), 'script')
      importAttachmentDir(sceneId, path.join(resolved.rootDir, 'assets'), 'asset')
    }

    return buildScene(sceneId)
  } finally {
    resolved.cleanup()
  }
}
