import type { CSSProperties } from 'react';

import type { LucideIcon } from '@/lib/icons';

export type PreferenceToggleKey =
  | 'autoExpandTools'
  | 'showRawParameters'
  | 'showThinking'
  | 'autoScrollToBottom'
  | 'sendByCtrlEnter'
  | 'changeAwareness';

export type QuickSettingsPreferences = Record<PreferenceToggleKey, boolean>;

export type PreferenceToggleItem = {
  key: PreferenceToggleKey;
  labelKey: string;
  icon: LucideIcon;
};

export type QuickSettingsHandleStyle = CSSProperties;
