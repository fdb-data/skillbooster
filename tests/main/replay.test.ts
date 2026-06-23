import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../electron/main/llm', () => ({
  callLLMEx: vi.fn()
}))

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
            _data.test_cases = _data.test_cases.filter((c: any) => c.id !== args[0])
          }
        }
      }),
      get: vi.fn((...args: any[]) => {
        if (sql.includes('SELECT') && sql.includes('scenes') && sql.includes('WHERE')) {
          return _data.scenes?.find((s: any) => s.id === args[0])
        }
        if (sql.includes('test_cases') && sql.includes('WHERE id = ?')) {
          return _data.test_cases?.find((c: any) => c.id === args[0])
        }
        return undefined
      }),
      all: vi.fn((..._args: any[]) => {
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

import { initDatabase, closeDatabase, addTestCase, listTestCases, updateTestCase, deleteTestCase } from '../../electron/main/store'
import * as store from '../../electron/main/store'
import { callLLMEx } from '../../electron/main/llm'
import { runReplay } from '../../electron/main/agents'

describe('replay cases', () => {
  beforeEach(() => {
    closeDatabase()
    initDatabase()
    vi.spyOn(store, 'resolveAgentLLMConfig').mockReturnValue({
      provider: 'custom',
      apiKey: 'test-key',
      model: 'test-model',
      baseUrl: 'https://api.test.com/v1'
    })
  })

  it('should CRUD test cases with full fields', () => {
    addTestCase('scene-1', {
      instruction: '案例1',
      expectedAnswer: '通过',
      difficulty: 'easy',
      confidence: 'high',
      tags: '信贷,审批',
      notes: '备注'
    })
    const cases = listTestCases('scene-1')
    expect(cases).toHaveLength(1)
    expect(cases[0].instruction).toBe('案例1')
    expect(cases[0].expectedAnswer).toBe('通过')
    expect(cases[0].difficulty).toBe('easy')
    expect(cases[0].sourceReferenceIds).toEqual([])
  })

  it('should update and delete case', () => {
    const c = addTestCase('scene-1', { instruction: '案例' })
    updateTestCase('scene-1', c.id, { instruction: '已更新' })
    expect(listTestCases('scene-1')[0].instruction).toBe('已更新')
    deleteTestCase('scene-1', c.id)
    expect(listTestCases('scene-1')).toHaveLength(0)
  })

  it('should run replay and calculate hit rate', async () => {
    addTestCase('scene-replay', {
      instruction: '测试指令',
      expectedAnswer: '通过'
    })
    vi.mocked(callLLMEx).mockImplementation(async (options: any) => {
      if (options.systemPrompt === '') {
        return { content: JSON.stringify({ hit: true, reason: '与期望结论一致' }) }
      }
      return {
        content: '通过',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      }
    })

    const report = await runReplay('scene-replay')
    expect(report.totalCases).toBe(1)
    expect(report.hitCount).toBe(1)
    expect(report.hitRate).toBe(1)
  })

  it('should filter cases by caseIds', async () => {
    const c1 = addTestCase('scene-filter', { instruction: '案例1', expectedAnswer: '是' })
    addTestCase('scene-filter', { instruction: '案例2', expectedAnswer: '否' })
    vi.mocked(callLLMEx).mockImplementation(async (options: any) => {
      if (options.systemPrompt === '') {
        return { content: JSON.stringify({ hit: true, reason: '与期望结论一致' }) }
      }
      return { content: '是' }
    })
    const report = await runReplay('scene-filter', [c1.id])
    expect(report.totalCases).toBe(1)
  })

  it('should skip hit judgement when expectedAnswer is empty', async () => {
    addTestCase('scene-skip', { instruction: '无期望结论' })
    vi.mocked(callLLMEx).mockResolvedValue({ content: '任意回答' } as any)
    const report = await runReplay('scene-skip')
    expect(report.results[0].hit).toBe(false)
    expect(report.results[0].reason).toContain('未提供')
  })
})
