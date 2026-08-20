/**
 * Environment Flag: Is Platform
 * Indicates if the app is running in Platform mode (hosted) or OSS mode (self-hosted)
 */
export const IS_PLATFORM = import.meta.env.VITE_IS_PLATFORM === 'true';

// Hosted builds must opt in on both sides of the boundary before the UI
// skips its normal JWT/API-key flow. The backend uses the matching
// PIXCODE_ALLOW_PLATFORM_AUTH_BYPASS=1 guard; keeping a separate Vite flag
// prevents a platform-branded build from silently assuming that its reverse
// proxy is providing identity when it is not.
const platformAuthBypassFlag = String(import.meta.env.VITE_PLATFORM_AUTH_BYPASS || '').trim().toLowerCase();
export const PLATFORM_AUTH_BYPASS_ENABLED = IS_PLATFORM
  && (platformAuthBypassFlag === '1' || platformAuthBypassFlag === 'true');

/**
 * For empty shell instances where no project is provided, 
 * we use a default project object to ensure the shell can still function. 
 * This prevents errors related to missing project data.
 */
export const DEFAULT_PROJECT_FOR_EMPTY_SHELL = {
  name: 'default',
  displayName: 'default',
  fullPath: IS_PLATFORM ? '/workspace' : '',
  path: IS_PLATFORM ? '/workspace' : '',
};
