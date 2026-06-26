import { ipcMain, dialog, shell } from 'electron'
import log from 'electron-log'
import fs from 'fs'
import path from 'path'
import type { LLMConfig, LLMProviderConfig, ExperienceCard, Reference, Attachment, AttachmentKind, TestCase, EvalExportPayload, ValidationResultsBundle } from '../../src/contracts/ipc-types'
import { generateId } from '../../src/utils/uuid'
import * as store from './store'
import { runTurn, draftFromDocs } from './extraction'
import { healthCheck, buildPackage } from './packager'
import { guideRunTurn, getSceneDraft, validationRun, validationRunCase, generateTestCases } from './agents'
import { exportEvalResults } from './packager'
import { abortAgentRun } from './agentLoop'
import { parseDocument } from './docParser'
import { importSkill } from './skillImporter'
import { testConnection } from './llm'
import { mt } from './i18n'
import { wrapHandler } from './errorHandler'
import { setUpdaterAutoMode, checkForUpdatesManual, downloadUpdate, installUpdate, getAppVersion } from './updater'

export function registerIpcHandlers(): void {
  ipcMain.handle('scenes:list', wrapHandler(async () => {
    const scenes = store.listScenes()
    return scenes.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      canvas: store.loadCanvas(s.id),
      references: store.listReferences(s.id),
      scripts: store.listAttachments(s.id, 'script'),
      assets: store.listAttachments(s.id, 'asset'),
      conversation: store.listConversation(s.id),
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }))
  }))

  ipcMain.handle('scenes:get', wrapHandler(async (_e, id: string) => {
    const scene = store.getScene(id)
    if (!scene) throw new Error(mt('sceneNotFound'))
    return {
      id: scene.id,
      name: scene.name,
      status: scene.status,
      canvas: store.loadCanvas(scene.id),
      references: store.listReferences(scene.id),
      scripts: store.listAttachments(scene.id, 'script'),
      assets: store.listAttachments(scene.id, 'asset'),
      conversation: store.listConversation(scene.id),
      createdAt: scene.created_at,
      updatedAt: scene.updated_at
    }
  }))

  ipcMain.handle('scenes:create', wrapHandler(async (_e, data: { name: string }) => {
    const id = generateId()
    store.createScene(id, data.name)
    const scene = store.getScene(id)!
    return {
      id: scene.id,
      name: scene.name,
      status: scene.status,
      canvas: store.loadCanvas(scene.id),
      references: [],
      scripts: [],
      assets: [],
      conversation: [],
      createdAt: scene.created_at,
      updatedAt: scene.updated_at
    }
  }))

  ipcMain.handle('scenes:update', wrapHandler(async (_e, id: string, data: { name?: string; status?: string }) => {
    store.updateScene(id, data)
    const scene = store.getScene(id)!
    return {
      id: scene.id,
      name: scene.name,
      status: scene.status,
      canvas: store.loadCanvas(scene.id),
      references: store.listReferences(scene.id),
      scripts: store.listAttachments(scene.id, 'script'),
      assets: store.listAttachments(scene.id, 'asset'),
      conversation: store.listConversation(scene.id),
      createdAt: scene.created_at,
      updatedAt: scene.updated_at
    }
  }))

  ipcMain.handle('scenes:delete', wrapHandler(async (_e, id: string) => {
    store.deleteScene(id)
    return { success: true }
  }))

  ipcMain.handle('references:add', wrapHandler(async (_e, sceneId: string, filePath: string) => {
    const extractedText = await parseDocument(filePath)
    const refId = generateId()
    const sceneDir = store.getSceneDir(sceneId)
    const ext = path.extname(filePath)
    const storedPath = path.join(sceneDir, `${refId}${ext}`)
    fs.copyFileSync(filePath, storedPath)

    const ref: Reference = {
      id: refId,
      filename: path.basename(filePath),
      storedPath,
      extractedText,
      includeInPackage: true
    }
    store.addReference(ref, sceneId)
    return ref
  }))

  ipcMain.handle('references:remove', wrapHandler(async (_e, sceneId: string, refId: string) => {
    store.removeReference(sceneId, refId)
    return { success: true }
  }))

  ipcMain.handle('references:list', wrapHandler(async (_e, sceneId: string) => {
    return store.listReferences(sceneId)
  }))

  ipcMain.handle('references:setInclude', wrapHandler(async (_e, sceneId: string, refId: string, include: boolean) => {
    store.setReferenceInclude(sceneId, refId, include)
    return { success: true }
  }))

  ipcMain.handle('attachments:add', wrapHandler(async (_e, sceneId: string, kind: AttachmentKind, filePath: string) => {
    const attId = generateId()
    const sceneDir = store.getAttachmentSceneDir(sceneId, kind)
    const ext = path.extname(filePath)
    const storedPath = path.join(sceneDir, `${attId}${ext}`)
    fs.copyFileSync(filePath, storedPath)

    const att: Attachment = {
      id: attId,
      kind,
      filename: path.basename(filePath),
      storedPath,
      includeInPackage: true
    }
    store.addAttachment(att, sceneId)
    return att
  }))

  ipcMain.handle('attachments:remove', wrapHandler(async (_e, sceneId: string, attId: string) => {
    store.removeAttachment(sceneId, attId)
    return { success: true }
  }))

  ipcMain.handle('attachments:list', wrapHandler(async (_e, sceneId: string, kind: AttachmentKind) => {
    return store.listAttachments(sceneId, kind)
  }))

  ipcMain.handle('attachments:setInclude', wrapHandler(async (_e, sceneId: string, attId: string, include: boolean) => {
    store.setAttachmentInclude(sceneId, attId, include)
    return { success: true }
  }))

  ipcMain.handle('attachments:open', wrapHandler(async (_e, sceneId: string, attId: string) => {
    const att = store.getAttachment(sceneId, attId)
    if (!att) throw new Error(mt('attachmentNotFound'))
    if (!fs.existsSync(att.storedPath)) throw new Error(mt('attachmentFileMissing'))
    const err = await shell.openPath(att.storedPath)
    if (err) throw new Error(err)
    return { success: true }
  }))

  ipcMain.handle('skill:pickImportPath', wrapHandler(async (_e, mode: 'file' | 'folder') => {
    const result = await dialog.showOpenDialog(
      mode === 'folder'
        ? { title: mt('importDialogTitle'), properties: ['openDirectory'] }
        : { title: mt('importDialogTitle'), properties: ['openFile'], filters: [{ name: 'Skill', extensions: ['md', 'zip'] }] }
    )
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    return { path: result.filePaths[0] }
  }))

  ipcMain.handle('skill:import', wrapHandler(async (_e, sourcePath: string) => {
    return await importSkill(sourcePath)
  }))

  ipcMain.handle('extraction:runTurn', wrapHandler(async (_e, sceneId: string, message: string) => {
    return await runTurn(sceneId, message)
  }))

  ipcMain.handle('guide:runTurn', wrapHandler(async (_e, sceneId: string, userInput: string) => {
    return await guideRunTurn(sceneId, userInput)
  }))

  ipcMain.handle('guide:getDraft', wrapHandler(async (_e, sceneId: string) => {
    return getSceneDraft(sceneId)
  }))

  ipcMain.handle('guide:getMessages', wrapHandler(async (_e, sceneId: string) => {
    return store.listGuideMessages(sceneId)
  }))

  ipcMain.handle('validation:run', wrapHandler(async (_e, sceneId: string, instruction: string) => {
    return await validationRun(sceneId, instruction)
  }))

  ipcMain.handle('validation:runCase', wrapHandler(async (_e, sceneId: string, instruction: string) => {
    return await validationRunCase(sceneId, instruction)
  }))

  ipcMain.handle('validation:listCases', wrapHandler(async (_e, sceneId: string) => {
    return store.listTestCases(sceneId)
  }))

  ipcMain.handle('validation:generateCases', wrapHandler(async (_e, sceneId: string) => {
    return await generateTestCases(sceneId)
  }))

  ipcMain.handle('validation:saveCases', wrapHandler(async (_e, sceneId: string, cases: TestCase[]) => {
    return store.saveTestCases(sceneId, cases)
  }))

  ipcMain.handle('validation:getResults', wrapHandler(async (_e, sceneId: string) => {
    return store.getValidationResults(sceneId)
  }))

  ipcMain.handle('validation:saveResults', wrapHandler(async (_e, sceneId: string, bundle: ValidationResultsBundle) => {
    store.saveValidationResults(sceneId, bundle)
    return { saved: true }
  }))

  ipcMain.handle('validation:exportResults', wrapHandler(async (_e, sceneId: string, format: 'json' | 'markdown', payload: EvalExportPayload) => {
    return await exportEvalResults(sceneId, format, payload)
  }))

  ipcMain.handle('extraction:draftFromDocs', wrapHandler(async (_e, sceneId: string) => {
    return await draftFromDocs(sceneId)
  }))

  ipcMain.handle('agent:abort', wrapHandler(async (_e, runId: string) => {
    return { aborted: abortAgentRun(runId) }
  }))

  ipcMain.handle('canvas:update', wrapHandler(async (_e, sceneId: string, canvasData: ExperienceCard) => {
    store.saveCanvas(sceneId, canvasData)
    return canvasData
  }))

  ipcMain.handle('export:buildPackage', wrapHandler(async (_e, sceneId: string) => {
    const filePath = await buildPackage(sceneId)
    return { filePath }
  }))

  ipcMain.handle('export:healthCheck', wrapHandler(async (_e, sceneId: string) => {
    return healthCheck(sceneId)
  }))

  ipcMain.handle('settings:getLLM', wrapHandler(async () => {
    return store.getLLMConfig()
  }))

  ipcMain.handle('settings:setLLM', wrapHandler(async (_e, config: LLMConfig) => {
    store.saveLLMConfig(config)
    return config
  }))

  ipcMain.handle('settings:getLLMProviders', wrapHandler(async () => {
    return store.getAllLLMProviders()
  }))

  ipcMain.handle('settings:saveLLMProviders', wrapHandler(async (_e, providers: LLMProviderConfig[]) => {
    store.saveAllLLMProviders(providers)
    return providers
  }))

  ipcMain.handle('settings:testConnection', wrapHandler(async (_e, config: LLMConfig) => {
    return await testConnection(config)
  }))

  ipcMain.handle('settings:getAgentConfigs', wrapHandler(async () => {
    return store.getAllAgentConfigs()
  }))

  ipcMain.handle('settings:saveAgentConfig', wrapHandler(async (_e, config: store.AgentConfig) => {
    store.saveAgentConfig(config)
    return config
  }))

  ipcMain.handle('settings:getLanguage', wrapHandler(async () => {
    const v = store.getPreference('language')
    return v === 'zh' ? 'zh' : 'en'
  }))

  ipcMain.handle('settings:setLanguage', wrapHandler(async (_e, lang: string) => {
    const normalized = lang === 'zh' ? 'zh' : 'en'
    store.setPreference('language', normalized)
    return normalized
  }))

  ipcMain.handle('settings:getTheme', wrapHandler(async () => {
    const v = store.getPreference('theme')
    return v === 'dark' || v === 'light' ? v : 'system'
  }))

  ipcMain.handle('settings:setTheme', wrapHandler(async (_e, theme: string) => {
    const normalized = theme === 'dark' || theme === 'light' ? theme : 'system'
    store.setPreference('theme', normalized)
    return normalized
  }))

  ipcMain.handle('settings:openPromptFile', wrapHandler(async (_e, relativePath: string) => {
    const { shell } = await import('electron')
    const promptPath = path.join(process.cwd(), 'resources', relativePath)
    if (fs.existsSync(promptPath)) {
      await shell.openPath(promptPath)
      return { success: true }
    }
    return { success: false, error: 'File not found' }
  }))

  ipcMain.handle('update:getAutoUpdate', wrapHandler(async () => {
    return store.getPreference('autoUpdate') === 'true'
  }))

  ipcMain.handle('update:setAutoUpdate', wrapHandler(async (_e, enabled: boolean) => {
    store.setPreference('autoUpdate', enabled ? 'true' : 'false')
    setUpdaterAutoMode(enabled)
    return enabled
  }))

  ipcMain.handle('update:check', wrapHandler(async () => {
    await checkForUpdatesManual()
    return null
  }))

  ipcMain.handle('update:download', wrapHandler(async () => {
    await downloadUpdate()
    return null
  }))

  ipcMain.handle('update:install', wrapHandler(async () => {
    installUpdate()
    return null
  }))

  ipcMain.handle('update:getVersion', wrapHandler(async () => {
    return getAppVersion()
  }))

  log.info('All IPC handlers registered')
}