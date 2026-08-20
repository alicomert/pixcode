import express from 'express';

import { deleteCodexSession } from '../projects.js';
import { appConfigDb, sessionNamesDb } from '../database/db.js';

const router = express.Router();

function ownsSession(user, sessionId) {
  if (['admin', 'owner'].includes(user?.role)) {
    if (!user?.api_key_id) return true;
    const scopes = Array.isArray(user.api_key_scopes) ? user.api_key_scopes : [];
    const hasExplicitScopes = user.api_key_has_explicit_scopes === true || scopes.length > 0;
    if (!hasExplicitScopes) return true;
    return scopes.includes('*') || scopes.includes('admin') || scopes.includes('system');
  }
  try {
    const ownership = JSON.parse(appConfigDb.get('session_ownership') || '{}');
    const owner = ownership[`codex:${sessionId}`];
    return Number(owner?.userId) === Number(user?.id ?? user?.userId);
  } catch {
    return false;
  }
}

router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(sessionId) || !ownsSession(req.user, sessionId)) {
      return res.status(403).json({ success: false, error: 'Session access denied.' });
    }
    await deleteCodexSession(sessionId);
    sessionNamesDb.deleteName(sessionId, 'codex');
    const ownership = JSON.parse(appConfigDb.get('session_ownership') || '{}');
    delete ownership[`codex:${sessionId}`];
    appConfigDb.set('session_ownership', JSON.stringify(ownership));
    res.json({ success: true });
  } catch (error) {
    console.error(`Error deleting Codex session ${req.params.sessionId}:`, error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
