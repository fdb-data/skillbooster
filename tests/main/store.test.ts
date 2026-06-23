import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/skillbooster') },
  ipcMain: { handle: vi.fn() }
}))

vi.mock('better-sqlite3', () => {
  let _data: Record<string, any[]> = {}
  const mockPrepare = vi.fn((sql: string) => {
    return {
      run: vi.fn((...args: any[]) => {
        if (sql.includes('INSERT INTO scenes')) {
          _data.scenes = _data.scenes || []
          _data.scenes.push({ id: args[0], name: args[1], status: args[2], created_at: args[3], updated_at: args[4] })
        }
        if (sql.includes('UPDATE scenes')) {
          if (_data.scenes) {
            const idx = _data.scenes.findIndex((s: any) => s.id === args[3])
            if (idx >= 0) _data.scenes[idx] = { ..._data.scenes[idx], name: args[0], status: args[1], updated_at: args[2] }
          }
        }
        if (sql.includes('DELETE FROM scenes')) {
          if (_data.scenes) {
            _data.scenes = _data.scenes.filter((s: any) => s.id !== args[0])
          }
        }
        if (sql.includes('INSERT INTO llm_config')) {
          _data.llm_config = [{ id: 1, provider: args[0], api_key: args[1], model: args[2], base_url: args[3], updated_at: args[4] }]
        }
        if (sql.includes('UPDATE llm_config')) {
          if (_data.llm_config) { _data.llm_config[0] = { ..._data.llm_config[0], provider: args[0], api_key: args[1], model: args[2], base_url: args[3], updated_at: args[4] } }
        }
        if (sql.includes('INSERT INTO agent_config')) {
          _data.agent_config = _data.agent_config || []
          _data.agent_config.push({ agent_key: args[0], provider: args[1], api_key: args[2], model: args[3], base_url: args[4], updated_at: args[5] })
        }
        if (sql.includes('UPDATE agent_config')) {
          if (_data.agent_config) {
            const idx = _data.agent_config.findIndex((a: any) => a.agent_key === args[5])
            if (idx >= 0) _data.agent_config[idx] = { ..._data.agent_config[idx], provider: args[0], api_key: args[1], model: args[2], base_url: args[3], updated_at: args[4] }
          }
        }
        if (sql.includes('DELETE FROM llm_provider')) {
          _data.llm_provider = []
        }
        if (sql.includes('INSERT INTO llm_provider')) {
          _data.llm_provider = _data.llm_provider || []
          _data.llm_provider.push({ id: args[0], name: args[1], base_url: args[2], api_key: args[3], models: args[4], sort_order: args[5], updated_at: args[6] })
        }
        if (sql.includes('INSERT INTO test_cases')) {
          _data.test_cases = _data.test_cases || []
          _data.test_cases.push({
            id: args[0], scene_id: args[1], instruction: args[2], expected_answer: args[3],
            source_reference_ids: args[4], difficulty: args[5], confidence: args[6],
            tags: args[7], notes: args[8], sort_order: args[9], created_at: args[10], updated_at: args[11]
          })
        }
        if (sql.includes('UPDATE test_cases')) {
          if (_data.test_cases) {
            const idx = _data.test_cases.findIndex((c: any) => c.id === args[args.length - 1])
            if (idx >= 0) {
              const updated = { ..._data.test_cases[idx] }
              const setSql = sql.replace(/UPDATE test_cases SET /i, '')
              const setParts = setSql.split(' WHERE ')[0].split(',').map((s: string) => s.trim())
              setParts.forEach((part: string, i: number) => {
                const col = part.split(' = ')[0]
                if (col === 'expected_answer') updated.expected_answer = args[i]
                else if (col === 'source_reference_ids') updated.source_reference_ids = args[i]
                else if (col === 'sort_order') updated.sort_order = args[i]
                else if (col === 'updated_at') updated.updated_at = args[i]
                else updated[col] = args[i]
              })
              _data.test_cases[idx] = updated
            }
          }
        }
        if (sql.includes('DELETE FROM test_cases')) {
          if (_data.test_cases) {
            if (sql.includes('scene_id = ?')) {
              _data.test_cases = _data.test_cases.filter((c: any) => c.scene_id !== args[0])
            } else {
              _data.test_cases = _data.test_cases.filter((c: any) => c.id !== args[0])
            }
          }
        }
      }),
      get: vi.fn((...args: any[]) => {
        if (sql.includes('SELECT') && sql.includes('scenes') && sql.includes('WHERE')) {
          return _data.scenes?.find((s: any) => s.id === args[0])
        }
        if (sql.includes('SELECT id FROM llm_config')) {
          return _data.llm_config?.[0]
        }
        if (sql.includes('SELECT id FROM agent_config')) {
          return _data.agent_config?.find((a: any) => a.agent_key === args[0])
        }
        if (sql.includes('llm_config') && sql.includes('WHERE id = 1')) {
          return _data.llm_config?.[0]
        }
        if (sql.includes('agent_config') && sql.includes('WHERE agent_key')) {
          return _data.agent_config?.find((a: any) => a.agent_key === args[0])
        }
        if (sql.includes('test_cases') && sql.includes('WHERE id = ?')) {
          return _data.test_cases?.find((c: any) => c.id === args[0])
        }
        return undefined
      }),
      all: vi.fn((..._args: any[]) => {
        if (sql.includes('SELECT') && sql.includes('scenes') && !sql.includes('WHERE')) {
          return _data.scenes || []
        }
        if (sql.includes('SELECT') && sql.includes('agent_config') && !sql.includes('WHERE')) {
          return _data.agent_config || []
        }
        if (sql.includes('references') && sql.includes('scene_id')) {
          return []
        }
        if (sql.includes('conversations') && sql.includes('scene_id')) {
          return []
        }
        if (sql.includes('llm_provider')) {
          return _data.llm_provider || []
        }
        if (sql.includes('test_cases') && sql.includes('WHERE scene_id = ?') && sql.includes('ORDER BY')) {
          return (_data.test_cases || [])
            .filter((c: any) => c.scene_id === _args[0])
            .sort((a: any, b: any) => {
              if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
              return a.created_at.localeCompare(b.created_at)
            })
        }
        if (sql.includes('PRAGMA table_info(test_cases)')) {
          return [
            { name: 'id' }, { name: 'scene_id' }, { name: 'instruction' }, { name: 'expected_answer' },
            { name: 'source_reference_ids' }, { name: 'difficulty' }, { name: 'confidence' },
            { name: 'tags' }, { name: 'notes' }, { name: 'sort_order' },
            { name: 'created_at' }, { name: 'updated_at' }
          ]
        }
        if (sql.includes('PRAGMA table_info(conversations)')) {
          return [
            { name: 'id' }, { name: 'scene_id' }, { name: 'role' },
            { name: 'content' }, { name: 'created_at' }, { name: 'options' }
          ]
        }
        return []
      })
    }
  })
  const mockDb = {
    pragma: vi.fn(),
    exec: vi.fn(() => { _data = {} }),
    prepare: mockPrepare,
    transaction: vi.fn((fn: (...args: any[]) => any) => fn),
    close: vi.fn()
  }
  return { default: vi.fn().mockReturnValue(mockDb) }
})

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('fs', () => {
  const _files: Record<string, string> = {}
  return {
    default: {
      existsSync: vi.fn((p: string) => p in _files),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn((p: string, data: string) => { _files[p] = data }),
      readFileSync: vi.fn((p: string) => _files[p] ?? '{}'),
      unlinkSync: vi.fn((p: string) => { delete _files[p] }),
      rmSync: vi.fn(),
      copyFileSync: vi.fn()
    },
    existsSync: vi.fn((p: string) => p in _files),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((p: string, data: string) => { _files[p] = data }),
    readFileSync: vi.fn((p: string) => _files[p] ?? '{}'),
    unlinkSync: vi.fn((p: string) => { delete _files[p] }),
    rmSync: vi.fn(),
    copyFileSync: vi.fn()
  }
})

import Database from 'better-sqlite3'
import * as store from '../../electron/main/store'

describe('Store - Scene CRUD', () => {
  beforeEach(() => {
    try { store.initDatabase() } catch {}
  })

  it('should create and list scenes', () => {
    store.createScene('scene-1', 'Test Scene')
    const scenes = store.listScenes()
    expect(scenes.length).toBeGreaterThanOrEqual(1)
    expect(scenes.some(s => s.id === 'scene-1')).toBe(true)
  })

  it('should get a scene by id', () => {
    store.createScene('scene-2', 'Get Test')
    const scene = store.getScene('scene-2')
    expect(scene).toBeDefined()
    expect(scene?.name).toBe('Get Test')
  })

  it('should update scene name', () => {
    store.createScene('scene-3', 'Old Name')
    store.updateScene('scene-3', { name: 'New Name' })
    const scene = store.getScene('scene-3')
    expect(scene?.name).toBe('New Name')
  })

  it('should delete a scene', () => {
    store.createScene('scene-4', 'To Delete')
    store.deleteScene('scene-4')
    const scene = store.getScene('scene-4')
    expect(scene).toBeUndefined()
  })
})

describe('Store - LLM Config', () => {
  beforeEach(() => {
    try { store.initDatabase() } catch {}
  })

  it('should return null when no config exists', () => {
    const config = store.getLLMConfig()
    expect(config).toBeNull()
  })

  it('should save and retrieve LLM config', () => {
    store.saveAllLLMProviders([{ id: '1', name: 'Custom', baseUrl: 'https://api.test.com/v1', apiKey: 'test-key', models: ['test-model'] }])
    const config = store.getLLMConfig()
    expect(config).not.toBeNull()
    expect(config?.provider).toBe('custom')
    expect(config?.apiKey).toBe('test-key')
    expect(config?.model).toBe('test-model')
  })

  it('should update existing config', () => {
    store.saveAllLLMProviders([{ id: '1', name: 'OpenAI', baseUrl: '', apiKey: 'key1', models: ['gpt-4'] }])
    store.saveAllLLMProviders([{ id: '1', name: 'Custom', baseUrl: 'https://api.test.com', apiKey: 'key2', models: ['deepseek'] }])
    const config = store.getLLMConfig()
    expect(config?.provider).toBe('custom')
    expect(config?.apiKey).toBe('key2')
  })
})

describe('Store - Agent Config', () => {
  beforeEach(() => {
    try { store.initDatabase() } catch {}
  })

  it('should return null for non-existent agent config', () => {
    const config = store.getAgentConfig('nonexistent')
    expect(config).toBeNull()
  })

  it('should save and retrieve agent config', () => {
    store.saveAgentConfig({ agentKey: 'guide', provider: 'custom', apiKey: 'key1', model: 'model-1', baseUrl: 'https://api.test.com' })
    const config = store.getAgentConfig('guide')
    expect(config).not.toBeNull()
    expect(config?.agentKey).toBe('guide')
    expect(config?.model).toBe('model-1')
  })

  it('should list all agent configs', () => {
    store.saveAgentConfig({ agentKey: 'guide', provider: 'custom', apiKey: 'k1', model: 'm1' })
    store.saveAgentConfig({ agentKey: 'validate', provider: 'openai', apiKey: 'k2', model: 'm2' })
    const configs = store.getAllAgentConfigs()
    expect(configs.length).toBeGreaterThanOrEqual(2)
  })

  it('should update existing agent config', () => {
    store.saveAgentConfig({ agentKey: 'extract', provider: 'custom', apiKey: 'k1', model: 'm1' })
    store.saveAgentConfig({ agentKey: 'extract', provider: 'openai', apiKey: 'k2', model: 'm2' })
    const config = store.getAgentConfig('extract')
    expect(config?.provider).toBe('openai')
    expect(config?.model).toBe('m2')
  })
})

describe('Store - Canvas', () => {
  it('should save and load canvas', () => {
    const canvas = { flows: [{ id: 'f1', title: 'Flow 1', content: 'Content', verified: false, source: 'user' as const, createdAt: '', updatedAt: '' }], rules: [], insights: [], concepts: [], relations: [] }
    store.saveCanvas('scene-canvas', canvas)
    const loaded = store.loadCanvas('scene-canvas')
    expect(loaded.flows.length).toBe(1)
    expect(loaded.flows[0].title).toBe('Flow 1')
  })

  it('should return empty card for non-existent canvas', () => {
    const loaded = store.loadCanvas('nonexistent')
    expect(loaded.flows.length).toBe(0)
    expect(loaded.rules.length).toBe(0)
  })
})

describe('Store - Test Cases CRUD', () => {
  beforeEach(() => {
    try { store.initDatabase() } catch {}
    store.createScene('scene-cases', 'Test Cases Scene')
  })

  it('should add and get a test case with full fields', () => {
    const c = store.addTestCase('scene-cases', {
      instruction: 'How do I handle refund?',
      expectedAnswer: 'Approve if within 7 days',
      sourceReferenceIds: ['ref-1'],
      difficulty: 'medium',
      confidence: 'high',
      tags: 'refund,policy',
      notes: 'Key case',
      sortOrder: 1
    })
    expect(c.id).toBeDefined()
    expect(c.sceneId).toBe('scene-cases')
    expect(c.instruction).toBe('How do I handle refund?')
    expect(c.expectedAnswer).toBe('Approve if within 7 days')
    expect(c.sourceReferenceIds).toEqual(['ref-1'])
    expect(c.difficulty).toBe('medium')
    expect(c.confidence).toBe('high')
    expect(c.tags).toBe('refund,policy')
    expect(c.notes).toBe('Key case')
    expect(c.sortOrder).toBe(1)
    expect(c.createdAt).toBeDefined()

    const fetched = store.getTestCase(c.id)
    expect(fetched).toEqual(c)
  })

  it('should list test cases ordered by sort_order', () => {
    store.addTestCase('scene-cases', { instruction: 'Second', sortOrder: 2 })
    store.addTestCase('scene-cases', { instruction: 'First', sortOrder: 1 })
    const list = store.listTestCases('scene-cases')
    expect(list.length).toBe(2)
    expect(list[0].instruction).toBe('First')
    expect(list[1].instruction).toBe('Second')
  })

  it('should update a test case', () => {
    const c = store.addTestCase('scene-cases', { instruction: 'Original' })
    const updated = store.updateTestCase('scene-cases', c.id, {
      instruction: 'Updated',
      expectedAnswer: 'New answer',
      difficulty: 'hard',
      confidence: 'low',
      sortOrder: 5
    })
    expect(updated.instruction).toBe('Updated')
    expect(updated.expectedAnswer).toBe('New answer')
    expect(updated.difficulty).toBe('hard')
    expect(updated.confidence).toBe('low')
    expect(updated.sortOrder).toBe(5)
    expect(updated.updatedAt).toBeDefined()
  })

  it('should delete a test case', () => {
    const c = store.addTestCase('scene-cases', { instruction: 'To delete' })
    store.deleteTestCase('scene-cases', c.id)
    expect(store.getTestCase(c.id)).toBeUndefined()
    expect(store.listTestCases('scene-cases')).toHaveLength(0)
  })

  it('should reject update/delete for wrong scene', () => {
    store.createScene('other-scene', 'Other')
    const c = store.addTestCase('scene-cases', { instruction: 'Mine' })
    expect(() => store.updateTestCase('other-scene', c.id, { instruction: 'Hacked' })).toThrow('Test case not found')
    expect(() => store.deleteTestCase('other-scene', c.id)).toThrow('Test case not found')
  })

  it('should save all test cases for a scene', () => {
    const cases = store.saveTestCases('scene-cases', [
      { id: 'c1', sceneId: 'scene-cases', instruction: 'A', expectedAnswer: 'ans-a', sourceReferenceIds: [], difficulty: 'easy', confidence: 'high', sortOrder: 0, createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'c2', sceneId: 'scene-cases', instruction: 'B', sourceReferenceIds: ['ref-2'], sortOrder: 1, createdAt: '2024-01-02T00:00:00.000Z' }
    ])
    expect(cases.length).toBe(2)
    expect(cases[0].instruction).toBe('A')
    expect(cases[0].expectedAnswer).toBe('ans-a')
    expect(cases[1].sourceReferenceIds).toEqual(['ref-2'])
  })

  it('should tolerate corrupted source_reference_ids', () => {
    const c = store.addTestCase('scene-cases', { instruction: 'Corrupt refs', sourceReferenceIds: ['ref-1'] })
    const rawDb = new Database()
    rawDb.prepare('UPDATE test_cases SET source_reference_ids = ? WHERE id = ?').run('not-json', c.id)
    const fetched = store.getTestCase(c.id)
    expect(fetched?.sourceReferenceIds).toEqual([])
    const listed = store.listTestCases('scene-cases')
    const listedCase = listed.find(x => x.id === c.id)
    expect(listedCase?.sourceReferenceIds).toEqual([])
  })
})