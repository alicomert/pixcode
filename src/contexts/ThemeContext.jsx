import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_CUSTOM_DARK,
  DEFAULT_CUSTOM_LIGHT,
  THEME_ACCENT_STORAGE_KEY,
  THEME_CUSTOM_DARK_STORAGE_KEY,
  THEME_CUSTOM_LIGHT_STORAGE_KEY,
  applyThemeAccent,
  isThemeAccentId,
  isThemeHexColor,
  readThemeAccent,
  readThemeColor,
} from '../theme/appTheme';

const ThemeContext = createContext();
const CODE_EDITOR_THEME_KEY = 'codeEditorTheme';
const CODE_EDITOR_SETTINGS_CHANGED_EVENT = 'codeEditorSettingsChanged';
const APP_THEME_CHANGED_EVENT = 'pixcode:theme-changed';

const toThemeName = (isDarkMode) => (isDarkMode ? 'dark' : 'light');

const readStorage = (key) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Theme still applies to the current document if storage is unavailable.
  }
};

const syncCodeEditorThemeWithApp = (currentIsDarkMode, nextIsDarkMode) => {
  const currentAppTheme = toThemeName(currentIsDarkMode);
  const nextAppTheme = toThemeName(nextIsDarkMode);
  const editorTheme = readStorage(CODE_EDITOR_THEME_KEY);

  if (!editorTheme || editorTheme === currentAppTheme) {
    writeStorage(CODE_EDITOR_THEME_KEY, nextAppTheme);
    window.dispatchEvent(new Event(CODE_EDITOR_SETTINGS_CHANGED_EVENT));
  }
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Check for saved theme preference or default to Pixcode's dark workbench.
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = readStorage('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }

    return true;
  });
  const [accentTheme, setAccentThemeState] = useState(readThemeAccent);
  const [customLightAccent, setCustomLightAccentState] = useState(() => (
    readThemeColor(THEME_CUSTOM_LIGHT_STORAGE_KEY, DEFAULT_CUSTOM_LIGHT)
  ));
  const [customDarkAccent, setCustomDarkAccentState] = useState(() => (
    readThemeColor(THEME_CUSTOM_DARK_STORAGE_KEY, DEFAULT_CUSTOM_DARK)
  ));
  const previousThemeNameRef = useRef(toThemeName(isDarkMode));

  // Update document class and localStorage when theme changes
  useEffect(() => {
    const root = document.documentElement;
    const nextThemeName = toThemeName(isDarkMode);
    const previousThemeName = previousThemeNameRef.current;
    const activeThemeColor = applyThemeAccent(
      root,
      accentTheme,
      isDarkMode,
      customLightAccent,
      customDarkAccent,
    );

    if (isDarkMode) {
      root.classList.add('dark');
      writeStorage('theme', nextThemeName);
      
      // Update iOS status bar style and theme color for dark mode
      const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (statusBarMeta) {
        statusBarMeta.setAttribute('content', 'black-translucent');
      }
      
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', activeThemeColor);
      }
    } else {
      root.classList.remove('dark');
      writeStorage('theme', nextThemeName);
      
      // Update iOS status bar style and theme color for light mode
      const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (statusBarMeta) {
        statusBarMeta.setAttribute('content', 'default');
      }
      
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', activeThemeColor);
      }
    }

    if (previousThemeName !== nextThemeName) {
      syncCodeEditorThemeWithApp(previousThemeName === 'dark', isDarkMode);
      previousThemeNameRef.current = nextThemeName;
    }

    window.dispatchEvent(new CustomEvent(APP_THEME_CHANGED_EVENT, {
      detail: {
        mode: nextThemeName,
        accentTheme,
        color: activeThemeColor,
      },
    }));
  }, [accentTheme, customDarkAccent, customLightAccent, isDarkMode]);

  // Listen for system theme changes
  useEffect(() => {
    if (!window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      // Only update if user hasn't manually set a preference
      const savedTheme = readStorage('theme');
      if (!savedTheme) {
        setIsDarkMode(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === 'theme') {
        if (event.newValue === 'dark' || event.newValue === 'light') {
          setIsDarkMode(event.newValue === 'dark');
        }
        return;
      }

      if (event.key === THEME_ACCENT_STORAGE_KEY) {
        if (isThemeAccentId(event.newValue)) {
          setAccentThemeState(event.newValue);
        }
        return;
      }

      if (event.key === THEME_CUSTOM_LIGHT_STORAGE_KEY) {
        if (isThemeHexColor(event.newValue)) {
          setCustomLightAccentState(event.newValue);
        }
        return;
      }

      if (event.key === THEME_CUSTOM_DARK_STORAGE_KEY && isThemeHexColor(event.newValue)) {
        setCustomDarkAccentState(event.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      syncCodeEditorThemeWithApp(prev, next);
      return next;
    });
  }, []);

  const setAccentTheme = useCallback((theme) => {
    if (!isThemeAccentId(theme)) {
      return;
    }
    setAccentThemeState(theme);
    writeStorage(THEME_ACCENT_STORAGE_KEY, theme);
  }, []);

  const setCustomLightAccent = useCallback((color) => {
    if (!isThemeHexColor(color)) {
      return;
    }
    setCustomLightAccentState(color);
    writeStorage(THEME_CUSTOM_LIGHT_STORAGE_KEY, color);
  }, []);

  const setCustomDarkAccent = useCallback((color) => {
    if (!isThemeHexColor(color)) {
      return;
    }
    setCustomDarkAccentState(color);
    writeStorage(THEME_CUSTOM_DARK_STORAGE_KEY, color);
  }, []);

  const value = useMemo(() => ({
    isDarkMode,
    toggleDarkMode,
    accentTheme,
    setAccentTheme,
    customLightAccent,
    setCustomLightAccent,
    customDarkAccent,
    setCustomDarkAccent,
  }), [
    accentTheme,
    customDarkAccent,
    customLightAccent,
    isDarkMode,
    setAccentTheme,
    setCustomDarkAccent,
    setCustomLightAccent,
    toggleDarkMode,
  ]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
