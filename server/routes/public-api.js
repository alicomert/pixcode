import express from 'express';

import { buildOpenApiFragment, buildPublicApiManifest } from '../services/public-api-manifest.js';

const router = express.Router();

function requestBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${proto}://${host}` : '';
}

router.get('/manifest', (req, res) => {
  res.json(buildPublicApiManifest({ baseUrl: requestBaseUrl(req) }));
});

router.get('/openapi', (req, res) => {
  res.json(buildOpenApiFragment({ baseUrl: requestBaseUrl(req) }));
});

export default router;
