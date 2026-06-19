import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const AGENT_EVENT_CHANNEL = 'agent:event'

const api = {
  agent: {
    onEvent: (callback: (event: unknown) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, event: unknown): void => callback(event)
      ipcRenderer.on(AGENT_EVENT_CHANNEL, listener)
      return () => ipcRenderer.removeListener(AGENT_EVENT_CHANNEL, listener)
    },
    abort: (runId: string): Promise<unknown> => ipcRenderer.invoke('agent:abort', runId)
  },
  scenes: {
    list: (): Promise<unknown> => ipcRenderer.invoke('scenes:list'),
    get: (id: string): Promise<unknown> => ipcRenderer.invoke('scenes:get', id),
    create: (data: { name: string }): Promise<unknown> => ipcRenderer.invoke('scenes:create', data),
    update: (id: string, data: { name?: string; status?: string }): Promise<unknown> => ipcRenderer.invoke('scenes:update', id, data),
    delete: (id: string): Promise<unknown> => ipcRenderer.invoke('scenes:delete', id)
  },
  references: {
    add: (sceneId: string, filePath: string): Promise<unknown> => ipcRenderer.invoke('references:add', sceneId, filePath),
    remove: (sceneId: string, refId: string): Promise<unknown> => ipcRenderer.invoke('references:remove', sceneId, refId),
    list: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('references:list', sceneId),
    setInclude: (sceneId: string, refId: string, include: boolean): Promise<unknown> => ipcRenderer.invoke('references:setInclude', sceneId, refId, include)
  },
  attachments: {
    add: (sceneId: string, kind: string, filePath: string): Promise<unknown> => ipcRenderer.invoke('attachments:add', sceneId, kind, filePath),
    remove: (sceneId: string, attId: string): Promise<unknown> => ipcRenderer.invoke('attachments:remove', sceneId, attId),
    list: (sceneId: string, kind: string): Promise<unknown> => ipcRenderer.invoke('attachments:list', sceneId, kind),
    setInclude: (sceneId: string, attId: string, include: boolean): Promise<unknown> => ipcRenderer.invoke('attachments:setInclude', sceneId, attId, include),
    open: (sceneId: string, attId: string): Promise<unknown> => ipcRenderer.invoke('attachments:open', sceneId, attId)
  },
  skill: {
    pickImportPath: (mode: string): Promise<unknown> => ipcRenderer.invoke('skill:pickImportPath', mode),
    import: (sourcePath: string): Promise<unknown> => ipcRenderer.invoke('skill:import', sourcePath)
  },
  guide: {
    runTurn: (sceneId: string, userInput: string): Promise<unknown> => ipcRenderer.invoke('guide:runTurn', sceneId, userInput),
    getDraft: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('guide:getDraft', sceneId),
    getMessages: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('guide:getMessages', sceneId)
  },
  extraction: {
    runTurn: (sceneId: string, message: string): Promise<unknown> => ipcRenderer.invoke('extraction:runTurn', sceneId, message),
    draftFromDocs: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('extraction:draftFromDocs', sceneId)
  },
  validation: {
    run: (sceneId: string, instruction: string): Promise<unknown> => ipcRenderer.invoke('validation:run', sceneId, instruction),
    runCase: (sceneId: string, instruction: string): Promise<unknown> => ipcRenderer.invoke('validation:runCase', sceneId, instruction),
    listCases: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('validation:listCases', sceneId),
    generateCases: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('validation:generateCases', sceneId),
    saveCases: (sceneId: string, cases: unknown): Promise<unknown> => ipcRenderer.invoke('validation:saveCases', sceneId, cases),
    getResults: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('validation:getResults', sceneId),
    saveResults: (sceneId: string, bundle: unknown): Promise<unknown> => ipcRenderer.invoke('validation:saveResults', sceneId, bundle),
    exportResults: (sceneId: string, format: string, payload: unknown): Promise<unknown> => ipcRenderer.invoke('validation:exportResults', sceneId, format, payload)
  },
  canvas: {
    update: (sceneId: string, canvasData: unknown): Promise<unknown> => ipcRenderer.invoke('canvas:update', sceneId, canvasData)
  },
  export: {
    buildPackage: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('export:buildPackage', sceneId),
    healthCheck: (sceneId: string): Promise<unknown> => ipcRenderer.invoke('export:healthCheck', sceneId)
  },
  settings: {
    getLLM: (): Promise<unknown> => ipcRenderer.invoke('settings:getLLM'),
    setLLM: (config: unknown): Promise<unknown> => ipcRenderer.invoke('settings:setLLM', config),
    getLLMProviders: (): Promise<unknown> => ipcRenderer.invoke('settings:getLLMProviders'),
    saveLLMProviders: (providers: unknown): Promise<unknown> => ipcRenderer.invoke('settings:saveLLMProviders', providers),
    testConnection: (config: unknown): Promise<unknown> => ipcRenderer.invoke('settings:testConnection', config),
    getAgentConfigs: (): Promise<unknown> => ipcRenderer.invoke('settings:getAgentConfigs'),
    saveAgentConfig: (config: unknown): Promise<unknown> => ipcRenderer.invoke('settings:saveAgentConfig', config),
    openPromptFile: (relativePath: string): Promise<unknown> => ipcRenderer.invoke('settings:openPromptFile', relativePath),
    getLanguage: (): Promise<unknown> => ipcRenderer.invoke('settings:getLanguage'),
    setLanguage: (lang: string): Promise<unknown> => ipcRenderer.invoke('settings:setLanguage', lang),
    getTheme: (): Promise<unknown> => ipcRenderer.invoke('settings:getTheme'),
    setTheme: (theme: string): Promise<unknown> => ipcRenderer.invoke('settings:setTheme', theme)
  }
}

contextBridge.exposeInMainWorld('api', api)
