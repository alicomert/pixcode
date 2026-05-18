import { useCallback, useEffect, useRef, useState } from 'react';

import { useTheme } from '../../../contexts/ThemeContext';
import { authenticatedFetch } from '../../../utils/api';
import { persistLocalNotificationPreferences } from '../../../utils/localNotifications';
import { useProviderAuthStatus } from '../../provider-auth/hooks/useProviderAuthStatus';
import {
  DEFAULT_CODE_EDITOR_SETTINGS,
  DEFAULT_CURSOR_PERMISSIONS,
} from '../constants/constants';
import type {
  AgentProvider,
  ClaudePermissionsState,
  CodeEditorSettingsState,
  CodexPermissionMode,
  CursorPermissionsState,
  GeminiPermissionMode,
  NotificationPreferencesState,
  OpencodePermissionsState,
  ProjectSortOrder,
  QwenPermissionMode,
  SettingsMainTab,
} from '../types/types';

type ThemeContextValue = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
};

type UseSettingsControllerArgs = {
  isOpen: boolean;
  initialTab: string;
};

type ClaudeSettingsStorage = {
  allowedTools?: string[];
  disallowedTools?: string[];
  skipPermissions?: boolean;
  projectSortOrder?: ProjectSortOrder;
};

type CursorSettingsStorage = {
  allowedCommands?: string[];
  disallowedCommands?: string[];
  skipPermissions?: boolean;
};

type CodexSettingsStorage = {
  permissionMode?: CodexPermissionMode;
};

type OpencodeSettingsStorage = {
  allowPatterns?: string[];
  denyPatterns?: string[];
  skipPermissions?: boolean;
};

type NotificationPreferencesResponse = {
  success?: boolean;
  preferences?: NotificationPreferencesState;
};

type ActiveLoginProvider = AgentProvider | '';

const KNOWN_MAIN_TABS: SettingsMainTab[] = ['agents', 'access', 'appearance', 'git', 'api', 'tasks', 'notifications', 'plugins', 'mobile', 'telegram', 'diagnostics', 'about'];

const normalizeMainTab = (tab: string): SettingsMainTab => {
  // Keep backwards compatibility with older callers that still pass "tools".
  if (tab === 'tools') {
    return 'agents';
  }

  return KNOWN_MAIN_TABS.includes(tab as SettingsMainTab) ? (tab as SettingsMainTab) : 'agents';
};

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const toCodexPermissionMode = (value: unknown): CodexPermissionMode => {
  if (value === 'acceptEdits' || value === 'bypassPermissions') {
    return value;
  }

  return 'default';
};

const readCodeEditorTheme = (): CodeEditorSettingsState['theme'] => {
  const savedTheme = localStorage.getItem('codeEditorTheme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }

  return localStorage.getItem('theme') === 'dark' ? 'dark' : DEFAULT_CODE_EDITOR_SETTINGS.theme;
};

const readCodeEditorSettings = (): CodeEditorSettingsState => ({
  theme: readCodeEditorTheme(),
  wordWrap: localStorage.getItem('codeEditorWordWrap') === 'true',
  showMinimap: localStorage.getItem('codeEditorShowMinimap') !== 'false',
  lineNumbers: localStorage.getItem('codeEditorLineNumbers') !== 'false',
  fontSize: localStorage.getItem('codeEditorFontSize') ?? DEFAULT_CODE_EDITOR_SETTINGS.fontSize,
});

const toResponseJson = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;

const createEmptyClaudePermissions = (): ClaudePermissionsState => ({
  allowedTools: [],
  disallowedTools: [],
  skipPermissions: false,
});

const createEmptyCursorPermissions = (): CursorPermissionsState => ({
  ...DEFAULT_CURSOR_PERMISSIONS,
});

const createEmptyOpencodePermissions = (): OpencodePermissionsState => ({
  allowPatterns: [],
  denyPatterns: [],
  skipPermissions: false,
});

const createDefaultNotificationPreferences = (): NotificationPreferencesState => ({
  channels: {
    inApp: true,
    webPush: false,
    telegram: true,
    desktop: true,
  },
  events: {
    actionRequired: true,
    stop: true,
    error: true,
    updates: true,
  },
});

export function useSettingsController({ isOpen, initialTab }: UseSettingsControllerArgs) {
  const { isDarkMode, toggleDarkMode } = useTheme() as ThemeContextValue;
  const closeTimerRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<SettingsMainTab>(() => normalizeMainTab(initialTab));
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [projectSortOrder, setProjectSortOrder] = useState<ProjectSortOrder>('name');
  const [codeEditorSettings, setCodeEditorSettings] = useState<CodeEditorSettingsState>(() => (
    readCodeEditorSettings()
  ));

  const [claudePermissions, setClaudePermissions] = useState<ClaudePermissionsState>(() => (
    createEmptyClaudePermissions()
  ));
  const [cursorPermissions, setCursorPermissions] = useState<CursorPermissionsState>(() => (
    createEmptyCursorPermissions()
  ));
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferencesState>(() => (
    createDefaultNotificationPreferences()
  ));
  const [codexPermissionMode, setCodexPermissionMode] = useState<CodexPermissionMode>('default');
  const [geminiPermissionMode, setGeminiPermissionMode] = useState<GeminiPermissionMode>('default');
  const [qwenPermissionMode, setQwenPermissionMode] = useState<QwenPermissionMode>('default');
  const [opencodePermissions, setOpencodePermissions] = useState<OpencodePermissionsState>(() => (
    createEmptyOpencodePermissions()
  ));

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginProvider, setLoginProvider] = useState<ActiveLoginProvider>('');
  const {
    providerAuthStatus,
    checkProviderAuthStatus,
    refreshProviderAuthStatuses,
  } = useProviderAuthStatus();

  const loadSettings = useCallback(async () => {
    try {
      const savedClaudeSettings = parseJson<ClaudeSettingsStorage>(
        localStorage.getItem('claude-settings'),
        {},
      );
      setClaudePermissions({
        allowedTools: savedClaudeSettings.allowedTools || [],
        disallowedTools: savedClaudeSettings.disallowedTools || [],
        skipPermissions: Boolean(savedClaudeSettings.skipPermissions),
      });
      setProjectSortOrder(savedClaudeSettings.projectSortOrder === 'date' ? 'date' : 'name');

      const savedCursorSettings = parseJson<CursorSettingsStorage>(
        localStorage.getItem('cursor-tools-settings'),
        {},
      );
      setCursorPermissions({
        allowedCommands: savedCursorSettings.allowedCommands || [],
        disallowedCommands: savedCursorSettings.disallowedCommands || [],
        skipPermissions: Boolean(savedCursorSettings.skipPermissions),
      });

      const savedCodexSettings = parseJson<CodexSettingsStorage>(
        localStorage.getItem('codex-settings'),
        {},
      );
      setCodexPermissionMode(toCodexPermissionMode(savedCodexSettings.permissionMode));

      const savedGeminiSettings = parseJson<{ permissionMode?: GeminiPermissionMode }>(
        localStorage.getItem('gemini-settings'),
        {},
      );
      setGeminiPermissionMode(savedGeminiSettings.permissionMode || 'default');

      const savedQwenSettings = parseJson<{ permissionMode?: QwenPermissionMode }>(
        localStorage.getItem('qwen-settings'),
        {},
      );
      setQwenPermissionMode(savedQwenSettings.permissionMode || 'default');

      const savedOpencodeSettings = parseJson<OpencodeSettingsStorage>(
        localStorage.getItem('opencode-settings'),
        {},
      );
      setOpencodePermissions({
        allowPatterns: savedOpencodeSettings.allowPatterns || [],
        denyPatterns: savedOpencodeSettings.denyPatterns || [],
        skipPermissions: Boolean(savedOpencodeSettings.skipPermissions),
      });

      try {
        const notificationResponse = await authenticatedFetch('/api/settings/notification-preferences');
        if (notificationResponse.ok) {
          const notificationData = await toResponseJson<NotificationPreferencesResponse>(notificationResponse);
          if (notificationData.success && notificationData.preferences) {
            setNotificationPreferences(notificationData.preferences);
            persistLocalNotificationPreferences(notificationData.preferences);
          } else {
            const defaults = createDefaultNotificationPreferences();
            setNotificationPreferences(defaults);
            persistLocalNotificationPreferences(defaults);
          }
        } else {
          const defaults = createDefaultNotificationPreferences();
          setNotificationPreferences(defaults);
          persistLocalNotificationPreferences(defaults);
        }
      } catch {
        const defaults = createDefaultNotificationPreferences();
        setNotificationPreferences(defaults);
        persistLocalNotificationPreferences(defaults);
      }

    } catch (error) {
      console.error('Error loading settings:', error);
      setClaudePermissions(createEmptyClaudePermissions());
      setCursorPermissions(createEmptyCursorPermissions());
      setOpencodePermissions(createEmptyOpencodePermissions());
      const defaults = createDefaultNotificationPreferences();
      setNotificationPreferences(defaults);
      persistLocalNotificationPreferences(defaults);
      setCodexPermissionMode('default');
      setProjectSortOrder('name');
    }
  }, []);

  const openLoginForProvider = useCallback((provider: AgentProvider) => {
    setLoginProvider(provider);
    setShowLoginModal(true);
  }, []);

  const handleLoginComplete = useCallback((exitCode: number) => {
    if (exitCode !== 0 || !loginProvider) {
      return;
    }

    setSaveStatus('success');
    void checkProviderAuthStatus(loginProvider, { force: true });
  }, [checkProviderAuthStatus, loginProvider]);

  const saveSettings = useCallback(async () => {
    setSaveStatus(null);

    try {
      const now = new Date().toISOString();
      localStorage.setItem('claude-settings', JSON.stringify({
        allowedTools: claudePermissions.allowedTools,
        disallowedTools: claudePermissions.disallowedTools,
        skipPermissions: claudePermissions.skipPermissions,
        projectSortOrder,
        lastUpdated: now,
      }));

      localStorage.setItem('cursor-tools-settings', JSON.stringify({
        allowedCommands: cursorPermissions.allowedCommands,
        disallowedCommands: cursorPermissions.disallowedCommands,
        skipPermissions: cursorPermissions.skipPermissions,
        lastUpdated: now,
      }));

      localStorage.setItem('codex-settings', JSON.stringify({
        permissionMode: codexPermissionMode,
        lastUpdated: now,
      }));

      localStorage.setItem('gemini-settings', JSON.stringify({
        permissionMode: geminiPermissionMode,
        lastUpdated: now,
      }));

      localStorage.setItem('qwen-settings', JSON.stringify({
        permissionMode: qwenPermissionMode,
        lastUpdated: now,
      }));

      localStorage.setItem('opencode-settings', JSON.stringify({
        allowPatterns: opencodePermissions.allowPatterns,
        denyPatterns: opencodePermissions.denyPatterns,
        skipPermissions: opencodePermissions.skipPermissions,
        lastUpdated: now,
      }));

      // Notify same-tab listeners — the browser's `storage` event only
      // fires in OTHER tabs, so the sidebar previously polled every
      // second to catch sort-order changes. A broadcast here lets the
      // sidebar subscribe instead (see useSidebarController).
      window.dispatchEvent(new CustomEvent('pixcode:settings-changed'));

      const notificationResponse = await authenticatedFetch('/api/settings/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify(notificationPreferences),
      });
      if (!notificationResponse.ok) {
        throw new Error('Failed to save notification preferences');
      }
      persistLocalNotificationPreferences(notificationPreferences);

      setSaveStatus('success');
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
    }
  }, [
    claudePermissions.allowedTools,
    claudePermissions.disallowedTools,
    claudePermissions.skipPermissions,
    codexPermissionMode,
    cursorPermissions.allowedCommands,
    cursorPermissions.disallowedCommands,
    cursorPermissions.skipPermissions,
    notificationPreferences,
    geminiPermissionMode,
    qwenPermissionMode,
    opencodePermissions.allowPatterns,
    opencodePermissions.denyPatterns,
    opencodePermissions.skipPermissions,
    projectSortOrder,
  ]);

  const updateCodeEditorSetting = useCallback(
    <K extends keyof CodeEditorSettingsState>(key: K, value: CodeEditorSettingsState[K]) => {
      setCodeEditorSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab(normalizeMainTab(initialTab));
    void loadSettings();
    void refreshProviderAuthStatuses();
  }, [initialTab, isOpen, loadSettings, refreshProviderAuthStatuses]);

  useEffect(() => {
    localStorage.setItem('codeEditorTheme', codeEditorSettings.theme);
    localStorage.setItem('codeEditorWordWrap', String(codeEditorSettings.wordWrap));
    localStorage.setItem('codeEditorShowMinimap', String(codeEditorSettings.showMinimap));
    localStorage.setItem('codeEditorLineNumbers', String(codeEditorSettings.lineNumbers));
    localStorage.setItem('codeEditorFontSize', codeEditorSettings.fontSize);
    window.dispatchEvent(new Event('codeEditorSettingsChanged'));
  }, [codeEditorSettings]);

  // Auto-save permissions and sort order with debounce
  const autoSaveTimerRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    // Skip auto-save on initial load (settings are being loaded from localStorage)
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      saveSettings();
    }, 500);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [saveSettings]);

  // Clear save status after 2 seconds
  useEffect(() => {
    if (saveStatus === null) {
      return;
    }

    const timer = window.setTimeout(() => setSaveStatus(null), 2000);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  // Reset initial load flag when settings dialog opens
  useEffect(() => {
    if (isOpen) {
      isInitialLoadRef.current = true;
    }
  }, [isOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  return {
    activeTab,
    setActiveTab,
    isDarkMode,
    toggleDarkMode,
    saveStatus,
    projectSortOrder,
    setProjectSortOrder,
    codeEditorSettings,
    updateCodeEditorSetting,
    claudePermissions,
    setClaudePermissions,
    cursorPermissions,
    setCursorPermissions,
    notificationPreferences,
    setNotificationPreferences,
    codexPermissionMode,
    setCodexPermissionMode,
    providerAuthStatus,
    refreshProviderAuthStatuses,
    checkProviderAuthStatus,
    geminiPermissionMode,
    setGeminiPermissionMode,
    qwenPermissionMode,
    setQwenPermissionMode,
    opencodePermissions,
    setOpencodePermissions,
    openLoginForProvider,
    showLoginModal,
    setShowLoginModal,
    loginProvider,
    handleLoginComplete,
  };
}
