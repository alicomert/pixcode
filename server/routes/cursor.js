import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import express from 'express';

import { getDefaultProviderModel, getStaticProviderModels } from '../services/model-registry.js';

const router = express.Router();

// Cursor's CLI config can contain credentials and machine-specific paths in
// addition to the model picker data the web client needs.  Never return the
// raw file over a multi-user API; keep only the stable, non-secret shape.
function publicCursorConfig(config) {
  const model = config && typeof config.model === 'object' ? config.model : {};
  const permissions = config && typeof config.permissions === 'object' ? config.permissions : {};
  const strings = (value) => (Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string').map((entry) => entry.slice(0, 200)).slice(0, 200)
    : []);
  return {
    version: typeof config?.version === 'number' || typeof config?.version === 'string' ? config.version : 1,
    model: {
      modelId: typeof model.modelId === 'string' ? model.modelId.slice(0, 200) : null,
      displayName: typeof model.displayName === 'string' ? model.displayName.slice(0, 200) : null,
    },
    permissions: {
      allow: strings(permissions.allow),
      deny: strings(permissions.deny),
    },
  };
}

function readCursorDefaultModel() {
  const modelId = getDefaultProviderModel('cursor');
  const displayName = getStaticProviderModels('cursor').find((model) => model.value === modelId)?.label || modelId;
  return { modelId, displayName };
}

// GET /api/cursor/config - Read Cursor CLI configuration.
router.get('/config', async (req, res) => {
  try {
    const configPath = path.join(os.homedir(), '.cursor', 'cli-config.json');

    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);

      res.json({
        success: true,
        config: publicCursorConfig(config),
      });
    } catch (error) {
      // Config doesn't exist or is invalid, so return the UI default shape.
      console.log('Cursor config not found or invalid:', error.message);
      const defaultModel = readCursorDefaultModel();

      res.json({
        success: true,
        config: {
          version: 1,
          model: {
            modelId: defaultModel.modelId,
            displayName: defaultModel.displayName,
          },
          permissions: {
            allow: [],
            deny: [],
          },
        },
        isDefault: true,
      });
    }
  } catch (error) {
    console.error('Error reading Cursor config:', error);
    res.status(500).json({
      error: 'Failed to read Cursor configuration',
      details: error.message,
    });
  }
});

export default router;
