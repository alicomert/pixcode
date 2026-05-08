export type UpdateCheckFrequency = 'off' | '6h' | '12h' | '24h' | '7d';

export type UpdateCheckPreferences = {
  frequency: UpdateCheckFrequency;
};

export const UPDATE_CHECK_PREFERENCES_STORAGE_KEY = 'pixcode.updateCheck.preferences';
export const UPDATE_CHECK_SETTINGS_EVENT = 'pixcode:update-check-settings-changed';

export const UPDATE_CHECK_FREQUENCY_OPTIONS: Array<{
  value: UpdateCheckFrequency;
  label: string;
  intervalMs: number | null;
}> = [
  { value: '24h', label: 'Daily', intervalMs: 24 * 60 * 60 * 1000 },
  { value: '12h', label: 'Every 12 hours', intervalMs: 12 * 60 * 60 * 1000 },
  { value: '6h', label: 'Every 6 hours', intervalMs: 6 * 60 * 60 * 1000 },
  { value: '7d', label: 'Weekly', intervalMs: 7 * 24 * 60 * 60 * 1000 },
  { value: 'off', label: 'Manual only', intervalMs: null },
];

export const DEFAULT_UPDATE_CHECK_PREFERENCES: UpdateCheckPreferences = {
  frequency: '24h',
};

export function getUpdateCheckIntervalMs(preferences: UpdateCheckPreferences): number | null {
  return UPDATE_CHECK_FREQUENCY_OPTIONS.find((option) => option.value === preferences.frequency)?.intervalMs ?? null;
}

export function normalizeUpdateCheckPreferences(value: unknown): UpdateCheckPreferences {
  if (!value || typeof value !== 'object') {
    return DEFAULT_UPDATE_CHECK_PREFERENCES;
  }

  const frequency = (value as { frequency?: unknown }).frequency;
  if (UPDATE_CHECK_FREQUENCY_OPTIONS.some((option) => option.value === frequency)) {
    return { frequency: frequency as UpdateCheckFrequency };
  }

  return DEFAULT_UPDATE_CHECK_PREFERENCES;
}

export function readUpdateCheckPreferences(): UpdateCheckPreferences {
  try {
    const raw = localStorage.getItem(UPDATE_CHECK_PREFERENCES_STORAGE_KEY);
    return normalizeUpdateCheckPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_UPDATE_CHECK_PREFERENCES;
  }
}

export function saveUpdateCheckPreferences(preferences: UpdateCheckPreferences): void {
  const normalized = normalizeUpdateCheckPreferences(preferences);
  localStorage.setItem(UPDATE_CHECK_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(UPDATE_CHECK_SETTINGS_EVENT, { detail: normalized }));
}
