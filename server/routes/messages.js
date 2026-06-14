/**
 * Unified messages endpoint.
 *
 * GET /api/sessions/:sessionId/messages?provider=claude&projectName=foo&limit=50&offset=0
 *
 * Replaces the four provider-specific session message endpoints with a single route
 * that delegates to the appropriate adapter via the provider registry.
 *
 * @module routes/messages
 */

import path from 'node:path';

import express from 'express';

import { sessionsService } from '../modules/providers/services/sessions.service.js';
import { userHasProjectAccess } from '../services/platformization.js';
import { appConfigDb } from '../database/db.js';

const router = express.Router();
const SESSION_OWNERSHIP_KEY = 'session_ownership';

function readSessionOwnership() {
  try {
    return JSON.parse(appConfigDb.get(SESSION_OWNERSHIP_KEY) || '{}');
  } catch {
    return {};
  }
}

function canUserReadSession(user, provider, sessionId) {
  if (['admin', 'owner'].includes(user?.role)) return true;
  const owner = readSessionOwnership()[`${provider || 'claude'}:${sessionId}`];
  return Boolean(owner?.userId && Number(owner.userId) === Number(user?.id ?? user?.userId));
}

/**
 * GET /api/sessions/:sessionId/messages
 *
 * Auth: authenticateToken applied at mount level in index.js
 *
 * Query params:
 *   provider    - 'claude' | 'cursor' | 'codex' | 'gemini' (default: 'claude')
 *   projectName - required for claude provider
 *   projectPath - required for cursor provider (absolute path used for cwdId hash)
 *   limit       - page size (omit or null for all)
 *   offset      - pagination offset (default: 0)
 */
router.get('/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const provider = String(req.query.provider || 'claude').trim().toLowerCase();
    const projectName = req.query.projectName || '';
    const projectPath = req.query.projectPath || '';
    const limitParam = req.query.limit;
    const limit = limitParam !== undefined && limitParam !== null && limitParam !== ''
      ? parseInt(limitParam, 10)
      : null;
    const offset = parseInt(req.query.offset || '0', 10);

    const availableProviders = sessionsService.listProviderIds();
    if (!availableProviders.includes(provider)) {
      const available = availableProviders.join(', ');
      return res.status(400).json({ error: `Unknown provider: ${provider}. Available: ${available}` });
    }

    if (!projectName && !projectPath) {
      return res.status(400).json({ error: 'projectName or projectPath is required' });
    }

    const projectRef = projectName
      ? { name: String(projectName), projectName: String(projectName) }
      : { fullPath: path.resolve(String(projectPath)), path: path.resolve(String(projectPath)), projectPath: path.resolve(String(projectPath)) };

    if (!userHasProjectAccess(req.user, projectRef, 'viewFiles')) {
      return res.status(403).json({ error: 'Project access denied.' });
    }

    if (!canUserReadSession(req.user, provider, sessionId)) {
      return res.status(403).json({ error: 'Session access denied.' });
    }

    const result = await sessionsService.fetchHistory(provider, sessionId, {
      projectName,
      projectPath,
      limit,
      offset,
    });

    return res.json(result);
  } catch (error) {
    console.error('Error fetching unified messages:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;
