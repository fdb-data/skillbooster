import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import App from './App'
import i18n from './i18n'
import { applyTheme } from './theme'

async function bootstrap(): Promise<void> {
  try {
    const res = await window.api.settings.getLanguage()
    if (res.success && res.data) await i18n.changeLanguage(res.data)
  } catch {
    // 读取失败则用默认英文
  }

  try {
    const res = await window.api.settings.getTheme()
    if (res.success && res.data) applyTheme(res.data)
  } catch {
    // 读取失败则用默认（跟随系统）
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

bootstrap()
