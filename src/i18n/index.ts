import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zh from './locales/zh.json'

export const SUPPORTED_LANGS = ['en', 'zh'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  zh: '中文'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh }
  },
  lng: 'en',
  fallbackLng: 'en',
  initImmediate: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false }
})

export function setLanguage(lang: Lang): void {
  i18n.changeLanguage(lang)
  window.api.settings.setLanguage(lang)
}

/** 各语言下的「未命名项目」占位名，用于判断场景是否仍为自动占位名（跨语言稳健） */
const DEFAULT_PROJECT_NAMES = ['Untitled project', '未命名项目']

export function isDefaultProjectName(name: string): boolean {
  return DEFAULT_PROJECT_NAMES.includes(name.trim())
}

export default i18n
