import { BrowserWindow } from 'electron'
import { AGENT_EVENT_CHANNEL } from '../../src/contracts/agent-events'
import type { AgentEvent } from '../../src/contracts/agent-events'

/** 向所有窗口推送 agent 事件（AG-UI 事件流的 Electron IPC 传输） */
export function emitAgentEvent(event: AgentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(AGENT_EVENT_CHANNEL, event)
    }
  }
}
