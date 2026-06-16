import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { callLLM, testConnection } from '../../electron/main/llm'
import type { LLMConfig } from '../../src/contracts/ipc-types'

const mockConfig: LLMConfig = {
  provider: 'custom',
  apiKey: 'test-key',
  model: 'test-model',
  baseUrl: 'https://api.test.com/v1'
}

describe('LLM - buildApiUrl', () => {
  it('should use baseUrl as-is when it contains /chat/completions', async () => {
    const config = { ...mockConfig, baseUrl: 'https://api.test.com/v1/chat/completions' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] })
    } as Response)
    await callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.test.com/v1/chat/completions')
    fetchSpy.mockRestore()
  })

  it('should append /chat/completions for custom provider', async () => {
    const config = { ...mockConfig, baseUrl: 'https://api.test.com/v1' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] })
    } as Response)
    await callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.test.com/v1/chat/completions')
    fetchSpy.mockRestore()
  })

  it('should strip trailing slash before appending', async () => {
    const config = { ...mockConfig, baseUrl: 'https://api.test.com/v1/' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] })
    } as Response)
    await callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.test.com/v1/chat/completions')
    fetchSpy.mockRestore()
  })
})

describe('LLM - callLLM', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return content on successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'Hello world' } }] })
    } as Response)
    const result = await callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config: mockConfig })
    expect(result).toBe('Hello world')
  })

  it('should throw LLMError on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    } as Response)
    await expect(callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config: mockConfig })).rejects.toThrow('API Key invalid')
  })

  it('should throw LLMError on 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Too many requests')
    } as Response)
    await expect(callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config: mockConfig })).rejects.toThrow('LLM API error (429)')
  })

  it('should throw LLMError on empty response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] })
    } as Response)
    await expect(callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config: mockConfig })).rejects.toThrow('empty response')
  })

  it('should throw TIMEOUT on abort', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    await expect(callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config: mockConfig, timeout: 100 })).rejects.toThrow()
  })
})

describe('LLM - testConnection', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('should return success on valid connection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'OK' } }] })
    } as Response)
    const result = await testConnection(mockConfig)
    expect(result.success).toBe(true)
  })

  it('should return failure on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    } as Response)
    const result = await testConnection(mockConfig)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('LLM - rate limiting', () => {
  it('should enforce minimum interval between calls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] })
    } as Response)
    const start = Date.now()
    await callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config: mockConfig })
    await callLLM({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys', config: mockConfig })
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(1000)
  })
})