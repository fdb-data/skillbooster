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