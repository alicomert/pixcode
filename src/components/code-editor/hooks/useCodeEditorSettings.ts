import { useEffect, useState } from 'react';

import {
  CODE_EDITOR_DEFAULTS,
  CODE_EDITOR_SETTINGS_CHANGED_EVENT,
  CODE_EDITOR_STORAGE_KEYS,
} from '../constants/settings';

const safeGetStorage = (key: string) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Editor still updates in-memory when browser storage is unavailable.
  }
};

const readAppTheme = () => {
  const savedTheme = safeGetStorage('theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme === 'dark';
  }

  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return true;
  }

  return CODE_EDITOR_DEFAULTS.isDarkMode;
};

const readTheme = () => {
  const savedTheme = safeGetStorage(CODE_EDITOR_STORAGE_KEYS.theme);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme === 'dark';
  }

  return readAppTheme();
};

const readBoolean = (storageKey: string, defaultValue: boolean, falseValue = 'false') => {
  const value = safeGetStorage(storageKey);
  if (value === null) {
    return defaultValue;
  }

  return value !== falseValue;
};

const readWordWrap = () => {
  return safeGetStorage(CODE_EDITOR_STORAGE_KEYS.wordWrap) === 'true';
};

const readFontSize = () => {
  const stored = safeGetStorage(CODE_EDITOR_STORAGE_KEYS.fontSize);
  return Number(stored ?? CODE_EDITOR_DEFAULTS.fontSize);
};

export const useCodeEditorSettings = () => {
  const [isDarkMode, setIsDarkMode] = useState(readTheme);
  const [wordWrap, setWordWrap] = useState(readWordWrap);
  const [minimapEnabled, setMinimapEnabled] = useState(() => (
    readBoolean(CODE_EDITOR_STORAGE_KEYS.showMinimap, CODE_EDITOR_DEFAULTS.minimapEnabled)
  ));
  const [showLineNumbers, setShowLineNumbers] = useState(() => (
    readBoolean(CODE_EDITOR_STORAGE_KEYS.lineNumbers, CODE_EDITOR_DEFAULTS.showLineNumbers)
  ));
  const [fontSize, setFontSize] = useState(readFontSize);

  // Keep legacy behavior where the editor writes theme and wrap settings directly.
  useEffect(() => {
    safeSetStorage(CODE_EDITOR_STORAGE_KEYS.theme, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    safeSetStorage(CODE_EDITOR_STORAGE_KEYS.wordWrap, String(wordWrap));
  }, [wordWrap]);

  useEffect(() => {
    const refreshFromStorage = () => {
      setIsDarkMode(readTheme());
      setWordWrap(readWordWrap());
      setMinimapEnabled(readBoolean(CODE_EDITOR_STORAGE_KEYS.showMinimap, CODE_EDITOR_DEFAULTS.minimapEnabled));
      setShowLineNumbers(readBoolean(CODE_EDITOR_STORAGE_KEYS.lineNumbers, CODE_EDITOR_DEFAULTS.showLineNumbers));
      setFontSize(readFontSize());
    };

    window.addEventListener('storage', refreshFromStorage);
    window.addEventListener(CODE_EDITOR_SETTINGS_CHANGED_EVENT, refreshFromStorage);

    return () => {
      window.removeEventListener('storage', refreshFromStorage);
      window.removeEventListener(CODE_EDITOR_SETTINGS_CHANGED_EVENT, refreshFromStorage);
    };
  }, []);

  return {
    isDarkMode,
    setIsDarkMode,
    wordWrap,
    setWordWrap,
    minimapEnabled,
    setMinimapEnabled,
    showLineNumbers,
    setShowLineNumbers,
    fontSize,
    setFontSize,
  };
};
