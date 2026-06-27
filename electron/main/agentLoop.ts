import log from 'electron-log'
import type { LLMConfig } from '../../src/contracts/ipc-types'
import type { AgentKey } from '../../src/contracts/agent-events'
import { EventType } from '../../src/contracts/agent-events'
import { callLLMEx, LLMError } from './llm'
import type { LLMMessage, LLMToolDef, LLMToolCall } from './llm'
import { emitAgentEvent } from './agentEvents'
import { generateId } from '../../src/utils/uuid'

/** 工具执行控制：工具可通过 stop() 要求结束本轮循环（如 ask_user 等待用户回答） */
export interface ToolControl {
  stop: (finalReply?: string) => void
}

export interface AgentTool {
  def: LLMToolDef
  execute: (args: Record<string, unknown>, ctl: ToolControl) => string | Promise<string>
}

export interface AgentLoopOptions {
  agentKey: AgentKey
  sceneId: string
  systemPrompt: string
  messages: LLMMessage[]
  tools: AgentTool[]
  config: LLMConfig
  maxSteps?: number
  /** 由调用方预生成，便于工具执行器在事件中携带同一 runId */
  runId?: string
}

export interface AgentLoopResult {
  runId: string
  reply: string
  steps: number
}

const DEFAULT_MAX_STEPS = 8

/** function calling 支持情况缓存：key = baseUrl|model */
const toolSupportCache = new Map<string, boolean>()

function toolSupportKey(config: LLMConfig): string {
  return `${config.baseUrl || config.provider}|${config.model}`
}

/** 进行中的 run，用于中断 */
const activeRuns = new Map<string, AbortController>()

export function abortAgentRun(runId: string): boolean {
  const controller = activeRuns.get(runId)
  if (!controller) return false
  controller.abort()
  return true
}

/** 供非 agentLoop 的 run（如安全检测）注册中断控制器，复用统一的 abort 通道 */
export function registerAgentRun(runId: string, controller: AbortController): void {
  activeRuns.set(runId, controller)
}

export function unregisterAgentRun(runId: string): void {
  activeRuns.delete(runId)
}

function isToolUnsupportedError(err: unknown): boolean {
  if (!(err instanceof LLMError)) return false
  if (err.code !== 'API_ERROR') return false
  if (err.status === undefined || ![400, 404, 422].includes(err.status)) return false
  return /tool|function/i.test(err.message)
}

function buildFallbackProtocol(tools: AgentTool[]): string {
  let s = '\n\n## 工具调用协议（重要）\n'
  s += '你的每次回复必须是一个严格的 JSON 对象（禁止 markdown 代码块、禁止任何 JSON 之外的文本）：\n'
  s += '{"tool_calls":[{"name":"工具名","arguments":{}}],"reply":"给用户的回复"}\n'
  s += '- 需要执行操作时：在 tool_calls 中列出要调用的工具，可以一次调多个\n'
  s += '- 操作全部完成、要回复用户时：tool_calls 为空数组 []，reply 填写最终回复\n'
  s += '\n### 可用工具\n'
  for (const t of tools) {
    s += `- ${t.def.name}：${t.def.description}\n  参数 JSON Schema：${JSON.stringify(t.def.parameters)}\n`
  }
  return s
}

function parseFallbackResponse(raw: string): { toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>; reply: string } | null {
  let jsonText = raw.trim()
  const m = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (m) jsonText = m[1]
  try {
    const parsed = JSON.parse(jsonText) as { tool_calls?: Array<{ name?: string; arguments?: Record<string, unknown> }>; reply?: string }
    if (typeof parsed !== 'object' || parsed === null) return null
    return {
      toolCalls: (parsed.tool_calls || [])
        .filter(tc => typeof tc.name === 'string')
        .map(tc => ({ name: tc.name as string, arguments: tc.arguments || {} })),
      reply: parsed.reply || ''
    }
  } catch {
    return null
  }
}

async function executeToolCall(
  tools: AgentTool[],
  name: string,
  args: Record<string, unknown>,
  ctl: ToolControl
): Promise<string> {
  const tool = tools.find(t => t.def.name === name)
  if (!tool) return `错误：未知工具 ${name}`
  try {
    return await tool.execute(args, ctl)
  } catch (err) {
    log.error(`Tool ${name} failed:`, err)
    return `错误：${(err as Error).message}`
  }
}

/**
 * Agent 多步工具循环。
 * 原生模式走 function calling + 流式文本；模型不支持时降级为 JSON 协议（非流式）。
 * 全程通过 AG-UI 事件推送进度，最终返回聚合回复。
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { agentKey, sceneId, systemPrompt, tools, config } = options
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  const runId = options.runId ?? generateId()
  const controller = new AbortController()
  activeRuns.set(runId, controller)

  const messages: LLMMessage[] = [...options.messages]
  const replyParts: string[] = []
  let stopped = false
  let stopReply: string | undefined
  const ctl: ToolControl = {
    stop: (finalReply?: string) => {
      stopped = true
      stopReply = finalReply
    }
  }

  emitAgentEvent({ type: EventType.RUN_STARTED, threadId: sceneId, runId, agent: agentKey })

  let nativeTools = toolSupportCache.get(toolSupportKey(config)) !== false

  try {
    let steps = 0
    while (steps < maxSteps) {
      steps++

      let content = ''
      let toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown>; rawArguments: string }> = []

      if (nativeTools) {
        const messageId = generateId()
        let messageStarted = false
        let result
        try {
          result = await callLLMEx({
            messages,
            systemPrompt,
            config,
            tools: tools.map(t => t.def),
            signal: controller.signal,
            onTextDelta: (delta) => {
              if (!messageStarted) {
                messageStarted = true
                emitAgentEvent({ type: EventType.TEXT_MESSAGE_START, runId, messageId, role: 'assistant' })
              }
              emitAgentEvent({ type: EventType.TEXT_MESSAGE_CONTENT, runId, messageId, delta })
            }
          })
        } catch (err) {
          if (isToolUnsupportedError(err)) {
            log.warn(`Model ${config.model} does not support function calling, falling back to JSON protocol`)
            toolSupportCache.set(toolSupportKey(config), false)
            nativeTools = false
            steps--
            continue
          }
          throw err
        }
        if (messageStarted) {
          emitAgentEvent({ type: EventType.TEXT_MESSAGE_END, runId, messageId })
        }
        toolSupportCache.set(toolSupportKey(config), true)
        content = result.content
        toolCalls = result.toolCalls.map((tc: LLMToolCall) => {
          let parsed: Record<string, unknown> = {}
          try { parsed = JSON.parse(tc.arguments || '{}') } catch { /* 保留空参数 */ }
          return { id: tc.id || generateId(), name: tc.name, arguments: parsed, rawArguments: tc.arguments }
        })

        if (content) replyParts.push(content)

        if (toolCalls.length === 0) break

        messages.push({
          role: 'assistant',
          content,
          toolCalls: toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.rawArguments }))
        })

        for (const tc of toolCalls) {
          emitAgentEvent({ type: EventType.TOOL_CALL_START, runId, toolCallId: tc.id, toolCallName: tc.name })
          emitAgentEvent({ type: EventType.TOOL_CALL_ARGS, runId, toolCallId: tc.id, delta: tc.rawArguments })
          const resultText = await executeToolCall(tools, tc.name, tc.arguments, ctl)
          emitAgentEvent({ type: EventType.TOOL_CALL_END, runId, toolCallId: tc.id })
          emitAgentEvent({ type: EventType.TOOL_CALL_RESULT, runId, toolCallId: tc.id, content: resultText })
          messages.push({ role: 'tool', content: resultText, toolCallId: tc.id })
        }
      } else {
        // JSON 协议降级：非流式（流式会把原始 JSON 漏给用户）
        const result = await callLLMEx({
          messages,
          systemPrompt: systemPrompt + buildFallbackProtocol(tools),
          config,
          signal: controller.signal
        })
        const parsed = parseFallbackResponse(result.content)
        if (!parsed) {
          // 不符合协议，当作最终回复
          replyParts.push(result.content)
          break
        }
        messages.push({ role: 'assistant', content: result.content })
        if (parsed.reply) replyParts.push(parsed.reply)

        if (parsed.toolCalls.length === 0) break

        const resultLines: string[] = []
        for (const tc of parsed.toolCalls) {
          const toolCallId = generateId()
          emitAgentEvent({ type: EventType.TOOL_CALL_START, runId, toolCallId, toolCallName: tc.name })
          emitAgentEvent({ type: EventType.TOOL_CALL_ARGS, runId, toolCallId, delta: JSON.stringify(tc.arguments) })
          const resultText = await executeToolCall(tools, tc.name, tc.arguments, ctl)
          emitAgentEvent({ type: EventType.TOOL_CALL_END, runId, toolCallId })
          emitAgentEvent({ type: EventType.TOOL_CALL_RESULT, runId, toolCallId, content: resultText })
          resultLines.push(`${tc.name}: ${resultText}`)
        }
        messages.push({ role: 'user', content: `[工具执行结果]\n${resultLines.join('\n')}` })
      }

      if (stopped) break
    }

    let reply = replyParts.filter(p => p.trim().length > 0).join('\n\n')
    if (stopped && stopReply) reply = stopReply
    if (!reply) reply = '（本轮已结束）'

    // 降级模式没有流式，补发完整文本事件保证渲染端一致
    if (!nativeTools && reply) {
      const messageId = generateId()
      emitAgentEvent({ type: EventType.TEXT_MESSAGE_START, runId, messageId, role: 'assistant' })
      emitAgentEvent({ type: EventType.TEXT_MESSAGE_CONTENT, runId, messageId, delta: reply })
      emitAgentEvent({ type: EventType.TEXT_MESSAGE_END, runId, messageId })
    }

    emitAgentEvent({ type: EventType.RUN_FINISHED, threadId: sceneId, runId })
    return { runId, reply, steps }
  } catch (err) {
    const llmErr = err instanceof LLMError ? err : null
    emitAgentEvent({
      type: EventType.RUN_ERROR,
      runId,
      message: (err as Error).message,
      code: llmErr?.code
    })
    throw err
  } finally {
    activeRuns.delete(runId)
  }
}
