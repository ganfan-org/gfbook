import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './en'
import zh from './zh'

export type AppLang = 'zh' | 'en'

const LANG_KEY = 'gfbook-lang'

function readSavedLang(): AppLang | null {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    return saved === 'zh' || saved === 'en' ? saved : null
  } catch {
    return null
  }
}

function systemLang(): AppLang {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

const initialLang = readSavedLang() ?? systemLang()

void i18next.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

function syncDocumentLang(lang: AppLang): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
}

syncDocumentLang(initialLang)

export function currentLang(): AppLang {
  return i18next.language === 'zh' ? 'zh' : 'en'
}

export function changeLang(lang: AppLang): void {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* ignore */
  }
  void i18next.changeLanguage(lang)
  syncDocumentLang(lang)
}
