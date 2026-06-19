import { app, dialog, BrowserWindow } from 'electron'
import log from 'electron-log'
import pkg from 'electron-updater'
import { mt } from './i18n'

// electron-updater 是 CommonJS 默认导出，ESM/TS 下解构取 autoUpdater
const { autoUpdater } = pkg

/**
 * 自动更新：静默后台下载新版，下载完成后提示用户重启安装。
 * 发布源由 electron-builder.yml 的 publish(github) 决定，打包时写入 app-update.yml。
 * 仅在已打包安装版生效；dev / 未打包运行直接跳过。
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    log.info('Auto-update skipped: not a packaged build')
    return
  }

  autoUpdater.logger = log
  autoUpdater.autoDownload = true // 静默下载
  autoUpdater.autoInstallOnAppQuit = true // 兜底：用户没点重启，退出时也会装上

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version}, downloading in background...`)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('No update available (already latest)')
  })

  autoUpdater.on('error', (err) => {
    log.warn('Auto-update error:', err == null ? 'unknown' : (err.stack || err.message || String(err)))
  })

  autoUpdater.on('update-downloaded', async (info) => {
    log.info(`Update downloaded: ${info.version}`)
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: [mt('updateRestartNow'), mt('updateLater')],
      defaultId: 0,
      cancelId: 1,
      title: mt('updateReadyTitle'),
      message: mt('updateReadyTitle'),
      detail: mt('updateReadyBody').replace('{version}', info.version)
    }
    const result = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    if (result.response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.checkForUpdates().catch((err) => {
    log.warn('checkForUpdates failed:', (err as Error).message)
  })
}
