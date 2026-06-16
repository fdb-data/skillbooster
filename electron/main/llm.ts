import log from 'electron-log'
import type { LLMConfig, TokenUsage } from '../../src/contracts/ipc-types'

/** 所有 LLM 调用统一使用的温度（受控对比时两侧一致） */
export const DEFAULT_TEMPERATURE = 0.7

export interface LLMToolCall {
  id: string
  name: string
  arguments: string
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: LLMToolCall[]
  toolCallId?: string
}

export interface LLMToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LLMResult {
  content: string
  toolCalls: LLMToolCall[]
  usage?: TokenUsage
}

interface WireUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

function toTokenUsage(u: WireUsage | undefined | null): TokenUsage | undefined {
  if (!u) return undefined
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0))
  }
}

export interface LLMCallOptions {
  messages: LLMMessage[]
  systemPrompt: string
  config: LLMConfig
  timeout?: number
  tools?: LLMToolDef[]
  onTextDelta?: (delta: string) => void
  signal?: AbortSignal
  maxRetries?: number
}

export class LLMError extends Error {
  code: string
  status?: number
  constructor(message: string, code: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
    this.name = 'LLMError'
  }
}

let lastCallTime = 0
const MIN_INTERVAL = 1100
const RETRY_DELAYS = [2000, 5000, 10000]
// 429 限流单独用长退避：常见供应商按"每分钟 N 次"限速，短退避退不过窗口
const RATE_LIMIT_DELAYS = [5000, 21000, 30000]

async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastCallTime
  if (elapsed < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed))
  }
  lastCallTime = Date.now()
}

function buildApiUrl(config: LLMConfig): string {
  if (config.provider === 'custom' && config.baseUrl) {
    if (config.baseUrl.includes('/chat/completions')) {
      return config.baseUrl
    }
    return config.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  }
  switch (config.provider) {
    case 'openai':
      return `${config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`
    case 'azure':
      return config.baseUrl || 'https://api.openai.com/v1/chat/completions'
    default:
      return 'https://api.openai.com/v1/chat/completions'
  }
}

function buildHeaders(config: LLMConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (config.provider === 'azure') {
    headers['api-key'] = config.apiKey
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  return headers
}

interface WireMessage {
  role: string
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

function toWireMessages(systemPrompt: string, messages: LLMMessage[]): WireMessage[] {
  const wire: WireMessage[] = [{ role: 'system', content: systemPrompt }]
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      wire.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: tc.arguments } }))
      })
    } else if (m.role === 'tool') {
      wire.push({ role: 'tool', content: m.content, tool_call_id: m.toolCallId })
    } else {
      wire.push({ role: m.role, content: m.content })
    }
  }
  return wire
}

function isRetryable(err: LLMError): boolean {
  if (err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR') return true
  if (err.code === 'API_ERROR' && err.status !== undefined) {
    return err.status === 429 || err.status >= 500
  }
  return false
}

/** 解析 SSE 流式响应，逐 delta 回调，聚合最终 content 与 tool_calls */
async function consumeStream(
  response: Response,
  onTextDelta: ((delta: string) => void) | undefined,
  resetIdleTimer: () => void
): Promise<LLMResult> {
  const body = response.body
  if (!body) throw new LLMError('LLM returned empty response', 'EMPTY_RESPONSE')

  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''
  let content = ''
  let usage: TokenUsage | undefined
  const toolCallsByIndex = new Map<number, { id: string; name: string; arguments: string }>()

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    resetIdleTimer()
    buffer += decoder.decode(value, { stream: true })

    let nlIdx: number
    while ((nlIdx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nlIdx).trim()
      buffer = buffer.slice(nlIdx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      let chunk: { choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }>; usage?: WireUsage }
      try {
        chunk = JSON.parse(payload)
      } catch {
        continue
      }
      if (chunk.usage) usage = toTokenUsage(chunk.usage)
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) {
        content += delta.content
        onTextDelta?.(delta.content)
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallsByIndex.get(tc.index)
          if (!existing) {
            toolCallsByIndex.set(tc.index, {
              id: tc.id || '',
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || ''
            })
          } else {
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name += tc.function.name
            if (tc.function?.arguments) existing.arguments += tc.function.arguments
          }
        }
      }
    }
  }

  const toolCalls: LLMToolCall[] = [...toolCallsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, tc]) => ({ id: tc.id, name: tc.name, arguments: tc.arguments }))

  return { content, toolCalls, usage }
}

async function callOnce(options: LLMCallOptions): Promise<LLMResult> {
  const { messages, systemPrompt, config, timeout = 120000, tools, onTextDelta, signal } = options
  const useStream = !!onTextDelta

  await waitForRateLimit()
  if (signal?.aborted) throw new LLMError('已中断', 'ABORTED')

  const url = buildApiUrl(config)
  const headers = buildHeaders(config)
  const bodyObj: Record<string, unknown> = {
    model: config.model,
    messages: toWireMessages(systemPrompt, messages),
    temperature: DEFAULT_TEMPERATURE,
    max_tokens: 4096
  }
  if (tools && tools.length > 0) {
    bodyObj.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
    bodyObj.tool_choice = 'auto'
  }
  if (useStream) {
    bodyObj.stream = true
    bodyObj.stream_options = { include_usage: true }
  }

  log.info(`LLM call to ${config.provider}, model: ${config.model}, stream: ${useStream}, tools: ${tools?.length ?? 0}`)

  const controller = new AbortController()
  let timedOut = false
  let userAborted = false
  let timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  const resetIdleTimer = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  }
  const onExternalAbort = (): void => { userAborted = true; controller.abort() }
  signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      log.error(`LLM error ${response.status}: ${errorText.substring(0, 500)}`)
      if (response.status === 401) {
        throw new LLMError('API Key invalid or expired', 'AUTH_ERROR', 401)
      }
      throw new LLMError(`LLM API error (${response.status}): ${errorText.substring(0, 200)}`, 'API_ERROR', response.status)
    }

    if (useStream) {
      const result = await consumeStream(response, onTextDelta, resetIdleTimer)
      if (!result.content && result.toolCalls.length === 0) {
        throw new LLMError('LLM returned empty response', 'EMPTY_RESPONSE')
      }
      log.info('LLM stream done, content length:', result.content.length, 'toolCalls:', result.toolCalls.length)
      return result
    }

    const data = await response.json() as { choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>; usage?: WireUsage }
    if (!data.choices || data.choices.length === 0) {
      throw new LLMError('LLM returned empty response', 'EMPTY_RESPONSE')
    }
    const msg = data.choices[0].message
    const toolCalls: LLMToolCall[] = (msg.tool_calls || []).map(tc => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }))
    const content = msg.content || ''
    if (!content && toolCalls.length === 0) {
      throw new LLMError('LLM returned empty response', 'EMPTY_RESPONSE')
    }
    log.info('LLM response received, length:', content.length, 'toolCalls:', toolCalls.length)
    return { content, toolCalls, usage: toTokenUsage(data.usage) }
  } catch (err: unknown) {
    if (err instanceof LLMError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      if (userAborted) throw new LLMError('已中断', 'ABORTED')
      if (timedOut) throw new LLMError('LLM response timeout, please retry', 'TIMEOUT')
      throw new LLMError('LLM response timeout, please retry', 'TIMEOUT')
    }
    const msg = (err as Error).message
    log.error('LLM network error:', msg)
    throw new LLMError(`Network error: ${msg}`, 'NETWORK_ERROR')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

/** 完整版调用：流式 + 工具调用 + 429/超时/网络错误自动退避重试 */
export async function callLLMEx(options: LLMCallOptions): Promise<LLMResult> {
  const maxRetries = options.maxRetries ?? RETRY_DELAYS.length
  let lastError: LLMError | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callOnce(options)
    } catch (err) {
      const llmErr = err instanceof LLMError ? err : new LLMError((err as Error).message, 'NETWORK_ERROR')
      if (llmErr.code === 'ABORTED') throw llmErr
      if (attempt >= maxRetries || !isRetryable(llmErr)) throw llmErr
      lastError = llmErr
      const delays = llmErr.status === 429 ? RATE_LIMIT_DELAYS : RETRY_DELAYS
      const delay = delays[Math.min(attempt, delays.length - 1)]
      log.warn(`LLM call failed (${llmErr.code}), retry ${attempt + 1}/${maxRetries} in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
      if (options.signal?.aborted) throw new LLMError('已中断', 'ABORTED')
    }
  }
  throw lastError ?? new LLMError('LLM call failed', 'API_ERROR')
}

/** 兼容版调用：仅返回文本内容（不重试不流式，行为与 V1 一致） */
export async function callLLM(options: LLMCallOptions): Promise<string> {
  const result = await callOnce(options)
  return result.content
}

export async function testConnection(config: LLMConfig): Promise<{ success: boolean; error?: string }> {
  const url = buildApiUrl(config)
  log.info(`Test connection: ${config.provider}, model: ${config.model}, url: ${url}`)
  try {
    await callLLM({
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: 'You are a test assistant. Reply with "OK".',
      config,
      timeout: 30000
    })
    log.info('Test connection: success')
    return { success: true }
  } catch (err) {
    const msg = (err as Error).message
    log.error('Test connection failed:', msg)
    return { success: false, error: msg }
  }
}
