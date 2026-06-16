import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

vi.mock('../../electron/main/llm', () => ({
  callLLM: vi.fn().mockResolvedValue('plain reply'),
  callLLMEx: vi.fn().mockResolvedValue({ content: 'Guide reply', toolCalls: [] }),
  testConnection: vi.fn().mockResolvedValue({ success: true }),
  DEFAULT_TEMPERATURE: 0.7,
  LLMError: class extends Error { code = 'LLM_ERROR' }
}))

vi.mock('../../electron/main/store', () => ({
  getLLMConfig: vi.fn().mockReturnValue({ provider: 'custom', apiKey: 'test-key', model: 'test-model', baseUrl: 'https://api.test.com/v1' }),
  resolveAgentLLMConfig: vi.fn().mockReturnValue({ provider: 'custom', apiKey: 'test-key', model: 'test-model', baseUrl: 'https://api.test.com/v1' }),
  listConversation: vi.fn().mockReturnValue([]),
  addConversationMessage: vi.fn(),
  listGuideMessages: vi.fn().mockReturnValue([]),
  saveGuideMessages: vi.fn(),
  listReferences: vi.fn().mockReturnValue([]),
  loadCanvas: vi.fn().mockReturnValue({ flows: [], rules: [], insights: [], concepts: [], relations: [] }),
  getAgentConfig: vi.fn().mockReturnValue(null),
  getPreference: vi.fn().mockReturnValue(null),
  setPreference: vi.fn()
}))

vi.mock('fs', () => ({
  default: { existsSync: vi.fn().mockReturnValue(true), readFileSync: vi.fn().mockReturnValue('# Guide Prompt\nYou are a guide.') },
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('# Guide Prompt\nYou are a guide.')
}))

import { guideRunTurn, validationRun, resolveSkillResult, resolveOverallVerdict, remapBlindLabels, mapBlindVerdict } from '../../electron/main/agents'
import { callLLMEx } from '../../electron/main/llm'

describe('Agents - guideRunTurn', () => {
  beforeEach(() => {
    vi.mocked(callLLMEx).mockReset()
    vi.mocked(callLLMEx).mockResolvedValue({ content: 'Guide reply', toolCalls: [] })
  })

  it('should return structured guide result', async () => {
    const result = await guideRunTurn('scene-1', 'I want to extract testing experience')
    expect(result.reply).toBeDefined()
    expect(typeof result.reply).toBe('string')
    expect(Array.isArray(result.options)).toBe(true)
    expect(result.sceneDraft).toBeDefined()
    expect(typeof result.done).toBe('boolean')
  })

  it('should apply update_scene and ask_user tool calls', async () => {
    vi.mocked(callLLMEx).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        { id: 't1', name: 'update_scene', arguments: JSON.stringify({ name: '供应商初审', protagonist: '采购员', projectName: '供应商资质初审' }) },
        { id: 't2', name: 'ask_user', arguments: JSON.stringify({ question: '什么时机触发？', options: ['收到报价时', '签约前', '其他 · 直接说'] }) }
      ]
    })

    const result = await guideRunTurn('scene-1', '我想萃取供应商审核经验')
    expect(result.reply).toBe('什么时机触发？')
    expect(result.options).toEqual(['收到报价时', '签约前', '其他 · 直接说'])
    expect(result.sceneDraft.name).toBe('供应商初审')
    expect(result.sceneDraft.protagonist).toBe('采购员')
    expect(result.projectName).toBe('供应商资质初审')
    expect(result.done).toBe(false)
  })

  it('should throw when no LLM config', async () => {
    const store = await import('../../electron/main/store')
    vi.mocked(store.resolveAgentLLMConfig).mockReturnValueOnce(null)
    await expect(guideRunTurn('scene-1', 'test')).rejects.toThrow('LLM')
  })
})

describe('Agents - blind verdict mapping', () => {
  // 这是本任务最隐蔽的坑：盲标签 → A/B 映射写反会把胜负判反
  it('resolveSkillResult: flip=false → answer2 is skill', () => {
    expect(resolveSkillResult('answer2', false)).toBe('win')  // 带skill那侧更好
    expect(resolveSkillResult('answer1', false)).toBe('loss') // 裸模型更好
    expect(resolveSkillResult('tie', false)).toBe('tie')
  })

  it('resolveSkillResult: flip=true → answer1 is skill', () => {
    expect(resolveSkillResult('answer1', true)).toBe('win')
    expect(resolveSkillResult('answer2', true)).toBe('loss')
    expect(resolveSkillResult('tie', true)).toBe('tie')
  })

  it('resolveOverallVerdict maps correctly under both flips', () => {
    expect(resolveOverallVerdict('answer2', false)).toBe('helpful')
    expect(resolveOverallVerdict('answer1', false)).toBe('worse')
    expect(resolveOverallVerdict('tie', false)).toBe('no_difference')
    expect(resolveOverallVerdict('answer1', true)).toBe('helpful')
    expect(resolveOverallVerdict('answer2', true)).toBe('worse')
  })

  it('remapBlindLabels: [1]/[2] → A/B respecting flip', () => {
    // flip=false: [1]=A(裸), [2]=B(带skill)
    expect(remapBlindLabels('[2] used rule X; [1] missed Y', false, 'en'))
      .toBe('B (with Skill) used rule X; A (bare model) missed Y')
    // flip=true: [1]=B(带skill), [2]=A(裸)
    expect(remapBlindLabels('[1] used rule X; [2] missed Y', true, 'en'))
      .toBe('B (with Skill) used rule X; A (bare model) missed Y')
  })

  it('mapBlindVerdict: a winning skill answer maps to helpful + win regardless of flip', () => {
    const raw = {
      betterOverall: 'answer1' as const,
      summary: '[1] better',
      dimensions: [{ dimension: 'Professional judgment', better: 'answer1' as const, evidence: '[1] applied rule' }]
    }
    // flip=true → answer1 是带skill → helpful / win
    const v = mapBlindVerdict(raw, true, 'en')
    expect(v.verdict).toBe('helpful')
    expect(v.dimensions[0].result).toBe('win')
    expect(v.dimensions[0].evidence).toContain('B (with Skill)')
    // flip=false → answer1 是裸模型 → worse / loss
    const v2 = mapBlindVerdict(raw, false, 'en')
    expect(v2.verdict).toBe('worse')
    expect(v2.dimensions[0].result).toBe('loss')
  })
})

describe('Agents - validationRun', () => {
  beforeEach(() => {
    vi.mocked(callLLMEx).mockReset()
  })

  it('should return bare, withSkill, and a mapped verdict', async () => {
    const judge = JSON.stringify({
      betterOverall: 'answer1',
      summary: '[1] vs [2]',
      dimensions: [
        { dimension: 'Professional judgment', better: 'answer1', evidence: '[1] cited a rule' },
        { dimension: 'Actionability', better: 'tie', evidence: 'both similar' }
      ]
    })
    vi.mocked(callLLMEx)
      .mockResolvedValueOnce({ content: 'bare response', toolCalls: [], usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } })
      .mockResolvedValueOnce({ content: 'skill response', toolCalls: [], usage: { promptTokens: 40, completionTokens: 25, totalTokens: 65 } })
      .mockResolvedValueOnce({ content: judge, toolCalls: [] })

    const result = await validationRun('scene-1', 'How to test React components?')
    expect(result.bare).toBe('bare response')
    expect(result.withSkill).toBe('skill response')
    expect(result.verdict).not.toBeNull()
    expect(result.verdict!.dimensions.length).toBe(2)
    expect(result.skillTokens?.totalTokens).toBe(65)
    expect(result.control.model).toBe('test-model')
  })

  it('should return null verdict (with fallback text) when judge JSON is unparseable', async () => {
    vi.mocked(callLLMEx)
      .mockResolvedValueOnce({ content: 'bare response', toolCalls: [] })
      .mockResolvedValueOnce({ content: 'skill response', toolCalls: [] })
      .mockResolvedValueOnce({ content: 'not json at all', toolCalls: [] })

    const result = await validationRun('scene-1', 'test')
    expect(result.verdict).toBeNull()
    expect(result.diffSummary).toBe('not json at all')
  })
})
