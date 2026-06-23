import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { callLLMEx, DEFAULT_TEMPERATURE } from './llm'
import { runAgentLoop } from './agentLoop'
import type { AgentTool } from './agentLoop'
import { emitAgentEvent } from './agentEvents'
import { EventType } from '../../src/contracts/agent-events'
import { resolveAgentLLMConfig, getScene, listReferences, loadCanvas, getPreference, setPreference, listGuideMessages, saveGuideMessages, listTestCases, getTestCase } from './store'
import { getLanguage, languageDirective, mt } from './i18n'
import type { Lang } from './i18n'
import { generateId } from '../../src/utils/uuid'
import type { ValidationResult, ValidationVerdict, VerdictResult, OverallVerdict, TestCase, ReplayReport, ReplayResult } from '../../src/contracts/ipc-types'

function loadPrompt(filename: string): string {
  const paths = [
    path.join(process.resourcesPath || '', 'agents', filename),
    path.join(__dirname, '../../resources/agents', filename),
    path.join(__dirname, '../../resources/experience-extraction', filename)
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
  }
  log.warn(`Prompt file not found: ${filename}`)
  return ''
}

function parseJsonResponse(raw: string): unknown {
  try { return JSON.parse(raw) } catch { /* try code fence */ }
  const m = raw.match(/```json\s*([\s\S]*?)\s*```/)
  if (m) { try { return JSON.parse(m[1]) } catch { /* give up */ } }
  return null
}

export interface SceneDraft {
  name: string
  protagonist: string
  trigger: string
  includes: string[]
  excludes: string[]
  projectName: string
  done: boolean
}

function emptySceneDraft(): SceneDraft {
  return { name: '', protagonist: '', trigger: '', includes: [], excludes: [], projectName: '', done: false }
}

function loadSceneDraft(sceneId: string): SceneDraft {
  const raw = getPreference(`sceneDraft:${sceneId}`)
  if (!raw) return emptySceneDraft()
  try {
    return { ...emptySceneDraft(), ...JSON.parse(raw) as Partial<SceneDraft> }
  } catch {
    return emptySceneDraft()
  }
}

function saveSceneDraft(sceneId: string, draft: SceneDraft): void {
  setPreference(`sceneDraft:${sceneId}`, JSON.stringify(draft))
}

/** 供渲染端恢复已保存的场景草稿（从工作台返回场景定义页时） */
export function getSceneDraft(sceneId: string): SceneDraft {
  return loadSceneDraft(sceneId)
}

function toStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map(x => String(x)).filter(s => s.length > 0)
}

export async function guideRunTurn(sceneId: string, userInput: string): Promise<{ reply: string; options: string[]; optionsMultiSelect: boolean; allowFreeText: boolean; sceneDraft: { name: string; protagonist: string; trigger: string; includes: string[]; excludes: string[] }; projectName: string; done: boolean }> {
  const config = resolveAgentLLMConfig('guide')
  if (!config) throw new Error(mt('configureLLMFirst'))

  // 引导对话独立于萃取 conversations 持久化，本轮结束后整集写回
  const priorMessages = listGuideMessages(sceneId)
  const refs = listReferences(sceneId)
  const refTexts = refs.map(r => r.extractedText).filter(t => t.length > 0)
  const draft = loadSceneDraft(sceneId)

  let systemPrompt = loadPrompt('guide.md')
  systemPrompt += '\n\n## Current scene draft\n' + JSON.stringify(draft)
  if (refTexts.length > 0) {
    systemPrompt += '\n\n## Reference document excerpts\n' + refTexts.map((t, i) => `--- Document ${i + 1} ---\n${t.substring(0, 2000)}`).join('\n\n')
  }
  systemPrompt += languageDirective()

  const runId = generateId()
  let options: string[] = []
  let optionsMultiSelect = false
  let allowFreeText = false

  const emitDraft = (): void => {
    emitAgentEvent({ type: EventType.CUSTOM, runId, name: 'scene_draft', value: { ...draft } })
  }

  const tools: AgentTool[] = [
    {
      def: {
        name: 'update_scene',
        description: 'Update the scene draft. Only pass the fields you want to update. Set done=true once all of name/protagonist/trigger/includes/excludes have values.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Scene name (noun phrase, keep it short)' },
            protagonist: { type: 'string', description: 'Who makes this judgment' },
            trigger: { type: 'string', description: 'When it is triggered' },
            includes: { type: 'array', items: { type: 'string' }, description: 'In-scope boundaries (1-3 items)' },
            excludes: { type: 'array', items: { type: 'string' }, description: 'Out-of-scope boundaries (1-3 items)' },
            projectName: { type: 'string', description: 'Project name (current best guess, may update each turn)' },
            done: { type: 'boolean', description: 'Whether scene info is fully collected' }
          }
        }
      },
      execute: (args) => {
        if (args.name !== undefined) draft.name = String(args.name)
        if (args.protagonist !== undefined) draft.protagonist = String(args.protagonist)
        if (args.trigger !== undefined) draft.trigger = String(args.trigger)
        const inc = toStringArray(args.includes)
        if (inc) draft.includes = inc
        const exc = toStringArray(args.excludes)
        if (exc) draft.excludes = exc
        if (args.projectName !== undefined) draft.projectName = String(args.projectName)
        if (args.done !== undefined) draft.done = Boolean(args.done)
        saveSceneDraft(sceneId, draft)
        emitDraft()
        return `Scene draft updated: ${JSON.stringify(draft)}`
      }
    },
    {
      def: {
        name: 'ask_user',
        description: 'Ask the user one question with candidate options, then wait for their answer (the turn ends after this call). Do NOT add an "other" option yourself — set allowFreeText=true to let the user type a free-form answer; the UI renders the free-input affordance.',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'Question text (short, ask only one thing at a time)' },
            options: { type: 'array', items: { type: 'string' }, description: '2-4 candidate phrases (do not include an "other / type your own" option)' },
            multiSelect: { type: 'boolean', description: 'Whether multiple options can be selected at once. Pass true when several options can hold simultaneously (e.g. "which steps are included"); omit or false when only one applies' },
            allowFreeText: { type: 'boolean', description: 'Whether to let the user type a free-form answer in addition to the options. Default true for most questions.' }
          },
          required: ['question', 'options']
        }
      },
      execute: (args, ctl) => {
        options = toStringArray(args.options) || []
        optionsMultiSelect = Boolean(args.multiSelect)
        allowFreeText = args.allowFreeText === undefined ? true : Boolean(args.allowFreeText)
        ctl.stop(String(args.question || ''))
        return 'Question sent to the user, awaiting their answer'
      }
    }
  ]

  const messages = priorMessages.map(h => ({ role: h.role, content: h.content }))
  messages.push({ role: 'user' as const, content: userInput })

  const result = await runAgentLoop({
    agentKey: 'guide',
    sceneId,
    runId,
    systemPrompt,
    messages,
    tools,
    config,
    maxSteps: 4
  })

  saveGuideMessages(sceneId, [
    ...priorMessages,
    { role: 'user', content: userInput },
    { role: 'assistant', content: result.reply, options, optionsMultiSelect, allowFreeText, done: draft.done }
  ])

  return {
    reply: result.reply,
    options,
    optionsMultiSelect,
    allowFreeText,
    sceneDraft: {
      name: draft.name,
      protagonist: draft.protagonist,
      trigger: draft.trigger,
      includes: draft.includes,
      excludes: draft.excludes
    },
    projectName: draft.projectName,
    done: draft.done
  }
}

/** 裁判盲版输出：只见「回答1/回答2」，不知哪侧带 skill */
type BlindLabel = 'answer1' | 'answer2' | 'tie'
interface BlindJudge {
  betterOverall: BlindLabel
  summary: string
  dimensions: Array<{ dimension: string; better: BlindLabel; evidence: string }>
}


/** 盲标签 → 带 skill 视角的胜/平/负。flip 时 answer1 才是带 skill 那侧。*/
export function resolveSkillResult(better: BlindLabel, flip: boolean): VerdictResult {
  if (better === 'tie') return 'tie'
  const skillLabel: BlindLabel = flip ? 'answer1' : 'answer2'
  return better === skillLabel ? 'win' : 'loss'
}

/** 盲标签 → 总结论枚举 */
export function resolveOverallVerdict(better: BlindLabel, flip: boolean): OverallVerdict {
  if (better === 'tie') return 'no_difference'
  const skillLabel: BlindLabel = flip ? 'answer1' : 'answer2'
  return better === skillLabel ? 'helpful' : 'worse'
}

/** 把裁判文本里的 [1]/[2] 占位替换回 A/B（flip 时 [1]=B、[2]=A） */
export function remapBlindLabels(text: string, flip: boolean, lang: Lang): string {
  const aLabel = lang === 'zh' ? 'A（裸模型）' : 'A (bare model)'
  const bLabel = lang === 'zh' ? 'B（带 skill）' : 'B (with Skill)'
  const token1 = flip ? bLabel : aLabel
  const token2 = flip ? aLabel : bLabel
  return text.replace(/\[\s*1\s*\]/g, token1).replace(/\[\s*2\s*\]/g, token2)
}

/** 把裁判盲版结论映射回 A/B 视角的对外结构 */
export function mapBlindVerdict(raw: BlindJudge, flip: boolean, lang: Lang): ValidationVerdict {
  const dimensions = (Array.isArray(raw.dimensions) ? raw.dimensions : [])
    .filter(d => d && d.dimension)
    .map(d => ({
      dimension: String(d.dimension),
      result: resolveSkillResult(d.better, flip),
      evidence: remapBlindLabels(String(d.evidence ?? ''), flip, lang)
    }))
  return {
    verdict: resolveOverallVerdict(raw.betterOverall, flip),
    summary: remapBlindLabels(String(raw.summary ?? ''), flip, lang),
    dimensions
  }
}

const VERDICT_LABEL: Record<OverallVerdict, Record<Lang, string>> = {
  helpful: { zh: '有帮助', en: 'Helpful' },
  no_difference: { zh: '无明显差异', en: 'No notable difference' },
  worse: { zh: '拖累了', en: 'Worse' }
}
const RESULT_LABEL: Record<VerdictResult, Record<Lang, string>> = {
  win: { zh: '胜', en: 'win' },
  tie: { zh: '平', en: 'tie' },
  loss: { zh: '负', en: 'loss' }
}

/** 由 verdict 生成可读的降级文本（也用于「保存验证记录」） */
export function verdictToText(verdict: ValidationVerdict, lang: Lang): string {
  const head = lang === 'zh'
    ? `总结论：${VERDICT_LABEL[verdict.verdict][lang]} — ${verdict.summary}`
    : `Verdict: ${VERDICT_LABEL[verdict.verdict][lang]} — ${verdict.summary}`
  const lines = verdict.dimensions.map(d => `【${d.dimension}】${RESULT_LABEL[d.result][lang]} · ${d.evidence}`)
  return [head, ...lines].join('\n')
}

/** 创建带 TEXT_MESSAGE_* 事件的流式回调（A/B 两栏各一路） */
function makeStreamEmitter(runId: string, messageId: string): { onDelta: (delta: string) => void; end: () => void } {
  let started = false
  return {
    onDelta: (delta: string) => {
      if (!started) {
        started = true
        emitAgentEvent({ type: EventType.TEXT_MESSAGE_START, runId, messageId, role: 'assistant' })
      }
      emitAgentEvent({ type: EventType.TEXT_MESSAGE_CONTENT, runId, messageId, delta })
    },
    end: () => {
      if (started) emitAgentEvent({ type: EventType.TEXT_MESSAGE_END, runId, messageId })
    }
  }
}

/** 裁判盲版打分：随机决定哪侧叫「回答1」，拿到结论后映射回 A/B */
async function judgeBlind(
  instruction: string,
  bare: string,
  withSkill: string,
  config: import('../../src/contracts/ipc-types').LLMConfig,
  lang: Lang
): Promise<{ verdict: ValidationVerdict | null; diffSummary: string }> {
  const flip = Math.random() < 0.5
  // flip 时 回答1=B(带skill)、回答2=A(裸)；否则 回答1=A、回答2=B
  const answer1 = flip ? withSkill : bare
  const answer2 = flip ? bare : withSkill
  const validatePrompt = loadPrompt('validate.md') + languageDirective(lang)
  try {
    const diffResult = await callLLMEx({
      messages: [{ role: 'user', content: `Instruction: ${instruction}\n\nAnswer 1:\n${answer1}\n\nAnswer 2:\n${answer2}` }],
      systemPrompt: validatePrompt,
      config,
      timeout: 60000
    })
    const raw = parseJsonResponse(diffResult.content) as Partial<BlindJudge> | null
    if (!raw || !raw.betterOverall) {
      return { verdict: null, diffSummary: diffResult.content || mt('diffAnalysisFailed', lang) }
    }
    const verdict = mapBlindVerdict(raw as BlindJudge, flip, lang)
    return { verdict, diffSummary: verdictToText(verdict, lang) }
  } catch {
    return { verdict: null, diffSummary: mt('diffAnalysisFailed', lang) }
  }
}

/** 共享核心：跑 A/B 两侧 + 裁判，返回完整对比结果。stream 控制是否对页面发流式事件 */
async function runComparison(sceneId: string, instruction: string, stream: boolean): Promise<ValidationResult> {
  const config = resolveAgentLLMConfig('validate')
  if (!config) throw new Error(mt('configureLLMFirst'))

  const lang = getLanguage()
  const canvas = loadCanvas(sceneId)
  const skillMd = generateSkillMdFromCanvas(canvas)
  const control = { model: config.model, temperature: DEFAULT_TEMPERATURE }

  const runId = generateId()
  if (stream) emitAgentEvent({ type: EventType.RUN_STARTED, threadId: sceneId, runId, agent: 'validate' })

  try {
    const bareStream = stream ? makeStreamEmitter(runId, 'bare') : null
    const skillStream = stream ? makeStreamEmitter(runId, 'skill') : null

    const bareStart = Date.now()
    const barePromise = callLLMEx({
      messages: [{ role: 'user', content: instruction }],
      systemPrompt: 'You are a helpful assistant. Answer the following instruction directly.' + languageDirective(lang),
      config,
      timeout: 60000,
      onTextDelta: bareStream?.onDelta
    }).then(r => { bareStream?.end(); return { r, ms: Date.now() - bareStart } })

    const skillStart = Date.now()
    const skillPromise = callLLMEx({
      messages: [{ role: 'user', content: instruction }],
      systemPrompt: skillMd + languageDirective(lang),
      config,
      timeout: 60000,
      onTextDelta: skillStream?.onDelta
    }).then(r => { skillStream?.end(); return { r, ms: Date.now() - skillStart } })

    const [bareOut, skillOut] = await Promise.all([barePromise, skillPromise])
    const bare = bareOut.r.content
    const withSkill = skillOut.r.content

    const { verdict, diffSummary } = await judgeBlind(instruction, bare, withSkill, config, lang)

    if (stream) emitAgentEvent({ type: EventType.RUN_FINISHED, threadId: sceneId, runId })
    return {
      bare,
      withSkill,
      verdict,
      diffSummary,
      bareTokens: bareOut.r.usage,
      skillTokens: skillOut.r.usage,
      bareLatencyMs: bareOut.ms,
      skillLatencyMs: skillOut.ms,
      control
    }
  } catch (err) {
    if (stream) emitAgentEvent({ type: EventType.RUN_ERROR, runId, message: (err as Error).message })
    throw err
  }
}

/** 单条快速对比（流式，供页面底部输入框） */
export async function validationRun(sceneId: string, instruction: string): Promise<ValidationResult> {
  return runComparison(sceneId, instruction, true)
}

/** 测试集逐条跑（同样走流式，让 A/B 两栏实时显示当前用例；渲染端按序循环调用，天然遵守速率限制） */
export async function validationRunCase(sceneId: string, instruction: string): Promise<ValidationResult> {
  return runComparison(sceneId, instruction, true)
}

/** ✨ 一键生成测试集：验证智能体根据本 skill 内容生成约 10 条代表性测试指令 */
export async function generateTestCases(sceneId: string): Promise<string[]> {
  const config = resolveAgentLLMConfig('validate')
  if (!config) throw new Error(mt('configureLLMFirst'))

  const lang = getLanguage()
  const canvas = loadCanvas(sceneId)
  const skillMd = generateSkillMdFromCanvas(canvas)
  const prompt = loadPrompt('gen-testset.md') + languageDirective(lang)

  const result = await callLLMEx({
    messages: [{ role: 'user', content: `Skill content (SKILL.md):\n\n${skillMd}` }],
    systemPrompt: prompt,
    config,
    timeout: 60000
  })
  const parsed = parseJsonResponse(result.content) as { instructions?: unknown } | null
  const arr = Array.isArray(parsed?.instructions) ? parsed.instructions : []
  return arr.map(x => String(x).trim()).filter(s => s.length > 0).slice(0, 10)
}

function generateSkillMdFromCanvas(canvas: import('../../src/contracts/ipc-types').ExperienceCard): string {
  let md = '# Experience Skill\n\n'
  if (canvas.flows.length > 0) { md += '## Flows\n'; for (const f of canvas.flows) md += `### ${f.title}\n${f.content}\n\n` }
  if (canvas.rules.length > 0) { md += '## Rules\n'; for (const r of canvas.rules) md += `### ${r.title}\n${r.content}\n\n` }
  if (canvas.insights.length > 0) { md += '## Insights\n'; for (const i of canvas.insights) md += `### ${i.title}\n${i.content}\n\n` }
  if (canvas.concepts.length > 0) { md += '## Concepts\n'; for (const c of canvas.concepts) md += `### ${c.title}\n${c.content}\n\n` }
  if (canvas.relations.length > 0) { md += '## Relations\n'; for (const r of canvas.relations) md += `### ${r.title}\n${r.content}\n\n` }
  return md
}

export async function runReplay(sceneId: string, caseIds?: string[]): Promise<ReplayReport> {
  const config = resolveAgentLLMConfig('validate')
  if (!config) throw new Error(mt('configureLLMFirst'))

  const allCases = listTestCases(sceneId)
  const cases = caseIds && caseIds.length > 0
    ? allCases.filter(c => caseIds.includes(c.id))
    : allCases

  if (cases.length === 0) throw new Error(mt('noCasesToReplay'))

  const canvas = loadCanvas(sceneId)
  const skillMd = generateSkillMdFromCanvas(canvas)
  const scene = getScene(sceneId)
  const skillName = scene?.name ?? 'Unnamed Skill'
  const runAt = new Date().toISOString()
  const lang = getLanguage()

  const results: ReplayResult[] = []
  for (const testCase of cases) {
    const start = Date.now()
    try {
      const skillOut = await callLLMEx({
        config,
        systemPrompt: skillMd,
        messages: [{ role: 'user', content: testCase.instruction }]
      })
      const actualAnswer = skillOut.content
      const judgeOut = await judgeReplay(testCase, actualAnswer, config, lang)
      results.push({
        caseId: testCase.id,
        instruction: testCase.instruction,
        expectedAnswer: testCase.expectedAnswer,
        actualAnswer,
        hit: judgeOut.hit,
        reason: judgeOut.reason,
        judgeModel: config.model,
        latencyMs: Date.now() - start,
        tokens: skillOut.usage
      })
    } catch (err) {
      log.error(`Replay case failed: ${testCase.id}`, err)
      results.push({
        caseId: testCase.id,
        instruction: testCase.instruction,
        expectedAnswer: testCase.expectedAnswer,
        actualAnswer: '',
        hit: false,
        reason: `运行失败: ${err instanceof Error ? err.message : String(err)}`,
        judgeModel: config.model,
        latencyMs: Date.now() - start
      })
    }
  }

  return buildReplayReport(sceneId, skillName, runAt, results)
}

async function judgeReplay(
  testCase: TestCase,
  actualAnswer: string,
  config: NonNullable<ReturnType<typeof resolveAgentLLMConfig>>,
  lang: Lang
): Promise<{ hit: boolean; reason: string }> {
  if (!testCase.expectedAnswer || testCase.expectedAnswer.trim().length === 0) {
    return { hit: false, reason: '未提供专家期望结论，跳过命中判断' }
  }
  const prompt = loadPrompt('replay-judge.md')
    .replace('{instruction}', testCase.instruction)
    .replace('{expected_answer}', testCase.expectedAnswer)
    .replace('{actual_answer}', actualAnswer)
    + languageDirective(lang)
  const out = await callLLMEx({
    config,
    systemPrompt: '',
    messages: [{ role: 'user', content: prompt }]
  })
  const parsed = parseJsonResponse(out.content) as { hit: boolean; reason: string } | null
  return {
    hit: parsed?.hit === true,
    reason: parsed?.reason ?? '无裁判理由'
  }
}

function buildReplayReport(
  sceneId: string,
  skillName: string,
  runAt: string,
  results: ReplayResult[]
): ReplayReport {
  const totalCases = results.length
  const hitCount = results.filter(r => r.hit).length
  const missCount = totalCases - hitCount
  const hitRate = totalCases > 0 ? hitCount / totalCases : 0

  const byDifficulty: ReplayReport['byDifficulty'] = {}
  const byConfidence: ReplayReport['byConfidence'] = {}

  for (const r of results) {
    const tc = getTestCase(r.caseId)
    const diff = tc?.difficulty ?? 'unspecified'
    const conf = tc?.confidence ?? 'unspecified'
    byDifficulty[diff] = byDifficulty[diff] ?? { total: 0, hit: 0, rate: 0 }
    byDifficulty[diff].total += 1
    if (r.hit) byDifficulty[diff].hit += 1
    byConfidence[conf] = byConfidence[conf] ?? { total: 0, hit: 0, rate: 0 }
    byConfidence[conf].total += 1
    if (r.hit) byConfidence[conf].hit += 1
  }

  for (const k of Object.keys(byDifficulty)) {
    const v = byDifficulty[k]
    v.rate = v.total > 0 ? v.hit / v.total : 0
  }
  for (const k of Object.keys(byConfidence)) {
    const v = byConfidence[k]
    v.rate = v.total > 0 ? v.hit / v.total : 0
  }

  return {
    sceneId,
    skillName,
    runAt,
    totalCases,
    hitCount,
    missCount,
    hitRate,
    byDifficulty,
    byConfidence,
    results
  }
}
