/**
 * Resolve workspace path for NanoClaw/PixBot.
 *
 * ONLY:
 *   1. Explicit projectPath from the client (if it exists on disk)
 *   2. projectId when it is itself an absolute filesystem path
 *   3. Pixcode project registry (`extractProjectDirectory`) — user-configured
 *      workspaces, any language/script in path names
 *
 * Never guesses locale folders (Documents/PROJELER/…), home layouts, or
 * hardcoded project names. Paths and names are user-defined worldwide.
 */
import fs from 'node:fs';
import path from 'node:path';

function existsDir(p) {
  try {
    return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function looksLikeAbsolutePath(value) {
  if (!value || typeof value !== 'string') return false;
  if (path.isAbsolute(value)) return true;
  // Windows drive: C:\… or C:/…
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  // UNC \\server\share
  if (/^\\\\/.test(value)) return true;
  return false;
}

/**
 * @param {{ projectId?: string|null, projectPath?: string|null }} opts
 * @returns {Promise<string|null>}
 */
export async function resolveNanoclawProjectPath({ projectId, projectPath } = {}) {
  const explicit = typeof projectPath === 'string' ? projectPath.trim() : '';
  if (explicit && existsDir(explicit)) {
    return path.resolve(explicit);
  }

  const id = typeof projectId === 'string' ? projectId.trim() : '';
  if (!id || id === 'general') {
    return null;
  }

  // Client sometimes sends the real path as projectId
  if (looksLikeAbsolutePath(id) && existsDir(id)) {
    return path.resolve(id);
  }

  // Only trusted source for named projects: registry / originalPath
  try {
    const { extractProjectDirectory } = await import('../../projects.js');
    const fromReg = await Promise.race([
      extractProjectDirectory(id).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (fromReg && existsDir(fromReg)) {
      return path.resolve(fromReg);
    }
  } catch {
    /* ignore */
  }

  return null;
}
