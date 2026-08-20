import express from 'express';

import sessionManager from '../sessionManager.js';
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
        const owner = ownership[`qwen:${sessionId}`];
        return Number(owner?.userId) === Number(user?.id ?? user?.userId);
    } catch {
        return false;
    }
}

// Delete a Qwen Code session — mirrors the Gemini/Codex routes so the UI's
// unified delete flow works identically regardless of the active provider.
router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId || typeof sessionId !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(sessionId)) {
            return res.status(400).json({ success: false, error: 'Invalid session ID format' });
        }
        if (!ownsSession(req.user, sessionId)) {
            return res.status(403).json({ success: false, error: 'Session access denied.' });
        }

        await sessionManager.deleteSession(sessionId);
        sessionNamesDb.deleteName(sessionId, 'qwen');
        const ownership = JSON.parse(appConfigDb.get('session_ownership') || '{}');
        delete ownership[`qwen:${sessionId}`];
        appConfigDb.set('session_ownership', JSON.stringify(ownership));
        res.json({ success: true });
    } catch (error) {
        console.error(`Error deleting Qwen session ${req.params.sessionId}:`, error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

export default router;
