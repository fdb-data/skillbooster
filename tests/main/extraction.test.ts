import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

vi.mock('../../electron/main/llm', () => ({
  callLLM: vi.fn().mockResolvedValue('plain reply'),
  callLLMEx: vi.fn().mockResolvedValue({ content: 'Extraction reply', toolCalls: [] }),
  testConnection: vi.fn().mockResolvedValue({ success: true }),
  LLMError: class extends Error { code = 'LLM_ERROR' }
}))

vi.mock('../../electron/main/store', () => ({
  getLLMConfig: vi.fn().mockReturnValue({ provider: 'custom', apiKey: 'test-key', model: 'test-model', baseUrl: 'https://api.test.com/v1' }),
  resolveAgentLLMConfig: vi.fn().mockReturnValue({ provider: 'custom', apiKey: 'test-key', model: 'test-model', baseUrl: 'https://api.test.com/v1' }),
  listConversation: vi.fn().mockReturnValue([]),
  addConversationMessage: vi.fn(),
  listReferences: vi.fn().mockReturnValue([{ id: 'r1', filename: 'doc.txt', storedPath: '/tmp/doc.txt', extractedText: 'Some content', includeInPackage: true }]),
  loadCanvas: vi.fn().mockReturnValue({ flows: [], rules: [], insights: [], concepts: [], relations: [] }),
  saveCanvas: vi.fn(),
  getPreference: vi.fn().mockReturnValue(null),
  setPreference: vi.fn()
}))

vi.mock('fs', () => ({
  default: { existsSync: vi.fn().mockReturnValue(true), readFileSync: vi.fn().mockReturnValue('# SKILL\nYou are an extractor.') },
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('# SKILL\nYou are an extractor.')
}))

import { runTurn, draftFromDocs, buildGapSummary, buildCanvasOutline } from '../../electron/main/extraction'
import { callLLMEx } from '../../electron/main/llm'

describe('Extraction - runTurn', () => {
  beforeEach(() => {
    vi.mocked(callLLMEx).mockReset()
    vi.mocked(callLLMEx).mockResolvedValue({ content: 'Extraction reply', toolCalls: [] })
  })

  it('should return reply, canvasUpdates, and proposals', async () => {
    const result = await runTurn('scene-1', 'Tell me about testing')
    expect(result.reply).toBe('Extraction reply')
    expect(Array.isArray(result.canvasUpdates)).toBe(true)
    expect(Array.isArray(result.proposals)).toBe(true)
  })

  it('should execute canvas_add tool calls and collect updates', async () => {
    vi.mocked(callLLMEx)
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 't1', name: 'canvas_add', arguments: JSON.stringify({ type: 'flow', title: 'Step 1', content: 'Do something', evidenceLevel: 'validated' }) },
          { id: 't2', name: 'propose', arguments: JSON.stringify({ type: 'rule', title: 'Rule 1', content: 'Always check inputs' }) }
        ]
      })
      .mockResolvedValueOnce({ content: '已添加 1 条流程，另有 1 条提议', toolCalls: [] })

    const result = await runTurn('scene-1', 'We always do step 1 first')
    expect(result.canvasUpdates).toHaveLength(1)
    expect(result.canvasUpdates[0].type).toBe('flow')
    expect(result.canvasUpdates[0].action).toBe('add')
    expect(result.canvasUpdates[0].entry.title).toBe('Step 1')
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].title).toBe('Rule 1')
    expect(result.reply).toContain('提议')
  })

  it('should throw when no LLM config', async () => {
    const store = await import('../../electron/main/store')
    vi.mocked(store.resolveAgentLLMConfig).mockReturnValueOnce(null)
    await expect(runTurn('scene-1', 'test')).rejects.toThrow()
  })
})

describe('Extraction - draftFromDocs', () => {
  beforeEach(() => {
    vi.mocked(callLLMEx).mockReset()
    vi.mocked(callLLMEx).mockResolvedValue({ content: 'Draft ready', toolCalls: [] })
  })

  it('should return opening message and canvas updates', async () => {
    const result = await draftFromDocs('scene-1')
    expect(result.openingMessage).toBe('Draft ready')
    expect(Array.isArray(result.canvasUpdates)).toBe(true)
  })
})

describe('Extraction - gap summary', () => {
  it('should report missing types', () => {
    const canvas = { flows: [], rules: [], insights: [], concepts: [], relations: [] }
    const summary = buildGapSummary(canvas)
    expect(summary).toContain('Missing categories')
    expect(summary).toContain('Flow')
  })

  it('should list exploratory entries', () => {
    const entry = { id: 'e1', title: '某假设', content: 'x', verified: false, evidenceLevel: 'exploratory' as const, createdAt: '', updatedAt: '' }
    const canvas = { flows: [entry], rules: [], insights: [], concepts: [], relations: [] }
    const summary = buildGapSummary(canvas)
    expect(summary).toContain('Exploratory entries')
    expect(summary).toContain('某假设')
  })
})

describe('Extraction - canvas outline', () => {
  it('should include entry ids for agent targeting', () => {
    const entry = { id: 'abc-123', title: '步骤一', content: '内容', verified: false, createdAt: '', updatedAt: '' }
    const canvas = { flows: [entry], rules: [], insights: [], concepts: [], relations: [] }
    const outline = buildCanvasOutline(canvas)
    expect(outline).toContain('[abc-123]')
    expect(outline).toContain('步骤一')
  })
})
