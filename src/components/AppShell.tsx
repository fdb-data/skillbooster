import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import { MindLogo, Settings as SettingsIcon, Sun, Moon, Monitor } from './Icons'
import { setTheme } from '../theme'
import type { ThemeMode } from '../theme'

const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system']
const THEME_ICON: Record<ThemeMode, React.FC<{ size?: number; color?: string }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor
}

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation()
  const currentPage = useSceneStore(s => s.currentPage)
  const setCurrentPage = useSceneStore(s => s.setCurrentPage)
  const error = useSceneStore(s => s.error)
  const clearError = useSceneStore(s => s.clearError)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')

  useEffect(() => {
    window.api.settings.getTheme().then(res => {
      if (res.success && res.data) setThemeMode(res.data as ThemeMode)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(themeMode)
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    setThemeMode(next)
    setTheme(next)
  }

  const ThemeIcon = THEME_ICON[themeMode]

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <button
          onClick={() => setCurrentPage('home')}
          className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80">
          <MindLogo size={16} />
          <span className="text-[12px] font-bold tracking-tight text-ink">{t('home.brand')}</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={cycleTheme}
            title={t(`settings.theme_${themeMode}`)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-tri transition-colors hover:bg-canvas hover:text-ink">
            <ThemeIcon size={14} />
          </button>
          <button
            onClick={() => setCurrentPage('settings')}
            title={t('home.settings')}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-canvas hover:text-ink ${currentPage === 'settings' ? 'bg-canvas text-ink' : 'text-tri'}`}>
            <SettingsIcon size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div
          className="cursor-pointer bg-danger-bg px-5 py-1.5 text-center text-[11px] text-danger-fg"
          onClick={clearError}>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

export default AppShell
