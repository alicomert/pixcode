import type { RequestHandler, Router } from 'express';
import express from 'express';

import { getKnownPreviewPort } from '@/modules/orchestration/preview/port-watcher.js';

function buildTargetUrl(port: number, path: string): string {
  const event = getKnownPreviewPort(port);
  const host = event?.host ?? '127.0.0.1';
  return `http://${host}:${port}${path}`;
}

function proxyHandler(): RequestHandler {
  return async (req, res) => {
    const rawPort = Array.isArray(req.params.port) ? req.params.port[0] : req.params.port;
    const port = Number.parseInt(rawPort, 10);
    if (!Number.isFinite(port) || port <= 0 || !getKnownPreviewPort(port)) {
      res.status(404).json({
        error: {
          code: 'PREVIEW_PORT_NOT_FOUND',
          message: 'Preview port is not registered for an orchestration task.',
        },
      });
      return;
    }

    const path = req.originalUrl.replace(/^\/preview\/\d+/, '') || '/';
    const target = buildTargetUrl(port, path);
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: {
          accept: req.header('accept') ?? '*/*',
          'user-agent': req.header('user-agent') ?? 'pixcode-preview-proxy',
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
      res.status(502).json({
        error: {
          code: 'PREVIEW_PROXY_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };
}

export function createPreviewProxyRouter(): Router {
  const router = express.Router();
  router.use('/:port', proxyHandler());
  router.use('/:port/*', proxyHandler());
  return router;
}
