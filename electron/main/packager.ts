import fs from 'fs'
import archiver from 'archiver'
import { dialog } from 'electron'
import log from 'electron-log'
import type { ExperienceCard, HealthCheckResult, HealthWarning, EvalExportPayload, ValidationResult, VerdictResult, OverallVerdict, Reference, Attachment } from '../../src/contracts/ipc-types'
import { loadCanvas, getScene, listReferences, listAttachments, listConversation } from './store'
import { getLanguage, mt } from './i18n'
import type { Lang } from './i18n'

const HEALTH_TEXT = {
  emptyCanvas: { en: 'The canvas is empty — no knowledge extracted yet', zh: '画布为空，尚未萃取任何知识' },
  missingReference: { en: 'Reference file missing: ', zh: '参考文档文件缺失: ' },
  emptyConversation: { en: 'No conversational extraction has been done yet', zh: '尚未进行对话萃取' },
  missingScript: { en: 'Script file marked for packaging is missing: ', zh: '标记打包的脚本文件已缺失: ' },
  missingAsset: { en: 'Asset file marked for packaging is missing: ', zh: '标记打包的资产文件已缺失: ' },
  nameMissing: { en: 'SKILL.md frontmatter: "name" is missing', zh: 'SKILL.md frontmatter：缺少 name 字段' },
  nameInvalid: { en: 'SKILL.md frontmatter: "name" must be lowercase letters, digits and single hyphens (no leading/trailing/consecutive hyphen)', zh: 'SKILL.md frontmatter：name 不合规（只能小写字母、数字和单个连字符，且不能以连字符开头/结尾或连续）' },
  nameTooLong: { en: 'SKILL.md frontmatter: "name" exceeds 64 characters', zh: 'SKILL.md frontmatter：name 超过 64 个字符' },
  descMissing: { en: 'SKILL.md frontmatter: "description" is missing', zh: 'SKILL.md frontmatter：缺少 description 字段' },
  descTooLong: { en: 'SKILL.md frontmatter: "description" exceeds 1024 characters', zh: 'SKILL.md frontmatter：description 超过 1024 个字符' }
} as const

const SKILL_TEXT = {
  description: { en: (n: string) => `Experience-extraction skill for the "${n}" scenario, covering its flows, rules, insights, concepts and relations. Load and use it when working on "${n}"-related tasks.`, zh: (n: string) => `《${n}》场景的经验萃取技能，涵盖该场景的流程、规则、洞察、概念与关系知识。当处理「${n}」相关任务时加载并参考本技能。` },
  title: { en: (n: string) => `${n} Experience Skill`, zh: (n: string) => `${n} 经验技能` },
  flows: { en: 'Flows', zh: '流程知识' },
  rules: { en: 'Rules', zh: '规则知识' },
  insights: { en: 'Insights', zh: '洞察知识' },
  concepts: { en: 'Concepts', zh: '概念' },
  relations: { en: 'Relations', zh: '关系' }
} as const

/** Agent Skills 规范：name 仅小写字母/数字/单连字符，首尾不为连字符，无连续连字符 */
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const NAME_MAX = 64
const DESC_MAX = 1024

/** 把场景名转成合规的 skill name；不可用时回落到 skill-<sceneId 前缀> */
export function slugifySkillName(rawName: string, sceneId: string): string {
  let s = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX).replace(/-+$/g, '')
  if (!s) {
    const seed = sceneId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
    s = seed ? `skill-${seed}` : 'skill'
  }
  return s
}

/** 生成场景的 frontmatter 字段（name 经 slug 处理，description 含「做什么+何时用」） */
export function buildFrontmatter(sceneName: string, sceneId: string, lang: Lang): { name: string; description: string } {
  return {
    name: slugifySkillName(sceneName, sceneId),
    description: SKILL_TEXT.description[lang](sceneName).slice(0, DESC_MAX)
  }
}

/** 校验 frontmatter 是否符合 Agent Skills 规范，返回告警（error 会阻断导出） */
export function validateFrontmatter(name: string, description: string, lang: Lang): HealthWarning[] {
  const warnings: HealthWarning[] = []
  if (!name) {
    warnings.push({ code: 'INVALID_FRONTMATTER', message: HEALTH_TEXT.nameMissing[lang], severity: 'error' })
  } else {
    if (name.length > NAME_MAX) warnings.push({ code: 'INVALID_FRONTMATTER', message: HEALTH_TEXT.nameTooLong[lang], severity: 'error' })
    if (!SKILL_NAME_RE.test(name)) warnings.push({ code: 'INVALID_FRONTMATTER', message: HEALTH_TEXT.nameInvalid[lang], severity: 'error' })
  }
  if (!description || !description.trim()) {
    warnings.push({ code: 'INVALID_FRONTMATTER', message: HEALTH_TEXT.descMissing[lang], severity: 'error' })
  } else if (description.length > DESC_MAX) {
    warnings.push({ code: 'INVALID_FRONTMATTER', message: HEALTH_TEXT.descTooLong[lang], severity: 'error' })
  }
  return warnings
}

/** 把字符串安全地放进 YAML 双引号值 */
function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`
}

export function healthCheck(sceneId: string): HealthCheckResult {
  const lang = getLanguage()
  const warnings: HealthWarning[] = []
  const scene = getScene(sceneId)

  if (!scene) {
    return { passed: false, warnings: [{ code: 'EMPTY_CANVAS', message: mt('sceneNotFound', lang), severity: 'error' }] }
  }

  const canvas = loadCanvas(sceneId)
  const totalEntries = canvas.flows.length + canvas.rules.length + canvas.insights.length + canvas.concepts.length + canvas.relations.length

  if (totalEntries === 0) {
    warnings.push({ code: 'EMPTY_CANVAS', message: HEALTH_TEXT.emptyCanvas[lang], severity: 'warning' })
  }

  const { name, description } = buildFrontmatter(scene.name, sceneId, lang)
  warnings.push(...validateFrontmatter(name, description, lang))

  const refs = listReferences(sceneId)
  const includedRefs = refs.filter(r => r.includeInPackage)
  for (const ref of includedRefs) {
    if (!fs.existsSync(ref.storedPath)) {
      warnings.push({ code: 'MISSING_REFERENCES', message: `${HEALTH_TEXT.missingReference[lang]}${ref.filename}`, severity: 'error' })
    }
  }

  for (const s of listAttachments(sceneId, 'script')) {
    if (s.includeInPackage && !fs.existsSync(s.storedPath)) {
      warnings.push({ code: 'MISSING_ATTACHMENT', message: `${HEALTH_TEXT.missingScript[lang]}${s.filename}`, severity: 'warning' })
    }
  }
  for (const a of listAttachments(sceneId, 'asset')) {
    if (a.includeInPackage && !fs.existsSync(a.storedPath)) {
      warnings.push({ code: 'MISSING_ATTACHMENT', message: `${HEALTH_TEXT.missingAsset[lang]}${a.filename}`, severity: 'warning' })
    }
  }

  const conversations = listConversation(sceneId)
  if (conversations.length === 0) {
    warnings.push({ code: 'EMPTY_CONVERSATION', message: HEALTH_TEXT.emptyConversation[lang], severity: 'warning' })
  }

  return {
    passed: !warnings.some(w => w.severity === 'error'),
    warnings
  }
}

function generateSkillMd(sceneName: string, sceneId: string, canvas: ExperienceCard): string {
  const lang = getLanguage()
  const { name, description } = buildFrontmatter(sceneName, sceneId, lang)
  let md = `---\nname: ${name}\ndescription: ${yamlQuote(description)}\nmetadata:\n  version: "1.0"\n---\n\n`
  md += `# ${SKILL_TEXT.title[lang](sceneName)}\n\n`

  if (canvas.flows.length > 0) {
    md += `## ${SKILL_TEXT.flows[lang]}\n\n`
    for (const f of canvas.flows) {
      md += `### ${f.title}\n${f.content}\n\n`
    }
  }

  if (canvas.rules.length > 0) {
    md += `## ${SKILL_TEXT.rules[lang]}\n\n`
    for (const r of canvas.rules) {
      md += `### ${r.title}\n${r.content}\n\n`
    }
  }

  if (canvas.insights.length > 0) {
    md += `## ${SKILL_TEXT.insights[lang]}\n\n`
    for (const i of canvas.insights) {
      md += `### ${i.title}\n${i.content}\n\n`
    }
  }

  if (canvas.concepts.length > 0) {
    md += `## ${SKILL_TEXT.concepts[lang]}\n\n`
    for (const c of canvas.concepts) {
      md += `### ${c.title}\n${c.content}\n\n`
    }
  }

  if (canvas.relations.length > 0) {
    md += `## ${SKILL_TEXT.relations[lang]}\n\n`
    for (const r of canvas.relations) {
      md += `### ${r.title}\n${r.content}\n\n`
    }
  }

  return md
}

/** ZIP 中的一条目：content 为内联文本，source 为磁盘文件路径（二者其一） */
export interface PackageEntry {
  name: string
  content?: string
  source?: string
}

/**
 * 规划标准目录的打包条目（纯函数，便于测试）。
 * 全部置于 `{skillName}/` 子目录下，满足规范「name 必须等于父目录名」。
 * scripts/ 与 assets/ 仅在存在「打包=开且文件仍在」的条目时才产生条目，
 * archiver 不会为没有文件的目录建空文件夹。
 */
export function planPackageEntries(
  skillName: string,
  skillMd: string,
  cardJson: string,
  references: Reference[],
  scripts: Attachment[],
  assets: Attachment[],
  fileExists: (p: string) => boolean
): PackageEntry[] {
  const root = skillName
  const entries: PackageEntry[] = [
    { name: `${root}/SKILL.md`, content: skillMd },
    { name: `${root}/experience-card.json`, content: cardJson }
  ]
  for (const ref of references) {
    if (ref.includeInPackage && fileExists(ref.storedPath)) {
      entries.push({ name: `${root}/references/${ref.filename}`, source: ref.storedPath })
    }
  }
  for (const s of scripts) {
    if (s.includeInPackage && fileExists(s.storedPath)) {
      entries.push({ name: `${root}/scripts/${s.filename}`, source: s.storedPath })
    }
  }
  for (const a of assets) {
    if (a.includeInPackage && fileExists(a.storedPath)) {
      entries.push({ name: `${root}/assets/${a.filename}`, source: a.storedPath })
    }
  }
  return entries
}

export async function buildPackage(sceneId: string): Promise<string> {
  const scene = getScene(sceneId)
  if (!scene) throw new Error(mt('sceneNotFound'))

  const canvas = loadCanvas(sceneId)
  const refs = listReferences(sceneId)
  const scripts = listAttachments(sceneId, 'script')
  const assets = listAttachments(sceneId, 'asset')
  const lang = getLanguage()
  const { name: skillName } = buildFrontmatter(scene.name, scene.id, lang)
  const skillMd = generateSkillMd(scene.name, scene.id, canvas)
  const cardJson = JSON.stringify(canvas, null, 2)
  const entries = planPackageEntries(skillName, skillMd, cardJson, refs, scripts, assets, fs.existsSync)

  const saveResult = await dialog.showSaveDialog({
    title: mt('exportDialogTitle'),
    defaultPath: `${scene.name}-skill.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  })

  if (saveResult.canceled || !saveResult.filePath) {
    throw new Error(mt('exportCanceled'))
  }

  const zipPath = saveResult.filePath

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      log.info(`Skills package created: ${zipPath} (${archive.pointer()} bytes)`)
      resolve(zipPath)
    })

    archive.on('error', (err) => {
      log.error('Archive error:', err)
      reject(err)
    })

    archive.pipe(output)

    for (const e of entries) {
      if (e.content !== undefined) archive.append(e.content, { name: e.name })
      else if (e.source) archive.file(e.source, { name: e.name })
    }

    archive.finalize()
  })
}

const EXPORT_VERDICT_LABEL: Record<OverallVerdict, Record<Lang, string>> = {
  helpful: { zh: '有帮助', en: 'Helpful' },
  no_difference: { zh: '无明显差异', en: 'No notable difference' },
  worse: { zh: '拖累了', en: 'Worse' }
}
const EXPORT_RESULT_LABEL: Record<VerdictResult, Record<Lang, string>> = {
  win: { zh: '胜', en: 'win' },
  tie: { zh: '平', en: 'tie' },
  loss: { zh: '负', en: 'loss' }
}

/** 跨用例胜率 + token 汇总 */
export function summarizeEval(cases: Array<{ result: ValidationResult }>): { win: number; tie: number; loss: number; bareTokens: number; skillTokens: number } {
  let win = 0, tie = 0, loss = 0, bareTokens = 0, skillTokens = 0
  for (const c of cases) {
    if (c.result.verdict) {
      if (c.result.verdict.verdict === 'helpful') win++
      else if (c.result.verdict.verdict === 'worse') loss++
      else tie++
    }
    bareTokens += c.result.bareTokens?.totalTokens ?? 0
    skillTokens += c.result.skillTokens?.totalTokens ?? 0
  }
  return { win, tie, loss, bareTokens, skillTokens }
}

function evalToMarkdown(sceneName: string, payload: EvalExportPayload, lang: Lang): string {
  const s = summarizeEval(payload.cases)
  const control = payload.cases[0]?.result.control
  const isZh = lang === 'zh'
  const lines: string[] = []
  lines.push(`# ${sceneName} · ${isZh ? 'A/B 评测结果' : 'A/B Evaluation'}`)
  lines.push('')
  if (control) {
    lines.push(isZh
      ? `**受控条件**：两侧 ${control.model} · temp ${control.temperature} · 唯一差异 = skill（SKILL.md）`
      : `**Controlled**: both sides ${control.model} · temp ${control.temperature} · the only difference is the skill (SKILL.md)`)
  }
  lines.push(isZh
    ? `**胜率**：skill 赢 ${s.win} · 平 ${s.tie} · 负 ${s.loss}`
    : `**Win rate**: skill won ${s.win} · tied ${s.tie} · lost ${s.loss}`)
  lines.push(isZh
    ? `**token**：A ${s.bareTokens} / B ${s.skillTokens}（B 多 ${s.skillTokens - s.bareTokens}，skill 激活时的成本）`
    : `**Tokens**: A ${s.bareTokens} / B ${s.skillTokens} (B +${s.skillTokens - s.bareTokens}, the cost when the skill is active)`)
  lines.push('')
  payload.cases.forEach((c, i) => {
    lines.push(`## ${i + 1}. ${c.instruction}`)
    lines.push('')
    const v = c.result.verdict
    if (v) {
      lines.push(`**${isZh ? '总结论' : 'Verdict'}**: ${EXPORT_VERDICT_LABEL[v.verdict][lang]} — ${v.summary}`)
      lines.push('')
      for (const d of v.dimensions) {
        lines.push(`- **${d.dimension}** [${EXPORT_RESULT_LABEL[d.result][lang]}] ${d.evidence}`)
      }
    } else if (c.result.diffSummary) {
      lines.push(c.result.diffSummary)
    }
    lines.push('')
    lines.push(`### A · ${isZh ? '裸模型' : 'bare model'}`)
    lines.push('')
    lines.push(c.result.bare)
    lines.push('')
    lines.push(`### B · ${isZh ? '带 skill' : 'with skill'}`)
    lines.push('')
    lines.push(c.result.withSkill)
    lines.push('')
  })
  return lines.join('\n')
}

/** 导出 A/B 评测结果为 JSON / Markdown（含测试集、每条 A/B 输出、裁判结论、汇总） */
export async function exportEvalResults(sceneId: string, format: 'json' | 'markdown', payload: EvalExportPayload): Promise<string> {
  const scene = getScene(sceneId)
  if (!scene) throw new Error(mt('sceneNotFound'))
  const lang = getLanguage()

  const ext = format === 'json' ? 'json' : 'md'
  const saveResult = await dialog.showSaveDialog({
    title: mt('exportDialogTitle'),
    defaultPath: `${scene.name}-eval.${ext}`,
    filters: format === 'json' ? [{ name: 'JSON', extensions: ['json'] }] : [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (saveResult.canceled || !saveResult.filePath) {
    throw new Error(mt('exportCanceled'))
  }

  let content: string
  if (format === 'json') {
    content = JSON.stringify({
      scene: scene.name,
      summary: summarizeEval(payload.cases),
      cases: payload.cases
    }, null, 2)
  } else {
    content = evalToMarkdown(scene.name, payload, lang)
  }
  fs.writeFileSync(saveResult.filePath, content, 'utf-8')
  log.info(`Eval results exported: ${saveResult.filePath}`)
  return saveResult.filePath
}