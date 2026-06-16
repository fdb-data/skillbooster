import { EventType } from '@ag-ui/core'
import type { CanvasUpdate, Proposal } from './ipc-types'

export { EventType }

export type AgentKey = 'guide' | 'extract' | 'validate'

/** AG-UI 标准事件（Electron IPC 传输的子集），CUSTOM 事件承载 SkillBooster 扩展 */
export interface RunStartedEvent {
  type: typeof EventType.RUN_STARTED
  threadId: string // sceneId
  runId: string
  agent: AgentKey
}

export interface RunFinishedEvent {
  type: typeof EventType.RUN_FINISHED
  threadId: string
  runId: string
}

export interface RunErrorEvent {
  type: typeof EventType.RUN_ERROR
  runId: string
  message: string
  code?: string
}

export interface TextMessageStartEvent {
  type: typeof EventType.TEXT_MESSAGE_START
  runId: string
  messageId: string
  role: 'assistant'
}

export interface TextMessageContentEvent {
  type: typeof EventType.TEXT_MESSAGE_CONTENT
  runId: string
  messageId: string
  delta: string
}

export interface TextMessageEndEvent {
  type: typeof EventType.TEXT_MESSAGE_END
  runId: string
  messageId: string
}

export interface ToolCallStartEvent {
  type: typeof EventType.TOOL_CALL_START
  runId: string
  toolCallId: string
  toolCallName: string
}

export interface ToolCallArgsEvent {
  type: typeof EventType.TOOL_CALL_ARGS
  runId: string
  toolCallId: string
  delta: string // 完整参数 JSON（Phase 1 不做参数级流式）
}

export interface ToolCallEndEvent {
  type: typeof EventType.TOOL_CALL_END
  runId: string
  toolCallId: string
}

export interface ToolCallResultEvent {
  type: typeof EventType.TOOL_CALL_RESULT
  runId: string
  toolCallId: string
  content: string
}

/** SkillBooster 扩展事件载荷 */
export type CustomEventPayload =
  | { name: 'canvas_update'; value: CanvasUpdate }
  | { name: 'proposal'; value: Proposal }
  | { name: 'scene_draft'; value: { name: string; protagonist: string; trigger: string; includes: string[]; excludes: string[]; projectName: string; done: boolean } }

export type CustomAgentEvent = {
  type: typeof EventType.CUSTOM
  runId: string
} & CustomEventPayload

export type AgentEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | CustomAgentEvent

export const AGENT_EVENT_CHANNEL = 'agent:event'
