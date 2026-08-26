import { signal } from '@preact/signals'
import tr from '../i18n/locales/tr.json'
import en from '../i18n/locales/en.json'

// English is the product default. Additional locale files are integrated in
// phase two without changing the fallback behavior.
const dictionaries = { en, tr }
const stored = localStorage.getItem('pixcode.locale')
const detected = 'en'
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
  return value.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '')
}

setLocale(locale.value)
