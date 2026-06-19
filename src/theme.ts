export const THEME_MODES = ['light', 'dark', 'system'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

const media = window.matchMedia('(prefers-color-scheme: dark)')

/** 解析有效主题：system 时读系统偏好 */
function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return media.matches ? 'dark' : 'light'
  return mode
}

/** 把有效主题写到 <html data-theme>，CSS 令牌据此翻转 */
function paint(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', resolve(mode))
}

let current: ThemeMode = 'system'

// system 模式下，跟随系统明暗实时切换
media.addEventListener('change', () => {
  if (current === 'system') paint('system')
})

/** 仅应用（不持久化），供启动时调用避免闪烁 */
export function applyTheme(mode: ThemeMode): void {
  current = mode
  paint(mode)
}

/** 切换主题：应用 + 持久化到主进程 preference */
export function setTheme(mode: ThemeMode): void {
  applyTheme(mode)
  window.api.settings.setTheme(mode)
}
