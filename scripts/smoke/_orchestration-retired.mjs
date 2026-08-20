import { existsSync } from 'node:fs';

export const ORCHESTRATION_SKIP_MESSAGE = 'skipped (retired; use task system)';

/**
 * The orchestration UI/runtime was retired in favour of the task system. Keep
 * historical smoke checks useful for old checkouts, but make them harmless on
 * current checkouts where those source directories no longer exist.
 */
export function orchestrationSourceAvailable() {
  return existsSync('src/components/orchestration') || existsSync('server/modules/orchestration');
}

export function skipIfOrchestrationRetired(label = 'orchestration smoke') {
  if (orchestrationSourceAvailable()) return false;
  console.log(`${label}: ${ORCHESTRATION_SKIP_MESSAGE}`);
  return true;
}

/**
 * Probe the legacy API without masking an unavailable server. A 404/410 means
 * the endpoint itself is retired; connection failures still flow to the
 * original smoke-test error handling so infrastructure problems are visible.
 */
export async function skipIfOrchestrationApiRetired({
  baseUrl,
  path = '/api/orchestration/workflows',
  headers,
  label = 'orchestration smoke',
} = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { headers });
    if (response.status !== 404 && response.status !== 410) return false;
    console.log(`${label}: ${ORCHESTRATION_SKIP_MESSAGE}`);
    return true;
  } catch {
    return false;
  }
}
