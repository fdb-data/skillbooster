import { app, BrowserWindow } from 'electron'
import log from 'electron-log'
import pkg from 'electron-updater'
import { getPreference } from './store'

// electron-updater 是 CommonJS 默认导出，ESM/TS 下解构取 autoUpdater
const { autoUpdater } = pkg

let getWindow: () => BrowserWindow | null = () => null

export type UpdateEvent =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

function emit(event: UpdateEvent): void {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:event', event)
  }
}

/** 是否启用自动更新（默认关闭） */
export function isAutoUpdateEnabled(): boolean {
  return getPreference('autoUpdate') === 'true'
}

/**
 * 自动更新：仅在用户开启「自动更新」时启动时后台检查并静默下载。
 * 手动模式下不自动检查，由渲染进程通过 IPC 触发。
 * 发布源由 electron-builder.yml 的 publish(github) 决定；仅打包安装版生效。
 */
export function initAutoUpdater(getWin: () => BrowserWindow | null): void {
  getWindow = getWin
  if (!app.isPackaged) {
    log.info('Auto-update skipped: not a packaged build')
    return
  }

  autoUpdater.logger = log
  autoUpdater.autoInstallOnAppQuit = true

  const auto = isAutoUpdateEnabled()
  autoUpdater.autoDownload = auto

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version}`)
    emit({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('No update available (already latest)')
    emit({ state: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('error', (err) => {
    const message = err == null ? 'unknown' : (err.stack || err.message || String(err))
    log.warn('Auto-update error:', message)
    emit({ state: 'error', message })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Update downloaded: ${info.version}`)
    emit({ state: 'downloaded', version: info.version })
  })

  if (auto) {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('checkForUpdates failed:', (err as Error).message)
    })
  }
}

/** 切换自动/手动模式（运行时） */
export function setUpdaterAutoMode(enabled: boolean): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = enabled
}

/** 手动检查更新 */
export async function checkForUpdatesManual(): Promise<void> {
  if (!app.isPackaged) {
    emit({ state: 'not-available' })
    return
  }
  emit({ state: 'checking' })
  await autoUpdater.checkForUpdates()
}

/** 手动下载更新 */
export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return
  await autoUpdater.downloadUpdate()
}

/** 退出并安装已下载的更新 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}

/** 当前应用版本号 */
export function getAppVersion(): string {
  return app.getVersion()
}
