/**
 * PixBot / Tasks entry — backed by embedded NanoClaw-lite (server/vendor/nanoclaw-lite).
 * Legacy PixBot chat heuristics removed; nanoclaw schedule/MCP model is the source of truth.
 */
import {
  nanoclawRouter,
  nanoclawTaskScheduler,
  startNanoclawBridge,
} from '../nanoclaw/bridge.js';

export function taskRouter() {
  return nanoclawRouter();
}

export const taskScheduler = nanoclawTaskScheduler;

// Eager init flag for diagnostics
export { startNanoclawBridge };
