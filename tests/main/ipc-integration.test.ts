import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('IPC Integration - Scene Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create scene, add reference, and list scenes', async () => {
    const createResult = await window.api.scenes.create({ name: 'IPC Test Scene' })
    expect(createResult.success).toBe(true)
    expect(createResult.data).toBeDefined()
    expect(createResult.data!.name).toBe('IPC Test Scene')
  })

  it('should get scene by id', async () => {
    const result = await window.api.scenes.get('test-scene')
    expect(result.success).toBe(true)
  })

  it('should update scene', async () => {
    const result = await window.api.scenes.update('test-scene', { name: 'Updated' })
    expect(result.success).toBe(true)
  })

  it('should delete scene', async () => {
    const result = await window.api.scenes.delete('test-scene')
    expect(result.success).toBe(true)
  })
})

describe('IPC Integration - Reference Operations', () => {
  it('should add reference', async () => {
    const result = await window.api.references.add('scene-1', '/path/to/file.txt')
    expect(result.success).toBe(true)
    expect(result.data!.filename).toBe('test.txt')
  })

  it('should list references', async () => {
    const result = await window.api.references.list('scene-1')
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  it('should remove reference', async () => {
    const result = await window.api.references.remove('scene-1', 'ref-1')
    expect(result.success).toBe(true)
  })
})

describe('IPC Integration - Attachment Operations', () => {
  it('should add a script attachment', async () => {
    const result = await window.api.attachments.add('scene-1', 'script', '/path/to/run.py')
    expect(result.success).toBe(true)
    expect(result.data!.kind).toBe('script')
  })

  it('should list attachments by kind', async () => {
    const result = await window.api.attachments.list('scene-1', 'asset')
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  it('should toggle include flag', async () => {
    const result = await window.api.attachments.setInclude('scene-1', 'att-1', false)
    expect(result.success).toBe(true)
  })

  it('should open an attachment', async () => {
    const result = await window.api.attachments.open('scene-1', 'att-1')
    expect(result.success).toBe(true)
  })

  it('should remove an attachment', async () => {
    const result = await window.api.attachments.remove('scene-1', 'att-1')
    expect(result.success).toBe(true)
  })
})

describe('IPC Integration - Guide Agent', () => {
  it('should run guide turn', async () => {
    const result = await window.api.guide.runTurn('scene-1', 'I want to test')
    expect(result.success).toBe(true)
    expect(result.data!.reply).toBeDefined()
    expect(Array.isArray(result.data!.options)).toBe(true)
  })
})

describe('IPC Integration - Extraction Agent', () => {
  it('should run extraction turn', async () => {
    const result = await window.api.extraction.runTurn('scene-1', 'Extract this')
    expect(result.success).toBe(true)
    expect(result.data!.reply).toBeDefined()
  })

  it('should draft from docs', async () => {
    const result = await window.api.extraction.draftFromDocs('scene-1')
    expect(result.success).toBe(true)
    expect(result.data!.openingMessage).toBeDefined()
  })
})

describe('IPC Integration - Validation Agent', () => {
  it('should run validation', async () => {
    const result = await window.api.validation.run('scene-1', 'Test instruction')
    expect(result.success).toBe(true)
    expect(result.data!.bare).toBeDefined()
    expect(result.data!.withSkill).toBeDefined()
    expect(result.data!.diffSummary).toBeDefined()
  })
})

describe('IPC Integration - Validation Replay Cases', () => {
  it('should add a replay case', async () => {
    const result = await window.api.validation.addCase('scene-1', { instruction: 'Test case' })
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.instruction).toBe('Test case')
  })

  it('should update a replay case', async () => {
    const result = await window.api.validation.updateCase('scene-1', 'case-1', { instruction: 'Updated case' })
    expect(result.success).toBe(true)
    expect(result.data!.instruction).toBe('Updated case')
  })

  it('should delete a replay case', async () => {
    const result = await window.api.validation.deleteCase('scene-1', 'case-1')
    expect(result.success).toBe(true)
    expect(result.data!.success).toBe(true)
  })

  it('should run replay for all cases', async () => {
    const result = await window.api.validation.runReplay('scene-1')
    expect(result.success).toBe(true)
    expect(result.data!.totalCases).toBeDefined()
    expect(result.data!.hitRate).toBeDefined()
  })

  it('should run replay with caseIds filter', async () => {
    const result = await window.api.validation.runReplay('scene-1', ['case-1'])
    expect(result.success).toBe(true)
    expect(result.data!.totalCases).toBeDefined()
  })
})

describe('IPC Integration - Canvas', () => {
  it('should update canvas', async () => {
    const result = await window.api.canvas.update('scene-1', { flows: [], rules: [], insights: [], concepts: [], relations: [] })
    expect(result.success).toBe(true)
  })
})

describe('IPC Integration - Export', () => {
  it('should health check', async () => {
    const result = await window.api.export.healthCheck('scene-1')
    expect(result.success).toBe(true)
    expect(result.data!.passed).toBe(true)
  })

  it('should build package', async () => {
    const result = await window.api.export.buildPackage('scene-1')
    expect(result.success).toBe(true)
    expect(result.data!.filePath).toBeDefined()
  })
})

describe('IPC Integration - Settings', () => {
  it('should get LLM config', async () => {
    const result = await window.api.settings.getLLM()
    expect(result.success).toBe(true)
  })

  it('should set LLM config', async () => {
    const result = await window.api.settings.setLLM({ provider: 'custom', apiKey: 'key', model: 'model' })
    expect(result.success).toBe(true)
  })

  it('should test connection', async () => {
    const result = await window.api.settings.testConnection({ provider: 'custom', apiKey: 'key', model: 'model' })
    expect(result.success).toBe(true)
  })

  it('should get agent configs', async () => {
    const result = await window.api.settings.getAgentConfigs()
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  it('should save agent config', async () => {
    const result = await window.api.settings.saveAgentConfig({ agentKey: 'guide', provider: 'custom', apiKey: 'k', model: 'm' })
    expect(result.success).toBe(true)
  })

  it('should open prompt file', async () => {
    const result = await window.api.settings.openPromptFile('agents/guide.md')
    expect(result.success).toBe(true)
  })
})