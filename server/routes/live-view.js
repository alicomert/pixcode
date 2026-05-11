import { promises as fs } from 'node:fs';
import path from 'node:path';

import express from 'express';

import { extractProjectDirectory } from '../projects.js';
import { getTunnelState } from '../services/external-access.js';
import {
  getLiveViewSessionByShareId,
  getLiveViewState,
  restartLiveView,
  startLiveView,
  stopLiveView,
} from '../services/live-view.js';

const router = express.Router();

function requestBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function buildUrls(req, session) {
  if (!session?.sharePath) return { local: null, external: null, preferred: null };
  const local = `${requestBaseUrl(req)}${session.sharePath}`;
  const tunnel = getTunnelState();
  const external = tunnel?.running && tunnel.url ? `${tunnel.url}${session.sharePath}` : null;
  return {
    local,
    external,
    preferred: external || local,
  };
}

async function resolveProjectPath(projectName) {
  const projectPath = await extractProjectDirectory(projectName);
  if (!projectPath || typeof projectPath !== 'string') {
    const error = new Error('Project path could not be resolved.');
    error.statusCode = 404;
    throw error;
  }
  return projectPath;
}

router.get('/:projectName/status', async (req, res) => {
  try {
    const { projectName } = req.params;
    const projectPath = await resolveProjectPath(projectName);
    const state = await getLiveViewState(projectName, projectPath);
    res.json({
      ...state,
      urls: buildUrls(req, state.session),
      tunnel: getTunnelState(),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to read Live View state' });
  }
});

router.post('/:projectName/start', async (req, res) => {
  try {
    const { projectName } = req.params;
    const projectPath = await resolveProjectPath(projectName);
    const session = await startLiveView(projectName, projectPath, req.body || {});
    res.json({
      success: true,
      session,
      urls: buildUrls(req, session),
      tunnel: getTunnelState(),
    });
  } catch (error) {
    const status = error.code === 'LIVE_VIEW_NOT_AVAILABLE' ? 422 : 500;
    res.status(status).json({ error: error.message || 'Failed to start Live View' });
  }
});

router.post('/:projectName/restart', async (req, res) => {
  try {
    const { projectName } = req.params;
    const projectPath = await resolveProjectPath(projectName);
    const session = await restartLiveView(projectName, projectPath, req.body || {});
    res.json({
      success: true,
      session,
      urls: buildUrls(req, session),
      tunnel: getTunnelState(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to restart Live View' });
  }
});

router.post('/:projectName/stop', async (req, res) => {
  try {
    const session = await stopLiveView(req.params.projectName);
    res.json({
      success: true,
      session,
      urls: buildUrls(req, session),
      tunnel: getTunnelState(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to stop Live View' });
  }
});

function resolveStaticFile(staticRoot, requestUrl) {
  const parsed = new URL(requestUrl, 'http://pixcode.local');
  const rawPath = decodeURIComponent(parsed.pathname || '/');
  const relativePath = rawPath.replace(/^\/+/, '') || 'index.html';
  const root = path.resolve(staticRoot);
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('Live View path is outside the static root.');
    error.statusCode = 403;
    throw error;
  }

  return candidate;
}

async function sendStaticLiveView(req, res, session) {
  const root = session.staticRoot;
  let filePath = resolveStaticFile(root, req.url);
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    await fs.access(filePath);
  } catch {
    filePath = path.join(root, 'index.html');
  }

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(filePath);
}

async function proxyLiveView(req, res, session) {
  if (!session.upstreamUrl) {
    res.status(503).json({ error: 'Live View upstream is not ready yet.' });
    return;
  }

  const targetUrl = new URL(req.url || '/', session.upstreamUrl);
  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        accept: req.header('accept') || '*/*',
        'user-agent': req.header('user-agent') || 'pixcode-live-view',
      },
    });
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'content-encoding' || lower === 'content-length') return;
      if (lower === 'x-frame-options' || lower === 'content-security-policy') return;
      res.setHeader(key, value);
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ error: error.message || 'Live View proxy failed' });
  }
}

export function createLiveViewPublicRouter() {
  const publicRouter = express.Router();

  publicRouter.use('/:shareId', async (req, res) => {
    const session = getLiveViewSessionByShareId(req.params.shareId);
    if (!session || session.status === 'stopped' || session.status === 'error') {
      res.status(404).json({ error: 'Live View session not found.' });
      return;
    }

    if (session.kind === 'static') {
      await sendStaticLiveView(req, res, session);
      return;
    }

    await proxyLiveView(req, res, session);
  });

  return publicRouter;
}

export default router;
