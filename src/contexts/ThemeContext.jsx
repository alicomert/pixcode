import React, { createContext, useContext, useState, useEffect } from 'react';

import {
  DEFAULT_CUSTOM_DARK,
  DEFAULT_CUSTOM_LIGHT,
  THEME_ACCENT_STORAGE_KEY,
  THEME_CUSTOM_DARK_STORAGE_KEY,
  THEME_CUSTOM_LIGHT_STORAGE_KEY,
  applyThemeAccent,
  readThemeAccent,
  readThemeColor,
} from '../theme/appTheme';

const ThemeContext = createContext();
const CODE_EDITOR_THEME_KEY = 'codeEditorTheme';
const CODE_EDITOR_SETTINGS_CHANGED_EVENT = 'codeEditorSettingsChanged';

const toThemeName = (isDarkMode) => (isDarkMode ? 'dark' : 'light');

const syncCodeEditorThemeWithApp = (currentIsDarkMode, nextIsDarkMode) => {
  const currentAppTheme = toThemeName(currentIsDarkMode);
  const nextAppTheme = toThemeName(nextIsDarkMode);
  const editorTheme = localStorage.getItem(CODE_EDITOR_THEME_KEY);

  if (!editorTheme || editorTheme === currentAppTheme) {
    localStorage.setItem(CODE_EDITOR_THEME_KEY, nextAppTheme);
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
  // Check for saved theme preference or default to system preference
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    
    // Check system preference
    if (window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    return false;
  });
  const [accentTheme, setAccentThemeState] = useState(readThemeAccent);
  const [customLightAccent, setCustomLightAccentState] = useState(() => (
    readThemeColor(THEME_CUSTOM_LIGHT_STORAGE_KEY, DEFAULT_CUSTOM_LIGHT)
  ));
  const [customDarkAccent, setCustomDarkAccentState] = useState(() => (
    readThemeColor(THEME_CUSTOM_DARK_STORAGE_KEY, DEFAULT_CUSTOM_DARK)
  ));

  // Update document class and localStorage when theme changes
  useEffect(() => {
    const activeThemeColor = applyThemeAccent(
      document.documentElement,
      accentTheme,
      isDarkMode,
      customLightAccent,
      customDarkAccent,
    );

    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      
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
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      
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
  }, [accentTheme, customDarkAccent, customLightAccent, isDarkMode]);

  // Listen for system theme changes
  useEffect(() => {
    if (!window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      // Only update if user hasn't manually set a preference
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme) {
        setIsDarkMode(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      syncCodeEditorThemeWithApp(prev, next);
      return next;
    });
  };

  const setAccentTheme = (theme) => {
    setAccentThemeState(theme);
    localStorage.setItem(THEME_ACCENT_STORAGE_KEY, theme);
  };

  const setCustomLightAccent = (color) => {
    setCustomLightAccentState(color);
    localStorage.setItem(THEME_CUSTOM_LIGHT_STORAGE_KEY, color);
  };

  const setCustomDarkAccent = (color) => {
    setCustomDarkAccentState(color);
    localStorage.setItem(THEME_CUSTOM_DARK_STORAGE_KEY, color);
  };

  const value = {
    isDarkMode,
    toggleDarkMode,
    accentTheme,
    setAccentTheme,
    customLightAccent,
    setCustomLightAccent,
    customDarkAccent,
    setCustomDarkAccent,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
