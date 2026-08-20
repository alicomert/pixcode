import express from 'express';

import {
  buildCurlCookbook,
  buildOpenApiFragment,
  buildPublicApiManifest,
  buildTypeScriptSdkStarter,
} from '../services/public-api-manifest.js';
import { resolveConfiguredPublicUrl } from '../utils/public-url.js';

const router = express.Router();

function requestBaseUrl(req) {
  // Reuse the hardened public-url resolver so forwarded headers are honored
  // only when Express is configured to trust the corresponding proxy hops,
  // and configured PUBLIC_URL takes precedence over client-controlled headers.
  return resolveConfiguredPublicUrl({ request: req }).url || '';
}

router.get('/manifest', (req, res) => {
  res.json(buildPublicApiManifest({ baseUrl: requestBaseUrl(req) }));
});

router.get('/openapi', (req, res) => {
  res.json(buildOpenApiFragment({ baseUrl: requestBaseUrl(req) }));
});

router.get('/sdk/typescript', (req, res) => {
  res.type('text/typescript').send(buildTypeScriptSdkStarter({ baseUrl: requestBaseUrl(req) }));
});

router.get('/cookbook', (req, res) => {
  res.json(buildCurlCookbook({ baseUrl: requestBaseUrl(req) }));
});

export default router;
