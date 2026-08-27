import { signal } from '@preact/signals'
import tr from '../i18n/locales/tr.json'
import en from '../i18n/locales/en.json'
import de from '../i18n/locales/de.json'
import es from '../i18n/locales/es.json'
import it from '../i18n/locales/it.json'
import ja from '../i18n/locales/ja.json'
import ko from '../i18n/locales/ko.json'
import ru from '../i18n/locales/ru.json'
import zhCN from '../i18n/locales/zh-CN.json'

// Keep the dictionaries flat and small. Missing keys intentionally fall back
// to English so a newly added screen never renders a raw translation key.
const dictionaries = { en, tr, de, es, it, ja, ko, ru, 'zh-CN': zhCN }
export const languages = [
  { value: 'en', label: 'English', nativeName: 'English' },
  { value: 'tr', label: 'Turkish', nativeName: 'Türkçe' },
  { value: 'de', label: 'German', nativeName: 'Deutsch' },
  { value: 'es', label: 'Spanish', nativeName: 'Español' },
  { value: 'it', label: 'Italian', nativeName: 'Italiano' },
  { value: 'ja', label: 'Japanese', nativeName: '日本語' },
  { value: 'ko', label: 'Korean', nativeName: '한국어' },
  { value: 'ru', label: 'Russian', nativeName: 'Русский' },
  { value: 'zh-CN', label: 'Simplified Chinese', nativeName: '简体中文' }
]
const stored = localStorage.getItem('pixcode.locale')
const browserLanguage = typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]).find((value) => languages.some((language) => language.value === value || value?.startsWith(`${language.value}-`))) : ''
const detected = languages.find((language) => language.value === browserLanguage || browserLanguage?.startsWith(`${language.value}-`))?.value || 'en'
export const locale = signal(stored && dictionaries[stored] ? stored : detected)

export function setLocale(language) {
  const next = dictionaries[language] ? language : 'en'
  locale.value = next
  localStorage.setItem('pixcode.locale', next)
  document.documentElement.lang = next
}

export function t(key, vars = {}) {
  const dictionary = dictionaries[locale.value] || dictionaries.en
  const value = dictionary[key] || dictionaries.en[key] || key
  return String(value).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '')
}

setLocale(locale.value)
