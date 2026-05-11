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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function latestErrorFromLogs(logs) {
  return [...logs].reverse().find((line) => /error|enoent|eaddrinuse|failed|fatal|exception/i.test(line)) || null;
}

function buildLiveViewSuggestions(session, reason) {
  const framework = String(session?.framework || session?.label || '').toLowerCase();
  const status = String(session?.status || '').toLowerCase();
  const suggestions = [];

  if (framework.includes('php')) {
    suggestions.push('Run `php --version` in the same machine and make sure the PHP executable is available in PATH.');
    suggestions.push('If PHP is installed outside PATH, use Live View custom command with the full php executable path.');
    suggestions.push('Check that the project has an index.php or a valid PHP router file in the selected project root.');
  } else if (
    framework.includes('javascript')
    || framework.includes('vite')
    || framework.includes('next')
    || framework.includes('nuxt')
    || framework.includes('astro')
    || framework.includes('react')
    || framework.includes('node')
  ) {
    suggestions.push('Run the project command in a terminal first and confirm it opens a local HTTP port.');
    suggestions.push('Install project dependencies if node_modules is missing, then retry Live View.');
    suggestions.push('If the dev server ignores PORT, set a custom command that binds to 127.0.0.1 and the chosen port.');
  } else {
    suggestions.push('Run the displayed command in a terminal and fix the first process error shown there.');
    suggestions.push('Use a custom command if Pixcode detected the wrong runner for this project.');
  }

  if (status === 'starting' || reason === 'upstream_not_ready') {
    suggestions.push('Wait for the app to finish booting, then press Refresh or Restart if the port never opens.');
  }

  if (reason === 'proxy_failed') {
    suggestions.push('The Live View session exists, but Pixcode could not reach the local upstream URL.');
  }

  return suggestions;
}

export function buildLiveViewUnavailablePayload(session, options = {}) {
  const logs = Array.isArray(session?.log) ? session.log.slice(-40) : [];
  const errorDetail = options.errorMessage || session?.error || latestErrorFromLogs(logs);
  const label = session?.label || session?.framework || 'Live View';
  const status = session?.status || 'missing';

  return {
    error: 'Live View session is not available.',
    message: `${label} is ${status}.`,
    reason: options.reason || status,
    status,
    framework: session?.framework || null,
    label,
    projectName: session?.projectName || null,
    shareId: session?.shareId || options.shareId || null,
    sharePath: session?.sharePath || null,
    upstreamUrl: session?.upstreamUrl || null,
    port: session?.port || null,
    errorDetail,
    diagnostics: {
      command: session?.command?.displayCommand || null,
      upstreamUrl: session?.upstreamUrl || null,
      port: session?.port || null,
      startedAt: session?.startedAt || null,
      stoppedAt: session?.stoppedAt || null,
      exitCode: session?.exitCode ?? null,
      exitSignal: session?.exitSignal ?? null,
      logs,
    },
    suggestions: buildLiveViewSuggestions(session, options.reason),
  };
}

export function renderLiveViewDiagnosticHtml(payload) {
  const suggestions = payload.suggestions?.length
    ? payload.suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    : '<li>Open the Live View panel, check the latest logs, and restart the session.</li>';
  const logs = payload.diagnostics?.logs?.length
    ? payload.diagnostics.logs.map((line) => escapeHtml(line)).join('\n')
    : 'No process logs were captured yet.';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pixcode Live View diagnostics</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: #0b0f14; color: #e5edf5; }
    main { box-sizing: border-box; max-width: 980px; margin: 0 auto; padding: 32px 20px; }
    .eyebrow { color: #f97316; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 8px 0 10px; font-size: clamp(26px, 5vw, 44px); line-height: 1.05; }
    p { color: #a8b3c2; line-height: 1.6; }
    section { margin-top: 18px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 12px; background: rgba(15, 23, 42, .72); padding: 16px; }
    dl { display: grid; grid-template-columns: minmax(110px, 180px) minmax(0, 1fr); gap: 10px 14px; margin: 0; }
    dt { color: #94a3b8; font-size: 12px; text-transform: uppercase; }
    dd { margin: 0; overflow-wrap: anywhere; }
    pre { margin: 0; max-height: 280px; overflow: auto; white-space: pre-wrap; color: #dbeafe; background: #020617; border-radius: 10px; padding: 14px; }
    code { color: #bfdbfe; }
    li { margin: 8px 0; color: #d0d8e4; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Pixcode Live View</div>
    <h1>${escapeHtml(payload.message)}</h1>
    <p>${escapeHtml(payload.errorDetail || 'The preview link is active, but the local runner is not ready.')}</p>
    <section>
      <dl>
        <dt>Status</dt><dd>${escapeHtml(payload.status)}</dd>
        <dt>Framework</dt><dd>${escapeHtml(payload.framework || 'Unknown')}</dd>
        <dt>Command</dt><dd><code>${escapeHtml(payload.diagnostics?.command || 'No command captured')}</code></dd>
        <dt>Upstream</dt><dd>${escapeHtml(payload.upstreamUrl || 'Not ready')}</dd>
        <dt>Share ID</dt><dd>${escapeHtml(payload.shareId || 'Unknown')}</dd>
      </dl>
    </section>
    <section>
      <h2>What to check</h2>
      <ul>${suggestions}</ul>
    </section>
    <section>
      <h2>Process logs</h2>
      <pre>${logs}</pre>
    </section>
  </main>
</body>
</html>`;
}

function requestPrefersHtml(req) {
  const accept = req.header('accept') || '';
  return accept.includes('text/html') || (!accept.includes('application/json') && accept.includes('*/*'));
}

function sendLiveViewDiagnostic(req, res, session, statusCode, options = {}) {
  const payload = buildLiveViewUnavailablePayload(session, options);
  res.status(statusCode);
  if (requestPrefersHtml(req)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(renderLiveViewDiagnosticHtml(payload));
    return;
  }
  res.json(payload);
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
    sendLiveViewDiagnostic(req, res, session, 503, {
      reason: 'upstream_not_ready',
      errorMessage: 'Live View upstream is not ready yet.',
    });
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
    sendLiveViewDiagnostic(req, res, session, 502, {
      reason: 'proxy_failed',
      errorMessage: error.message || 'Live View proxy failed',
    });
  }
}

export function createLiveViewPublicRouter() {
  const publicRouter = express.Router();

  publicRouter.use('/:shareId', async (req, res) => {
    const session = getLiveViewSessionByShareId(req.params.shareId);
    if (!session) {
      sendLiveViewDiagnostic(req, res, {
        shareId: req.params.shareId,
        status: 'missing',
        label: 'Live View session',
        log: [],
      }, 404, {
        reason: 'missing_session',
        errorMessage: 'This preview link does not match an active Live View session on this Pixcode server.',
      });
      return;
    }

    if (session.status === 'error') {
      sendLiveViewDiagnostic(req, res, session, 502, { reason: 'session_error' });
      return;
    }

    if (session.status === 'stopped') {
      sendLiveViewDiagnostic(req, res, session, 410, { reason: 'session_stopped' });
      return;
    }

    if (session.status === 'starting') {
      sendLiveViewDiagnostic(req, res, session, 202, { reason: 'upstream_not_ready' });
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
