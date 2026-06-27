import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { dialog } from 'electron'
import type {
  ExperienceCard, KnowledgeEntry, KnowledgeKey, KnowledgeType,
  Reference, Attachment, ConversationMessage,
  SecurityFinding, SecurityCheckResult, SecurityCategory, SecuritySeverity, SecurityFindingLocation,
  RemediateUpdate, RemediateResult
} from '../../src/contracts/ipc-types'
import { generateId } from '../../src/utils/uuid'
import { loadCanvas, getScene, listReferences, listAttachments, listConversation, resolveAgentLLMConfig } from './store'
import { getLanguage, languageDirective, mt } from './i18n'
import type { Lang } from './i18n'
import { callLLMEx } from './llm'
import { BrowserWindow } from 'electron'
import { registerAgentRun, unregisterAgentRun } from './agentLoop'

const ACTIVE_KEYS: KnowledgeKey[] = ['flows', 'rules', 'insights', 'concepts', 'relations']

const TYPE_LABEL: Record<KnowledgeType, string> = {
  flow: 'Flow', rule: 'Rule', insight: 'Insight', concept: 'Concept', relation: 'Relation'
}

/** 单条待扫描文本：知道它来自哪里，便于定位发现 */
interface ScanItem {
  text: string
  location?: SecurityFindingLocation
}

function truncate(s: string, n = 120): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > n ? flat.slice(0, n) + '…' : flat
}

function finding(
  category: SecurityCategory,
  severity: SecuritySeverity,
  title: string,
  detail: string,
  location?: SecurityFindingLocation,
  evidence?: string,
  suggestion?: string
): SecurityFinding {
  return { id: generateId(), category, severity, title, detail, location, evidence: evidence ? truncate(evidence) : undefined, suggestion, source: 'rule' }
}

// ── 规则：异常链接 ──

const DANGEROUS_PROTOCOL_RE = /\b(javascript|vbscript|data|file|ftp|magnet|blob):(?=[^\s"'<>)\]])/gi
const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]]+/gi
const IP_HOST_RE = /https?:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i
const SHORTENER_HOSTS = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'is.gd', 'ow.ly', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorte.st', 'tiny.cc', 'rb.gy']
const SUSPICIOUS_TLDS = ['.zip', '.mov', '.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.cn', '.ru']

function scanLinks(item: ScanItem): SecurityFinding[] {
  const out: SecurityFinding[] = []
  const text = item.text
  if (!text) return out

  const protoMatches = text.match(DANGEROUS_PROTOCOL_RE)
  if (protoMatches) {
    for (const p of protoMatches) {
      out.push(finding(
        'suspiciousLink', 'critical',
        `危险协议链接: ${p.toLowerCase()}:`,
        `内容中出现 ${p.toLowerCase()}: 协议的链接，可能用于执行脚本或读取本地文件，经验包被加载时存在代码执行/信息泄露风险。`,
        item.location, `${p}:…`,
        '移除该链接，或改用 https 正常链接并说明其用途。'
      ))
    }
  }

  const ipMatch = text.match(IP_HOST_RE)
  if (ipMatch) {
    out.push(finding(
      'suspiciousLink', 'high',
      `裸 IP 地址链接: ${ipMatch[1]}`,
      `链接直接指向 IP 地址 ${ipMatch[1]}，无域名可核验，常被用于钓鱼或恶意载荷分发。`,
      item.location, ipMatch[0],
      '替换为可核验的域名链接，或删除。'
    ))
  }

  const urls = text.match(URL_RE) ?? []
  for (const u of urls) {
    const lower = u.toLowerCase()
    const host = lower.replace(/^https?:\/\//, '').split(/[/:]/)[0]
    if (SHORTENER_HOSTS.some(s => host === s || host.endsWith('.' + s))) {
      out.push(finding(
        'suspiciousLink', 'medium',
        `短链接: ${host}`,
        `使用短链接服务 ${host}，真实目标被隐藏，无法在打包时核验安全性。`,
        item.location, u,
        '展开为最终目标链接，或删除。'
      ))
    }
    if (SUSPICIOUS_TLDS.some(tld => host.endsWith(tld))) {
      out.push(finding(
        'suspiciousLink', 'low',
        `可疑顶级域: ${host}`,
        `链接指向高风险顶级域 ${host}，该域常被用于滥用注册。`,
        item.location, u
      ))
    }
    if (u.startsWith('http://')) {
      out.push(finding(
        'suspiciousLink', 'low',
        '非加密 http 链接',
        '链接使用明文 http，传输可被篡改；经验包宜只引用 https 资源。',
        item.location, u
      ))
    }
  }

  return out
}

// ── 规则：异常脚本 ──

const SCRIPT_DANGER_PATTERNS: Array<{ re: RegExp; sev: SecuritySeverity; title: string; detail: string; suggestion?: string }> = [
  { re: /\brequire\s*\(\s*['"]child_process['"]\s*\)|\bchild_process\b|\bexecSync\b|\bspawnSync\b/gi, sev: 'critical', title: '调用 child_process', detail: '脚本调用了 child_process，可在宿主机上执行任意命令，是典型的恶意载荷入口。', suggestion: '移除子进程调用；如确需外部命令，改由宿主应用显式封装并审计。' },
  { re: /\beval\s*\(|\bnew\s+Function\s*\(|\bsetTimeout\s*\(\s*['"]|\bsetInterval\s*\(\s*['"]/gi, sev: 'high', title: '动态代码执行', detail: '使用 eval / new Function / 字符串型定时器，可执行任意拼装出的代码，易被注入。', suggestion: '改用静态函数引用。' },
  { re: /powershell\s+[-/]e(nc)?\b|\bIEX\s*\(|\bInvoke-Expression\b|\bDownloadString\b|\bcmd\s+\/c\b/gi, sev: 'critical', title: 'PowerShell/cmd 一句话指令', detail: '出现 PowerShell 编码执行、IEX、DownloadString 或 cmd /c 等一句话指令特征，常见于无文件攻击载荷。', suggestion: '删除该指令。' },
  { re: /\brm\s+-rf\s+\/|\bmkfs\b|\bdd\s+if=\/dev\//gi, sev: 'critical', title: '破坏性 shell 命令', detail: '出现 rm -rf /、mkfs、dd 等破坏性命令，可能清空磁盘。' },
  { re: /\b(atob|btoa)\s*\(|Buffer\.from\s*\(\s*[^,)]+,\s*['"]base64['"]\s*\)/gi, sev: 'high', title: 'Base64 解码', detail: '脚本对 base64 串解码后执行，是常见的混淆/反检测手法。', suggestion: '展开为明文逻辑，移除运行时解码。' },
  { re: /coinhive|cryptonight|monero\s*miner|\bwallet\.send\b|\beth\.sendTransaction\b/gi, sev: 'high', title: '加密挖矿/转账特征', detail: '出现挖矿或加密货币转账相关特征。' },
  { re: /\bXMLHttpRequest\b|\bfetch\s*\(|\baxios\b/gi, sev: 'medium', title: '脚本内网络请求', detail: '脚本附件中发起网络请求，可能将宿主数据外泄到外部服务器。', suggestion: '如非必要，移除网络请求；确需时固定到已知 HTTPS 端点。' }
]

const LONG_BASE64_RE = /[A-Za-z0-9+/]{200,}={0,2}/g

function scanScriptContent(item: ScanItem): SecurityFinding[] {
  const out: SecurityFinding[] = []
  const text = item.text
  if (!text) return out

  for (const p of SCRIPT_DANGER_PATTERNS) {
    const m = text.match(p.re)
    if (m) {
      out.push(finding('suspiciousScript', p.sev, p.title, p.detail, item.location, m[0], p.suggestion))
    }
  }

  const b64 = text.match(LONG_BASE64_RE)
  if (b64) {
    out.push(finding(
      'suspiciousScript', 'high',
      '超长 base64 串',
      `存在 ${b64.length} 处长度 ≥200 的 base64 串，疑似混淆载荷。`,
      item.location, b64[0],
      '确认其用途；若为数据请改为独立资源文件，若为代码请展开为明文。'
    ))
  }
  return out
}

// ── 规则：投毒 / 提示词注入 ──

const INJECTION_PATTERNS: Array<{ re: RegExp; sev: SecuritySeverity; title: string; detail: string }> = [
  { re: /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi, sev: 'high', title: '提示词注入: "忽略之前的指令"', detail: '出现"忽略之前指令"类语句，试图覆盖系统提示，是典型的经验包投毒。' },
  { re: /disregard\s+(all\s+)?(previous|above|prior)\s+instructions?/gi, sev: 'high', title: '提示词注入: "无视之前的指令"', detail: '出现"无视之前指令"类语句，试图覆盖系统提示。' },
  { re: /forget\s+(your|all)\s+instructions?/gi, sev: 'high', title: '提示词注入: "忘记你的指令"', detail: '试图让模型遗忘系统设定。' },
  { re: /you\s+are\s+now\s+(a|an)\s+|act\s+as\s+(if|a|an)\s+/gi, sev: 'medium', title: '角色重写指令', detail: '出现"你现在是一个…"类角色重写，可能试图越权改写模型行为。' },
  { re: /new\s+instructions?\s*:|system\s+prompt\s*:|jailbreak|DAN\s+mode/gi, sev: 'high', title: '越狱/新指令标记', detail: '出现"new instructions:""system prompt:""jailbreak""DAN mode"等越狱关键词。' },
  { re: /reveal\s+(your\s+)?(system\s+)?prompt|show\s+(me\s+)?your\s+instructions?/gi, sev: 'medium', title: '提示词泄露指令', detail: '试图诱导模型泄露系统提示词。' }
]

const HIDDEN_UNICODE_RE = /[\u200B-\u200D\u2060\uFEFF\u202E\u202D\u200E\u200F\u2066-\u2069]/g

function scanPoisoning(item: ScanItem): SecurityFinding[] {
  const out: SecurityFinding[] = []
  const text = item.text
  if (!text) return out

  for (const p of INJECTION_PATTERNS) {
    const m = text.match(p.re)
    if (m) {
      out.push(finding('poisoning', p.sev, p.title, p.detail, item.location, m[0], '移除该指令性语句，保持知识条目为客观经验描述。'))
    }
  }

  const hidden = text.match(HIDDEN_UNICODE_RE)
  if (hidden && hidden.length > 0) {
    const uniq = [...new Set(hidden.map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`))]
    out.push(finding(
      'poisoning', 'high',
      `隐藏 Unicode 字符: ${uniq.join(', ')}`,
      `内容中嵌入 ${hidden.length} 个零宽/方向控制字符（${uniq.join(', ')}），可对人类隐藏恶意文本或绕过关键词检测。`,
      item.location, hidden.slice(0, 5).join(''),
      '清除这些不可见字符。'
    ))
  }
  return out
}

// ── 规则：敏感信息泄露 ──

const SENSITIVE_PATTERNS: Array<{ re: RegExp; sev: SecuritySeverity; title: string; detail: string }> = [
  { re: /\bsk-[A-Za-z0-9]{20,}/g, sev: 'critical', title: 'OpenAI API Key', detail: '疑似 OpenAI API 密钥（sk-…）。' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, sev: 'critical', title: 'AWS Access Key ID', detail: '疑似 AWS 访问密钥 ID（AKIA…）。' },
  { re: /\bghp_[A-Za-z0-9]{36}\b/g, sev: 'critical', title: 'GitHub Personal Token', detail: '疑似 GitHub 个人访问令牌（ghp_…）。' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, sev: 'critical', title: 'Slack Token', detail: '疑似 Slack 令牌（xox…）。' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, sev: 'critical', title: 'Google API Key', detail: '疑似 Google API 密钥（AIza…）。' },
  { re: /-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY-----/g, sev: 'critical', title: '私钥', detail: '内容中包含 PEM/OPENSSH 私钥块。' },
  { re: /\b(password|passwd|pwd)\s*[:=]\s*['"]([^'"\s]{4,})['"]/gi, sev: 'high', title: '硬编码口令', detail: '出现疑似硬编码口令赋值。' },
  { re: /\b(mongodb|postgres|mysql|redis|amqp):\/\/[^:\s]+:[^@\s]+@/gi, sev: 'high', title: '连接串内嵌凭据', detail: '连接字符串中明文嵌入用户名口令。' }
]

const GENERIC_TOKEN_RE = /\b(token|secret|api[_-]?key|access[_-]?key)\s*[:=]\s*['"]([A-Za-z0-9+/=_-]{40,})['"]/gi

function scanSensitiveData(item: ScanItem): SecurityFinding[] {
  const out: SecurityFinding[] = []
  const text = item.text
  if (!text) return out

  for (const p of SENSITIVE_PATTERNS) {
    const m = text.match(p.re)
    if (m) {
      out.push(finding('sensitiveData', p.sev, p.title, p.detail, item.location, m[0], '从经验包中删除该凭据；如需配置应改为运行时注入。'))
    }
  }

  const gt = text.match(GENERIC_TOKEN_RE)
  if (gt) {
    out.push(finding(
      'sensitiveData', 'medium',
      '疑似长令牌',
      `在 token/secret/api_key/access_key 字段附近发现长度 ≥40 的高熵串，疑似令牌或密钥。`,
      item.location, gt[0]
    ))
  }
  return out
}

// ── 规则：异常内容 ──

const MAX_ENTRY_LEN = 10000
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
const REPEAT_RE = /(.)\1{49,}/g

function scanAbnormalContent(item: ScanItem): SecurityFinding[] {
  const out: SecurityFinding[] = []
  const text = item.text
  if (!text) return out

  if (text.length > MAX_ENTRY_LEN) {
    out.push(finding(
      'abnormalContent', 'low',
      '条目过长',
      `内容长度 ${text.length} 超过 ${MAX_ENTRY_LEN}，可能稀释知识或用于耗尽上下文。`,
      item.location
    ))
  }

  const ctrl = text.match(CONTROL_CHAR_RE)
  if (ctrl && ctrl.length >= 3) {
    out.push(finding(
      'abnormalContent', 'medium',
      '含控制字符',
      `出现 ${ctrl.length} 个不可见控制字符，疑似二进制混入或反检测填充。`,
      item.location
    ))
  }

  const rep = text.match(REPEAT_RE)
  if (rep) {
    out.push(finding(
      'abnormalContent', 'low',
      '重复填充',
      `存在连续重复 ≥50 次的字符，疑似填充/占位攻击。`,
      item.location, rep[0]
    ))
  }
  return out
}

// ── 规则：附件完整性 ──

const MAX_FILE_BYTES = 50 * 1024 * 1024

function scanAttachment(att: Attachment): SecurityFinding[] {
  const out: SecurityFinding[] = []
  const loc: SecurityFindingLocation = { attachmentId: att.id, field: 'file' }
  if (!fs.existsSync(att.storedPath)) {
    out.push(finding(
      'attachmentIssue', 'high',
      `附件文件缺失: ${att.filename}`,
      `标记打包的附件 ${att.filename} 在磁盘上已缺失，无法纳入检测或打包。`,
      loc, undefined, '重新上传该文件，或取消其打包标记。'
    ))
    return out
  }
  try {
    const stat = fs.statSync(att.storedPath)
    if (stat.size === 0) {
      out.push(finding('attachmentIssue', 'medium', `空文件: ${att.filename}`, `附件 ${att.filename} 大小为 0。`, loc))
    } else if (stat.size > MAX_FILE_BYTES) {
      out.push(finding('attachmentIssue', 'low', `附件过大: ${att.filename}`, `附件 ${att.filename} 大小 ${(stat.size / 1024 / 1024).toFixed(1)} MB，超过 50 MB。`, loc))
    }
  } catch {
    // stat 失败不阻断
  }
  return out
}

// ── 汇总所有待扫描文本 ──

function collectScanItems(canvas: ExperienceCard, refs: Reference[], scripts: Attachment[], conversation: ConversationMessage[]): { items: ScanItem[]; count: number } {
  const items: ScanItem[] = []

  for (const key of ACTIVE_KEYS) {
    const type = key.replace(/s$/, '') as KnowledgeType
    for (const e of canvas[key]) {
      items.push({ text: e.title, location: { entryId: e.id, entryType: type, field: 'title' } })
      items.push({ text: e.content, location: { entryId: e.id, entryType: type, field: 'content' } })
      if (e.steps) {
        for (let i = 0; i < e.steps.length; i++) {
          items.push({ text: e.steps[i].title, location: { entryId: e.id, entryType: type, field: `steps[${i}].title` } })
          items.push({ text: e.steps[i].desc, location: { entryId: e.id, entryType: type, field: `steps[${i}].desc` } })
        }
      }
    }
  }

  for (const r of refs) {
    items.push({ text: r.filename, location: { referenceId: r.id, field: 'filename' } })
    items.push({ text: r.extractedText, location: { referenceId: r.id, field: 'extractedText' } })
  }

  for (const s of scripts) {
    items.push({ text: s.filename, location: { attachmentId: s.id, field: 'filename' } })
    if (fs.existsSync(s.storedPath)) {
      try {
        const buf = fs.readFileSync(s.storedPath)
        items.push({ text: buf.toString('utf-8'), location: { attachmentId: s.id, field: 'fileContent' } })
      } catch {
        // 读不到则跳过
      }
    }
  }

  for (const m of conversation) {
    items.push({ text: m.content, location: { field: `conversation[${m.role}]` } })
  }

  return { items, count: items.length }
}

const RULE_NAMES = ['links', 'script', 'poisoning', 'sensitive', 'abnormal', 'attachment']

/** 纯规则扫描：对一组扫描项跑全部规则，返回发现列表（便于单测） */
export function scanSecurityFindings(items: ScanItem[], attachments: Attachment[]): SecurityFinding[] {
  const out: SecurityFinding[] = []
  for (const it of items) {
    out.push(...scanLinks(it))
    out.push(...scanScriptContent(it))
    out.push(...scanPoisoning(it))
    out.push(...scanSensitiveData(it))
    out.push(...scanAbnormalContent(it))
  }
  for (const a of attachments) {
    out.push(...scanAttachment(a))
  }
  return out
}

// ── LLM 语义审查 ──

function loadSecurityPrompt(): string {
  const paths = [
    path.join(process.resourcesPath || '', 'agents', 'security-review.md'),
    path.join(__dirname, '../../resources/agents', 'security-review.md')
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
  }
  return ''
}

function buildReviewPayload(canvas: ExperienceCard, refs: Reference[], scripts: Attachment[], conversation: ConversationMessage[], ruleFindings: SecurityFinding[]): string {
  const lines: string[] = []
  lines.push('# Experience package contents (compact)')
  for (const key of ACTIVE_KEYS) {
    const type = key.replace(/s$/, '') as KnowledgeType
    const entries = canvas[key]
    if (entries.length === 0) continue
    lines.push(`## ${TYPE_LABEL[type]} (${entries.length})`)
    for (const e of entries) {
      const c = e.content.length > 500 ? e.content.slice(0, 500) + '…' : e.content
      lines.push(`- [${e.id}] ${e.title}\n  ${c.replace(/\n/g, ' ')}`)
    }
  }
  if (refs.length > 0) {
    lines.push('## References')
    for (const r of refs) {
      const t = r.extractedText.length > 400 ? r.extractedText.slice(0, 400) + '…' : r.extractedText
      lines.push(`- [ref:${r.id}] ${r.filename}: ${t.replace(/\n/g, ' ')}`)
    }
  }
  if (scripts.length > 0) {
    lines.push('## Script attachments')
    for (const s of scripts) {
      let content = ''
      if (fs.existsSync(s.storedPath)) {
        try { content = fs.readFileSync(s.storedPath, 'utf-8').slice(0, 600) } catch { /* ignore */ }
      }
      lines.push(`- [script:${s.id}] ${s.filename}: ${content.replace(/\n/g, ' ')}`)
    }
  }
  if (conversation.length > 0) {
    lines.push('## Conversation (last 8)')
    for (const m of conversation.slice(-8)) {
      lines.push(`- ${m.role}: ${m.content.slice(0, 200).replace(/\n/g, ' ')}`)
    }
  }
  lines.push('')
  lines.push('# Rule-based findings already detected')
  if (ruleFindings.length === 0) {
    lines.push('(none)')
  } else {
    for (const f of ruleFindings) {
      lines.push(`- [${f.severity}/${f.category}] ${f.title}: ${f.detail}`)
    }
  }
  return lines.join('\n')
}

interface LlmFindingRaw {
  category?: string
  severity?: string
  title?: string
  detail?: string
  entryId?: string
  evidence?: string
  suggestion?: string
}

function parseLlmFindings(raw: string): SecurityFinding[] {
  let parsed: unknown = null
  try { parsed = JSON.parse(raw) } catch { /* try fence */ }
  if (!parsed) {
    const m = raw.match(/```json\s*([\s\S]*?)\s*```/)
    if (m) { try { parsed = JSON.parse(m[1]) } catch { /* give up */ } }
  }
  if (!parsed || typeof parsed !== 'object') return []
  const arr = (parsed as { findings?: unknown }).findings
  if (!Array.isArray(arr)) return []
  const validCat: SecurityCategory[] = ['poisoning', 'suspiciousLink', 'suspiciousScript', 'sensitiveData', 'abnormalContent', 'attachmentIssue']
  const validSev: SecuritySeverity[] = ['critical', 'high', 'medium', 'low']
  const out: SecurityFinding[] = []
  for (const item of arr as LlmFindingRaw[]) {
    const category = validCat.includes(item.category as SecurityCategory) ? (item.category as SecurityCategory) : 'poisoning'
    const severity = validSev.includes(item.severity as SecuritySeverity) ? (item.severity as SecuritySeverity) : 'medium'
    if (!item.title || !item.detail) continue
    let location: SecurityFindingLocation | undefined
    if (item.entryId) {
      const raw = String(item.entryId).slice(0, 64)
      if (raw.startsWith('ref:')) {
        location = { referenceId: raw.slice(4), field: 'extractedText' }
      } else if (raw.startsWith('script:') || raw.startsWith('asset:')) {
        location = { attachmentId: raw.split(':')[1], field: 'fileContent' }
      } else {
        location = { entryId: raw, field: 'content' }
      }
    }
    out.push({
      id: generateId(),
      category,
      severity,
      title: String(item.title).slice(0, 120),
      detail: String(item.detail).slice(0, 600),
      location,
      evidence: item.evidence ? truncate(String(item.evidence)) : undefined,
      suggestion: item.suggestion ? String(item.suggestion).slice(0, 300) : undefined,
      source: 'llm'
    })
  }
  return out
}

async function llmReview(canvas: ExperienceCard, refs: Reference[], scripts: Attachment[], conversation: ConversationMessage[], ruleFindings: SecurityFinding[], lang: Lang, signal?: AbortSignal): Promise<{ findings: SecurityFinding[]; reviewed: boolean }> {
  const config = resolveAgentLLMConfig('extract')
  if (!config) return { findings: [], reviewed: false }
  const prompt = loadSecurityPrompt()
  if (!prompt) return { findings: [], reviewed: false }
  try {
    const payload = buildReviewPayload(canvas, refs, scripts, conversation, ruleFindings)
    const result = await callLLMEx({
      messages: [{ role: 'user', content: payload }],
      systemPrompt: prompt + languageDirective(lang),
      config,
      timeout: 60000,
      signal
    })
    return { findings: parseLlmFindings(result.content), reviewed: true }
  } catch (err) {
    log.warn('Security LLM review failed:', (err as Error).message)
    return { findings: [], reviewed: true }
  }
}

// ── 进度推送：把检测/消除进度推送到安全检测面板（不进对话流） ──

function emitProgress(delta: string, phase: 'running' | 'done' | 'error' = 'running', runId?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('security:progress', { delta, phase, runId })
  }
}

// ── 主入口 ──

export async function securityCheck(sceneId: string): Promise<SecurityCheckResult> {
  const lang = getLanguage()
  const isZh = lang === 'zh'
  const runId = generateId()
  const controller = new AbortController()
  registerAgentRun(runId, controller)

  const say = (text: string): void => { emitProgress(text, 'running', runId) }

  const scene = getScene(sceneId)
  try {
    if (!scene) {
      throw new Error(mt('sceneNotFound', lang))
    }

    say(isZh ? '🔒 正在加载经验包内容…\n' : '🔒 Loading experience package…\n')
    const canvas = loadCanvas(sceneId)
    const refs = listReferences(sceneId)
    const scripts = listAttachments(sceneId, 'script')
    const assets = listAttachments(sceneId, 'asset')
    const conversation = listConversation(sceneId)

    const entryCount = ACTIVE_KEYS.reduce((n, k) => n + canvas[k].length, 0)
    say(isZh
      ? `已加载 ${entryCount} 条知识、${refs.length} 篇参考文档、${scripts.length + assets.length} 个附件。\n`
      : `Loaded ${entryCount} knowledge entries, ${refs.length} references, ${scripts.length + assets.length} attachments.\n`)

    say(isZh ? `开始规则扫描（${RULE_NAMES.length} 组规则）…\n` : `Running rule scan (${RULE_NAMES.length} rule groups)…\n`)
    const { items, count } = collectScanItems(canvas, refs, scripts, conversation)
    const ruleFindings = scanSecurityFindings(items, [...scripts, ...assets])
    say(isZh
      ? `规则扫描完成，发现 ${ruleFindings.length} 项风险。\n`
      : `Rule scan complete, ${ruleFindings.length} findings.\n`)

    let llmReviewed = false
    let llmFindings: SecurityFinding[] = []
    if (resolveAgentLLMConfig('extract')) {
      say(isZh ? '调用萃取智能体进行语义审查…\n' : 'Calling extraction agent for semantic review…\n')
      const llmResult = await llmReview(canvas, refs, scripts, conversation, ruleFindings, lang, controller.signal)
      llmReviewed = llmResult.reviewed
      llmFindings = llmResult.findings
      say(isZh
        ? `智能体审查完成，新增 ${llmFindings.length} 项风险。\n`
        : `Agent review complete, ${llmFindings.length} additional findings.\n`)
    } else {
      say(isZh ? '未配置萃取智能体，跳过语义审查。\n' : 'No extraction agent configured, skipping semantic review.\n')
    }

    const findings = [...ruleFindings, ...llmFindings]
    const passed = !findings.some(f => f.severity === 'critical' || f.severity === 'high')
    const result: SecurityCheckResult = {
      passed,
      findings,
      stats: { rulesChecked: RULE_NAMES.length, contentsScanned: count, llmReviewed },
      checkedAt: new Date().toISOString()
    }
    say(isZh ? '检测完成。' : 'Check complete.')
    emitProgress('', 'done', runId)

    return result
  } catch (err) {
    emitProgress((err as Error).message, 'error', runId)
    throw err
  } finally {
    unregisterAgentRun(runId)
  }
}

// ── 导出安全检测报告 ──

const REPORT_SEV_LABEL: Record<SecuritySeverity, Record<Lang, string>> = {
  critical: { zh: '严重', en: 'Critical' },
  high: { zh: '高危', en: 'High' },
  medium: { zh: '中危', en: 'Medium' },
  low: { zh: '低危', en: 'Low' }
}
const REPORT_CAT_LABEL: Record<SecurityCategory, Record<Lang, string>> = {
  poisoning: { zh: '投毒', en: 'Poisoning' },
  suspiciousLink: { zh: '异常链接', en: 'Suspicious link' },
  suspiciousScript: { zh: '异常脚本', en: 'Suspicious script' },
  sensitiveData: { zh: '敏感信息', en: 'Sensitive data' },
  abnormalContent: { zh: '异常内容', en: 'Abnormal content' },
  attachmentIssue: { zh: '附件问题', en: 'Attachment issue' }
}

export async function exportSecurityReport(sceneId: string, result: SecurityCheckResult): Promise<string> {
  const scene = getScene(sceneId)
  if (!scene) throw new Error(mt('sceneNotFound'))
  const lang = getLanguage()
  const isZh = lang === 'zh'

  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of result.findings) counts[f.severity]++

  const lines: string[] = []
  lines.push(`# ${scene.name} · ${isZh ? '安全检测报告' : 'Security Check Report'}`)
  lines.push('')
  lines.push(`**${isZh ? '检测时间' : 'Checked at'}**: ${result.checkedAt}`)
  lines.push(`**${isZh ? '结论' : 'Result'}**: ${result.passed ? (isZh ? '通过（无 critical/high）' : 'Passed (no critical/high)') : (isZh ? '未通过' : 'Failed')}`)
  lines.push(`**${isZh ? '风险计数' : 'Findings'}**: ${isZh ? `严重 ${counts.critical} · 高危 ${counts.high} · 中危 ${counts.medium} · 低危 ${counts.low}` : `critical ${counts.critical} · high ${counts.high} · medium ${counts.medium} · low ${counts.low}`}`)
  lines.push(`**${isZh ? '扫描范围' : 'Scope'}**: ${isZh ? `${result.stats.contentsScanned} 段文本 · ${result.stats.rulesChecked} 组规则` : `${result.stats.contentsScanned} segments · ${result.stats.rulesChecked} rule groups`}${result.stats.llmReviewed ? (isZh ? ' · 含智能体语义审查' : ' · incl. agent review') : ''}`)
  lines.push('')

  if (result.findings.length === 0) {
    lines.push(isZh ? '未发现风险项。' : 'No risks found.')
  } else {
    const ordered = [...result.findings].sort((a, b) => {
      const ord: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
      return ord[a.severity] - ord[b.severity] || a.category.localeCompare(b.category)
    })
    for (let i = 0; i < ordered.length; i++) {
      const f = ordered[i]
      lines.push(`## ${i + 1}. [${REPORT_SEV_LABEL[f.severity][lang]}] ${f.title}`)
      lines.push('')
      lines.push(`- **${isZh ? '类别' : 'Category'}**: ${REPORT_CAT_LABEL[f.category][lang]}`)
      lines.push(`- **${isZh ? '来源' : 'Source'}**: ${f.source === 'llm' ? (isZh ? '智能体' : 'agent') : (isZh ? '规则' : 'rule')}`)
      const loc = f.location
      if (loc) {
        const parts: string[] = []
        if (loc.entryId) parts.push(`${loc.entryType ?? 'entry'}:${loc.entryId}`)
        if (loc.referenceId) parts.push(`ref:${loc.referenceId}`)
        if (loc.attachmentId) parts.push(`file:${loc.attachmentId}`)
        if (loc.field) parts.push(loc.field)
        lines.push(`- **${isZh ? '位置' : 'Location'}**: ${parts.join(' · ')}`)
      }
      lines.push(`- **${isZh ? '说明' : 'Detail'}**: ${f.detail}`)
      if (f.evidence) lines.push(`- **${isZh ? '证据' : 'Evidence'}**: \`${f.evidence}\``)
      if (f.suggestion) lines.push(`- **${isZh ? '建议' : 'Suggestion'}**: ${f.suggestion}`)
      lines.push('')
    }
  }

  const saveResult = await dialog.showSaveDialog({
    title: mt('exportDialogTitle'),
    defaultPath: `${scene.name}-security-report.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (saveResult.canceled || !saveResult.filePath) {
    throw new Error(mt('exportCanceled'))
  }
  fs.writeFileSync(saveResult.filePath, lines.join('\n'), 'utf-8')
  log.info(`Security report exported: ${saveResult.filePath}`)
  return saveResult.filePath
}

// ── 风险消除：萃取智能体修订经验条目以消除指定风险 ──

/** 确定性文本清洗：去隐藏 Unicode / 控制字符 / 危险协议链接 / 重复填充。安全无副作用，始终先于 LLM 应用 */
export function applyDeterministicFix(text: string): string {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF\u202E\u202D\u200E\u200F\u2066-\u2069]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\b(javascript|vbscript|data|file|ftp|magnet|blob):[^\s"'<>)\]]+/gi, '')
    .replace(/(.)\1{49,}/g, '$1')
}

function loadRemediatePrompt(): string {
  const paths = [
    path.join(process.resourcesPath || '', 'agents', 'remediate.md'),
    path.join(__dirname, '../../resources/agents', 'remediate.md')
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
  }
  return ''
}

function buildRemediatePayload(entry: { title: string; content: string; type: KnowledgeType }, findings: SecurityFinding[]): string {
  const lines: string[] = []
  lines.push(`Entry type: ${entry.type}`)
  lines.push(`Title: ${entry.title}`)
  lines.push('Content:')
  lines.push(entry.content)
  lines.push('')
  lines.push('Findings to eliminate:')
  findings.forEach((f, i) => {
    lines.push(`${i + 1}. [${f.severity}/${f.category}] ${f.title}: ${f.detail}`)
    if (f.evidence) lines.push(`   evidence: ${f.evidence}`)
    if (f.suggestion) lines.push(`   suggestion: ${f.suggestion}`)
  })
  return lines.join('\n')
}

function parseRemediateResponse(raw: string): { title: string; content: string } | null {
  let parsed: unknown = null
  try { parsed = JSON.parse(raw) } catch { /* try fence */ }
  if (!parsed) {
    const m = raw.match(/```json\s*([\s\S]*?)\s*```/)
    if (m) { try { parsed = JSON.parse(m[1]) } catch { /* give up */ } }
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as { title?: unknown; content?: unknown }
  if (typeof obj.title !== 'string' || typeof obj.content !== 'string') return null
  return { title: obj.title, content: obj.content }
}

async function llmRemediateEntry(
  entry: { title: string; content: string; type: KnowledgeType },
  findings: SecurityFinding[],
  lang: Lang,
  signal?: AbortSignal
): Promise<{ title: string; content: string } | null> {
  const config = resolveAgentLLMConfig('extract')
  if (!config) return null
  const prompt = loadRemediatePrompt()
  if (!prompt) return null
  try {
    const result = await callLLMEx({
      messages: [{ role: 'user', content: buildRemediatePayload(entry, findings) }],
      systemPrompt: prompt + languageDirective(lang),
      config,
      timeout: 60000,
      signal
    })
    return parseRemediateResponse(result.content)
  } catch (err) {
    log.warn('Remediate LLM call failed:', (err as Error).message)
    return null
  }
}

/** 在画布中按 id 查找条目及其类型 */
function findEntryInCanvas(canvas: ExperienceCard, id: string): { entry: KnowledgeEntry; type: KnowledgeType } | null {
  for (const key of ACTIVE_KEYS) {
    const type = key.replace(/s$/, '') as KnowledgeType
    const entry = canvas[key].find(e => e.id === id)
    if (entry) return { entry, type }
  }
  return null
}

export async function remediateFindings(sceneId: string, findings: SecurityFinding[]): Promise<RemediateResult> {
  const lang = getLanguage()
  const isZh = lang === 'zh'
  const runId = generateId()
  const controller = new AbortController()
  registerAgentRun(runId, controller)

  const say = (text: string): void => { emitProgress(text, 'running', runId) }

  try {
    const canvas = loadCanvas(sceneId)

    // 按条目分组；无 entryId 的发现无法自动消除
    const byEntry = new Map<string, SecurityFinding[]>()
    const skipped: SecurityFinding[] = []
    for (const f of findings) {
      const eid = f.location?.entryId
      if (!eid) { skipped.push(f); continue }
      const arr = byEntry.get(eid) ?? []
      arr.push(f)
      byEntry.set(eid, arr)
    }

    say(isZh ? `🧹 开始消除 ${findings.length} 项风险（涉及 ${byEntry.size} 个条目）…\n` : `🧹 Remediating ${findings.length} findings (${byEntry.size} entries)…\n`)

    const updates: RemediateUpdate[] = []
    const hasLlm = resolveAgentLLMConfig('extract') !== null
    let i = 0
    for (const [entryId, entryFindings] of byEntry) {
      i++
      const found = findEntryInCanvas(canvas, entryId)
      if (!found) {
        say(isZh ? `  [${i}/${byEntry.size}] 条目 ${entryId.slice(0, 8)} 已不存在，跳过。\n` : `  [${i}/${byEntry.size}] Entry ${entryId.slice(0, 8)} no longer exists, skipped.\n`)
        for (const f of entryFindings) skipped.push(f)
        continue
      }
      const { entry, type } = found
      say(isZh ? `  [${i}/${byEntry.size}] 修订「${entry.title}」(${type})…\n` : `  [${i}/${byEntry.size}] Revising "${entry.title}" (${type})…\n`)

      // 1) 确定性清洗（始终应用）
      let title = applyDeterministicFix(entry.title)
      let content = applyDeterministicFix(entry.content)

      // 2) LLM 语义修订（若配置了萃取智能体）
      if (hasLlm) {
        const revised = await llmRemediateEntry({ title, content, type }, entryFindings, lang, controller.signal)
        if (revised) {
          title = revised.title
          content = revised.content
        } else {
          say(isZh ? '    智能体修订未返回有效结果，保留确定性清洗结果。\n' : '    Agent returned no valid result, keeping deterministic fix.\n')
        }
      }

      updates.push({ id: entryId, title, content })
      say(isZh ? '    已修订。\n' : '    Revised.\n')
    }

    const llmNote = hasLlm ? '' : (isZh ? '（未配置萃取智能体，仅做了确定性清洗）' : ' (no extraction agent configured, deterministic fixes only)')
    const summaryLines: string[] = []
    if (updates.length > 0) {
      summaryLines.push(isZh
        ? `🧹 **已消除 ${updates.length} 个条目的风险**${llmNote}。修订内容：`
        : `🧹 **Remediated ${updates.length} entries**${llmNote}. Revised:`)
      for (const u of updates) {
        const e = findEntryInCanvas(canvas, u.id)
        summaryLines.push(`- \`${e ? e.type : 'entry'}:${u.id.slice(0, 8)}\` ${e ? e.entry.title : ''}`)
      }
    }
    if (skipped.length > 0) {
      summaryLines.push(isZh
        ? `⚠️ ${skipped.length} 项风险无法自动消除（无对应条目或为附件类），需手动处理。`
        : `⚠️ ${skipped.length} finding(s) could not be auto-remediated (no entry or attachment-related); manual review needed.`)
    }
    if (updates.length === 0 && skipped.length === 0) {
      summaryLines.push(isZh ? '🧹 未做任何修订。' : '🧹 No changes made.')
    }
    const summary = summaryLines.join('\n')
    say(isZh ? '消除完成。' : 'Remediation complete.')
    emitProgress('', 'done', runId)

    return { updates, skipped, summary }
  } catch (err) {
    emitProgress((err as Error).message, 'error', runId)
    throw err
  } finally {
    unregisterAgentRun(runId)
  }
}
