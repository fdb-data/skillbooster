import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import type { ExperienceCard, RunTurnResult, DraftResult, ConversationMessage, KnowledgeType, KnowledgeKey } from '../../src/contracts/ipc-types'
import { generateId } from '../../src/utils/uuid'
import { callLLMEx } from './llm'
import type { LLMMessage } from './llm'
import { runAgentLoop } from './agentLoop'
import type { AgentTool } from './agentLoop'
import { createCanvasTools } from './canvasTools'
import type { CanvasToolCollector } from './canvasTools'
import { loadCanvas, listConversation, addConversationMessage, listReferences, resolveAgentLLMConfig, getPreference, setPreference } from './store'
import { getSceneDraft } from './agents'
import { languageDirective, mt } from './i18n'

function loadSkillMd(): string {
  const skillPath = path.join(process.resourcesPath || path.join(__dirname, '../../resources'), 'experience-extraction', 'SKILL.md')
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, 'utf-8')
  }
  const devPath = path.join(__dirname, '../../resources/experience-extraction/SKILL.md')
  if (fs.existsSync(devPath)) {
    return fs.readFileSync(devPath, 'utf-8')
  }
  return 'You are an experience-extraction agent. Guide the user to extract structured experience through conversation.'
}

function toStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map(x => String(x)).filter(s => s.length > 0)
}

const TYPE_LABELS: Record<KnowledgeType, string> = {
  flow: 'Flow',
  rule: 'Rule',
  insight: 'Insight',
  concept: 'Concept',
  relation: 'Relation'
}

// 当前版本启用的知识类型（concept/relation 为企业级特性，个人萃取暂不开放）
const ACTIVE_TYPES: KnowledgeType[] = ['flow', 'rule', 'insight']

/** 画布概要：给 agent 看的紧凑视图（含 id 供 update/delete 定位），代替整卡 JSON */
export function buildCanvasOutline(canvas: ExperienceCard): string {
  const types = ACTIVE_TYPES
  const lines: string[] = []
  for (const type of types) {
    const entries = canvas[`${type}s` as KnowledgeKey]
    lines.push(`### ${TYPE_LABELS[type]} (${entries.length})`)
    for (const e of entries) {
      const content = e.content.length > 200 ? e.content.slice(0, 200) + '…' : e.content
      lines.push(`- [${e.id}] ${e.title} | evidence:${e.evidenceLevel || 'exploratory'}${e.verified ? ' | verified' : ''}\n  ${content.replace(/\n/g, ' ')}`)
    }
  }
  return lines.join('\n')
}

/** 覆盖度与缺口摘要：驱动 agent 的追问方向 */
export function buildGapSummary(canvas: ExperienceCard): string {
  const types = ACTIVE_TYPES
  const counts = types.map(t => ({ type: t, count: canvas[`${t}s` as KnowledgeKey].length }))
  const missing = counts.filter(c => c.count === 0).map(c => TYPE_LABELS[c.type])

  const exploratory: string[] = []
  for (const t of types) {
    for (const e of canvas[`${t}s` as KnowledgeKey]) {
      if ((e.evidenceLevel || 'exploratory') === 'exploratory') exploratory.push(e.title)
    }
  }

  const lines: string[] = []
  lines.push(`Entry distribution: ${counts.map(c => `${TYPE_LABELS[c.type]} ${c.count}`).join(' / ')}`)
  if (missing.length > 0) {
    lines.push(`Missing categories: ${missing.join(', ')} — prioritize follow-up questions around the missing categories`)
  }
  if (exploratory.length > 0) {
    lines.push(`Exploratory entries (${exploratory.length}, seek supporting evidence to raise their evidence level): ${exploratory.slice(0, 8).join(', ')}${exploratory.length > 8 ? ' etc.' : ''}`)
  }
  if (missing.length === 0 && exploratory.length === 0 && counts.every(c => c.count >= 2)) {
    lines.push('Canvas coverage is fairly complete; you can move to wrap-up: invite the user to review the canvas, add failure cases, or proceed to validation/export.')
  }
  return lines.join('\n')
}

const SUMMARY_THRESHOLD = 24 // 超过该消息数则压缩较早历史
const KEEP_RECENT = 16 // 保留最近 N 条原文

/**
 * 构建对话上下文：长对话压缩较早的历史为摘要（缓存于 preferences，按覆盖消息数失效）
 */
export async function buildConversationContext(
  sceneId: string,
  history: ConversationMessage[],
  config: NonNullable<ReturnType<typeof resolveAgentLLMConfig>>
): Promise<LLMMessage[]> {
  if (history.length <= SUMMARY_THRESHOLD) {
    return history.map(h => ({ role: h.role, content: h.content }))
  }

  const toSummarize = history.slice(0, history.length - KEEP_RECENT)
  const recent = history.slice(history.length - KEEP_RECENT)
  const cacheKey = `convSummary:${sceneId}`

  let summary: string | null = null
  const cached = getPreference(cacheKey)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { count: number; summary: string }
      if (parsed.count === toSummarize.length) summary = parsed.summary
    } catch { /* 缓存损坏则重新生成 */ }
  }

  if (!summary) {
    const serialized = toSummarize.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')
    try {
      const result = await callLLMEx({
        messages: [{ role: 'user', content: serialized }],
        systemPrompt: 'Compress the following experience-extraction conversation into a concise summary of key points (under 500 words). You MUST preserve: facts and judgments the user confirmed, domain terms, numbers and thresholds, and questions not yet answered. Do not comment — output the summary directly.',
        config,
        timeout: 60000
      })
      summary = result.content
      setPreference(cacheKey, JSON.stringify({ count: toSummarize.length, summary }))
    } catch (err) {
      log.warn('Conversation summarization failed, fallback to truncated history:', (err as Error).message)
      return history.slice(-SUMMARY_THRESHOLD).map(h => ({ role: h.role, content: h.content }))
    }
  }

  return [
    { role: 'user', content: `[Summary of earlier conversation]\n${summary}` },
    ...recent.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content }))
  ]
}

/** 场景定义概要：把引导阶段确定的场景信息带入萃取上下文，避免开场重复追问领域 */
export function buildSceneSection(sceneId: string): string {
  const d = getSceneDraft(sceneId)
  if (!d.name && !d.protagonist && !d.trigger && d.includes.length === 0 && d.excludes.length === 0) {
    return ''
  }
  const lines: string[] = []
  if (d.name) lines.push(`Scene: ${d.name}`)
  if (d.protagonist) lines.push(`Protagonist (who makes the judgment): ${d.protagonist}`)
  if (d.trigger) lines.push(`Trigger (when it applies): ${d.trigger}`)
  if (d.includes.length > 0) lines.push(`In scope: ${d.includes.join('; ')}`)
  if (d.excludes.length > 0) lines.push(`Out of scope: ${d.excludes.join('; ')}`)
  return '\n\n## Scene definition (already confirmed with the user; do NOT ask the user to restate the domain/scenario — start extracting concrete experience directly)\n' + lines.join('\n')
}

function buildSystemPrompt(sceneId: string, canvas: ExperienceCard, refTexts: string[]): string {
  let prompt = loadSkillMd()

  prompt += buildSceneSection(sceneId)

  prompt += '\n\n## Current experience canvas (outline; use the id in [] to update/delete)\n'
  prompt += buildCanvasOutline(canvas)

  prompt += '\n\n## Canvas coverage and gaps\n'
  prompt += buildGapSummary(canvas)

  if (refTexts.length > 0) {
    prompt += '\n\n## Reference document excerpts\n'
    prompt += refTexts.map((t, i) => `--- Document ${i + 1} ---\n${t.substring(0, 2000)}`).join('\n\n')
  }

  prompt += languageDirective()

  return prompt
}

export async function runTurn(sceneId: string, userInput: string): Promise<RunTurnResult> {
  const config = resolveAgentLLMConfig('extract')
  if (!config) throw new Error(mt('configureLLMFirst'))

  const canvas = loadCanvas(sceneId)
  const history = listConversation(sceneId)
  const refs = listReferences(sceneId)
  const refTexts = refs.map(r => r.extractedText).filter(t => t.length > 0)

  const userMsg: ConversationMessage = {
    id: generateId(),
    sceneId,
    role: 'user',
    content: userInput,
    createdAt: new Date().toISOString()
  }
  addConversationMessage(userMsg)

  const messages = await buildConversationContext(sceneId, history, config)
  messages.push({ role: 'user', content: userInput })

  const runId = generateId()
  const collector: CanvasToolCollector = { updates: [], proposals: [] }
  let options: string[] = []
  let allowFreeText = true
  const tools: AgentTool[] = [
    ...createCanvasTools(sceneId, runId, canvas, collector),
    {
      def: {
        name: 'ask_user',
        description: 'Ask the user your one follow-up question with candidate answers, then wait for their reply (the turn ends after this call). Prefer this over plain enumerated text questions. Do NOT add an "other" option yourself — set allowFreeText=true to let the user type a free-form answer; the UI renders the free-input affordance.',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'Question text (short, ask only one thing at a time)' },
            options: { type: 'array', items: { type: 'string' }, description: '2-4 candidate answers (do not include an "other / type your own" option)' },
            allowFreeText: { type: 'boolean', description: 'Whether to let the user type a free-form answer in addition to the options. Default true.' }
          },
          required: ['question', 'options']
        }
      },
      execute: (args, ctl) => {
        options = toStringArray(args.options) || []
        allowFreeText = args.allowFreeText === undefined ? true : Boolean(args.allowFreeText)
        ctl.stop(String(args.question || ''))
        return 'Question sent to the user, awaiting their answer'
      }
    }
  ]

  const result = await runAgentLoop({
    agentKey: 'extract',
    sceneId,
    runId,
    systemPrompt: buildSystemPrompt(sceneId, canvas, refTexts),
    messages,
    tools,
    config
  })

  const assistantMsg: ConversationMessage = {
    id: generateId(),
    sceneId,
    role: 'assistant',
    content: result.reply,
    createdAt: new Date().toISOString(),
    options: options.length > 0 ? options : undefined,
    allowFreeText: options.length > 0 ? allowFreeText : undefined
  }
  addConversationMessage(assistantMsg)

  return {
    reply: result.reply,
    canvasUpdates: collector.updates,
    proposals: collector.proposals,
    options: options.length > 0 ? options : undefined,
    allowFreeText: options.length > 0 ? allowFreeText : undefined
  }
}

export async function draftFromDocs(sceneId: string): Promise<DraftResult> {
  const config = resolveAgentLLMConfig('extract')
  if (!config) throw new Error(mt('configureLLMFirst'))

  const refs = listReferences(sceneId)
  if (refs.length === 0) throw new Error(mt('uploadDocsFirst'))

  const refTexts = refs.map(r => `--- ${r.filename} ---\n${r.extractedText}`).filter(t => t.length > 0)
  if (refTexts.length === 0) throw new Error(mt('emptyDocs'))

  const canvas = loadCanvas(sceneId)

  let systemPrompt = loadSkillMd()
  systemPrompt += buildSceneSection(sceneId)
  systemPrompt += '\n\n## Current task: draft a first version of the experience canvas from documents\n'
  systemPrompt += 'Carefully read the reference documents the user provided, extract the flows, rules, and insights, and add them to the canvas one by one with the canvas_add tool (record provenance with the document name/section; judge the evidence level by content: regulatory documents → institutional, contains validation data → validated, cases → sample).'
  systemPrompt += ' After adding everything, output an opening message: summarize what you extracted and which parts need the user to supplement or confirm.\n'
  systemPrompt += '\n## Current experience canvas (outline)\n'
  systemPrompt += buildCanvasOutline(canvas)
  systemPrompt += languageDirective()

  const runId = generateId()
  const collector: CanvasToolCollector = { updates: [], proposals: [] }
  const tools = createCanvasTools(sceneId, runId, canvas, collector)

  const result = await runAgentLoop({
    agentKey: 'extract',
    sceneId,
    runId,
    systemPrompt,
    messages: [{ role: 'user', content: `Please draft a first version of the experience canvas from the following documents:\n\n${refTexts.join('\n\n')}` }],
    tools,
    config,
    maxSteps: 12
  })

  const assistantMsg: ConversationMessage = {
    id: generateId(),
    sceneId,
    role: 'assistant',
    content: result.reply,
    createdAt: new Date().toISOString()
  }
  addConversationMessage(assistantMsg)

  return {
    openingMessage: result.reply,
    canvasUpdates: collector.updates
  }
}
