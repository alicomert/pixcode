import express from 'express';

import { apiKeysDb, credentialsDb, notificationPreferencesDb, pushSubscriptionsDb } from '../database/db.js';
import { isAdminUser } from '../services/platformization.js';
import { getPublicKey } from '../services/vapid-keys.js';
import { createNotificationEvent, notifyUserIfEnabled } from '../services/notification-orchestrator.js';
import { listNotificationTaxonomy } from '../services/notification-taxonomy.js';

const router = express.Router();

const ELEVATED_API_KEY_SCOPES = new Set(['*', 'admin', 'system', 'system:update', 'system:restart']);
const MAX_API_KEY_NAME_LENGTH = 120;
const MAX_CREDENTIAL_NAME_LENGTH = 160;
const MAX_CREDENTIAL_TYPE_LENGTH = 120;
const MAX_CREDENTIAL_VALUE_LENGTH = 8192;
const DEFAULT_NEW_API_KEY_SCOPES = ['projects:read'];

function normalizeUserApiKeyScopes(req, requested) {
  const scopes = apiKeysDb.normalizeScopes(requested);
  if (!isAdminUser(req.user) && scopes.some((scope) => ELEVATED_API_KEY_SCOPES.has(scope))) {
    const error = new Error('Only an admin-scoped account may grant admin or system API-key scopes.');
    error.statusCode = 403;
    throw error;
  }
  return scopes;
}

// ===============================
// API Keys Management
// ===============================

// Get all API keys for the authenticated user
router.get('/api-keys', async (req, res) => {
  try {
    const apiKeys = apiKeysDb.getApiKeys(req.user.id);
    // Don't send the full API key in the list for security
    const sanitizedKeys = apiKeys.map(key => ({
      ...key,
      api_key: key.api_key.substring(0, 10) + '...'
    }));
    res.json({ apiKeys: sanitizedKeys });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Create a new API key
router.post('/api-keys', async (req, res) => {
  try {
    const { keyName, scopes } = req.body;

    if (typeof keyName !== 'string' || !keyName.trim()) {
      return res.status(400).json({ error: 'Key name is required' });
    }
    if (keyName.trim().length > MAX_API_KEY_NAME_LENGTH) {
      return res.status(400).json({ error: `Key name must be ${MAX_API_KEY_NAME_LENGTH} characters or fewer.` });
    }

    // Keep pre-scope clients (which omit `scopes`) backwards compatible while
    // treating an explicitly supplied empty array as an intentional
    // least-privilege key.  The database records this distinction for the
    // central API-key scope middleware.
    const hasScopesField = Object.prototype.hasOwnProperty.call(req.body || {}, 'scopes');
    if (hasScopesField && !Array.isArray(scopes)) {
      return res.status(400).json({ error: 'scopes must be a non-empty array' });
    }
    const normalizedScopes = normalizeUserApiKeyScopes(
      req,
      hasScopesField ? scopes : DEFAULT_NEW_API_KEY_SCOPES,
    );
    if (normalizedScopes.length === 0) {
      return res.status(400).json({ error: 'At least one API-key scope is required.' });
    }
    const result = apiKeysDb.createApiKey(req.user.id, keyName.trim(), normalizedScopes);
    res.json({
      success: true,
      apiKey: result
    });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Delete an API key
router.delete('/api-keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    const success = apiKeysDb.deleteApiKey(req.user.id, parseInt(keyId));

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// Toggle API key active status
router.patch('/api-keys/:keyId/toggle', async (req, res) => {
  try {
    const { keyId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const success = apiKeysDb.toggleApiKey(req.user.id, parseInt(keyId), isActive);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    console.error('Error toggling API key:', error);
    res.status(500).json({ error: 'Failed to toggle API key' });
  }
});

// Update API key scopes
router.patch('/api-keys/:keyId/scopes', async (req, res) => {
  try {
    const { keyId } = req.params;
    const { scopes } = req.body;

    if (!Array.isArray(scopes)) {
      return res.status(400).json({ error: 'scopes must be a non-empty array' });
    }

    const normalizedScopes = normalizeUserApiKeyScopes(req, scopes);
    if (normalizedScopes.length === 0) {
      return res.status(400).json({ error: 'At least one API-key scope is required.' });
    }

    const success = apiKeysDb.updateApiKeyScopes(req.user.id, parseInt(keyId), normalizedScopes);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error updating API key scopes:', error);
    res.status(500).json({ error: 'Failed to update API key scopes' });
  }
});

// ===============================
// Generic Credentials Management
// ===============================

// Get all credentials for the authenticated user (optionally filtered by type)
router.get('/credentials', async (req, res) => {
  try {
    const { type } = req.query;
    const credentials = credentialsDb.getCredentials(req.user.id, type || null);
    // Don't send the actual credential values for security
    res.json({ credentials });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

// Create a new credential
router.post('/credentials', async (req, res) => {
  try {
    const { credentialName, credentialType, credentialValue, description } = req.body;

    if (typeof credentialName !== 'string' || !credentialName.trim()) {
      return res.status(400).json({ error: 'Credential name is required' });
    }
    if (credentialName.trim().length > MAX_CREDENTIAL_NAME_LENGTH) {
      return res.status(400).json({ error: `Credential name must be ${MAX_CREDENTIAL_NAME_LENGTH} characters or fewer.` });
    }

    if (typeof credentialType !== 'string' || !credentialType.trim()) {
      return res.status(400).json({ error: 'Credential type is required' });
    }
    if (credentialType.trim().length > MAX_CREDENTIAL_TYPE_LENGTH) {
      return res.status(400).json({ error: `Credential type must be ${MAX_CREDENTIAL_TYPE_LENGTH} characters or fewer.` });
    }

    if (typeof credentialValue !== 'string' || !credentialValue.trim()) {
      return res.status(400).json({ error: 'Credential value is required' });
    }
    if (credentialValue.length > MAX_CREDENTIAL_VALUE_LENGTH) {
      return res.status(400).json({ error: `Credential value must be ${MAX_CREDENTIAL_VALUE_LENGTH} characters or fewer.` });
    }

    const result = credentialsDb.createCredential(
      req.user.id,
      credentialName.trim(),
      credentialType.trim(),
      credentialValue.trim(),
      typeof description === 'string' ? description.trim().slice(0, 500) || null : null
    );

    res.json({
      success: true,
      credential: result
    });
  } catch (error) {
    console.error('Error creating credential:', error);
    res.status(500).json({ error: 'Failed to create credential' });
  }
});

// Delete a credential
router.delete('/credentials/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const success = credentialsDb.deleteCredential(req.user.id, parseInt(credentialId));

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Credential not found' });
    }
  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

// Toggle credential active status
router.patch('/credentials/:credentialId/toggle', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const success = credentialsDb.toggleCredential(req.user.id, parseInt(credentialId), isActive);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Credential not found' });
    }
  } catch (error) {
    console.error('Error toggling credential:', error);
    res.status(500).json({ error: 'Failed to toggle credential' });
  }
});

// ===============================
// Notification Preferences
// ===============================

router.get('/notification-preferences', async (req, res) => {
  try {
    const preferences = notificationPreferencesDb.getPreferences(req.user.id);
    res.json({ success: true, preferences });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

router.put('/notification-preferences', async (req, res) => {
  try {
    const preferences = notificationPreferencesDb.updatePreferences(req.user.id, req.body || {});
    res.json({ success: true, preferences });
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    res.status(500).json({ error: 'Failed to save notification preferences' });
  }
});

router.get('/notification-taxonomy', async (req, res) => {
  try {
    res.json({ success: true, events: listNotificationTaxonomy() });
  } catch (error) {
    console.error('Error fetching notification taxonomy:', error);
    res.status(500).json({ error: 'Failed to fetch notification taxonomy' });
  }
});

// ===============================
// Push Subscription Management
// ===============================

router.get('/push/vapid-public-key', async (req, res) => {
  try {
    const publicKey = getPublicKey();
    res.json({ publicKey });
  } catch (error) {
    console.error('Error fetching VAPID public key:', error);
    res.status(500).json({ error: 'Failed to fetch VAPID public key' });
  }
});

router.post('/push/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Missing subscription fields' });
    }
    pushSubscriptionsDb.saveSubscription(req.user.id, endpoint, keys.p256dh, keys.auth);

    // Enable webPush in preferences so the confirmation goes through the full pipeline
    const currentPrefs = notificationPreferencesDb.getPreferences(req.user.id);
    if (!currentPrefs?.channels?.webPush) {
      notificationPreferencesDb.updatePreferences(req.user.id, {
        ...currentPrefs,
        channels: { ...currentPrefs?.channels, webPush: true },
      });
    }

    res.json({ success: true });

    // Send a confirmation push through the full notification pipeline
    const event = createNotificationEvent({
      provider: 'system',
      eventType: 'push.enabled',
      kind: 'info',
      code: 'push.enabled',
      meta: { message: 'Push notifications are now enabled!' },
      severity: 'info'
    });
    notifyUserIfEnabled({ userId: req.user.id, event });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

router.post('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }
    pushSubscriptionsDb.removeSubscription(endpoint);

    // Disable webPush in preferences to match subscription state
    const currentPrefs = notificationPreferencesDb.getPreferences(req.user.id);
    if (currentPrefs?.channels?.webPush) {
      notificationPreferencesDb.updatePreferences(req.user.id, {
        ...currentPrefs,
        channels: { ...currentPrefs.channels, webPush: false },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

// Host OS for UI (e.g. hide Cursor agent when the backend runs on Windows).
router.get('/server-env', async (req, res) => {
  try {
    res.json({ platform: process.platform });
  } catch (error) {
    console.error('Error reading server environment:', error);
    res.status(500).json({ error: 'Failed to read server environment' });
  }
});

export default router;
