import type { CSSProperties } from 'react';

import type { LucideIcon } from '@/lib/icons';

export type AutoShowAgentDiffMode = 'always' | 'openOnly' | 'off';

export type PreferenceToggleKey =
  | 'autoExpandTools'
  | 'showRawParameters'
  | 'showThinking'
  | 'autoScrollToBottom'
  | 'sendByCtrlEnter';

export type PreferenceSelectKey = 'autoShowAgentDiff';

export type QuickSettingsPreferences = Record<PreferenceToggleKey, boolean> & {
  autoShowAgentDiff: AutoShowAgentDiffMode;
};

export type PreferenceToggleItem = {
  key: PreferenceToggleKey;
  labelKey: string;
  icon: LucideIcon;
};

export type QuickSettingsHandleStyle = CSSProperties;
