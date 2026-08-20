import net from 'node:net';

/**
 * Public URL helpers used by the self-hosted deployment and access screens.
 *
 * sslip.io/nip.io are DNS services, not HTTPS proxies.  They turn an address
 * such as `pixcode.203.0.113.10.sslip.io` into an A record for 203.0.113.10.
 * A reverse proxy (Caddy/nginx/Traefik) must still terminate TLS.  Keeping the
 * rules here gives the UI and deployment examples one canonical URL format.
 */

const SUPPORTED_PROXY_DOMAINS = new Set(['sslip.io', 'nip.io']);

function normalizeIp(value) {
  const ip = typeof value === 'string' ? value.trim() : '';
  // The free DNS services support IPv4 labels.  IPv6 requires a different
  // bracket/encoding form and is intentionally left to an explicit URL.
  if (!ip || net.isIP(ip) !== 4) return null;
  return ip;
}

export function normalizePublicUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;

  // Reject control characters before URL parsing. Besides producing clearer
  // diagnostics this prevents a value copied from a shell/config file from
  // becoming a response-header or Caddyfile injection later on.
  if (/[\u0000-\u001f\u007f]/u.test(raw)) {
    throw new Error('PUBLIC_URL must not contain control characters.');
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PUBLIC_URL must be a valid http:// or https:// URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_URL must use http:// or https://.');
  }
  if (url.username || url.password) {
    throw new Error('PUBLIC_URL must not contain credentials.');
  }
  if (!url.hostname || url.hostname.length > 253) {
    throw new Error('PUBLIC_URL must contain a valid hostname.');
  }

  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function buildIpDnsPublicUrl({
  ip,
  proxyDomain = process.env.PIXCODE_PUBLIC_PROXY_DOMAIN || process.env.PUBLIC_PROXY_DOMAIN || 'sslip.io',
  prefix = process.env.PIXCODE_PUBLIC_PROXY_PREFIX || process.env.PUBLIC_PROXY_PREFIX || 'pixcode',
  scheme = process.env.PIXCODE_PUBLIC_SCHEME || process.env.PUBLIC_SCHEME || 'https',
  port = null,
} = {}) {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp) return null;

  const domain = String(proxyDomain || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!SUPPORTED_PROXY_DOMAINS.has(domain)) return null;

  const label = String(prefix || 'pixcode').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) return null;

  const normalizedScheme = String(scheme || '').trim().toLowerCase();
  if (normalizedScheme !== 'http' && normalizedScheme !== 'https') return null;
  const protocol = normalizedScheme;
  const rawPort = String(port ?? '').trim();
  const numericPort = /^\d+$/u.test(rawPort) ? Number(rawPort) : NaN;
  const includePort = Number.isInteger(numericPort)
    && numericPort > 0
    && numericPort <= 65535
    && !((protocol === 'http' && numericPort === 80) || (protocol === 'https' && numericPort === 443));
  return `${protocol}://${label}.${normalizedIp}.${domain}${includePort ? `:${numericPort}` : ''}`;
}

export function resolveConfiguredPublicUrl({ request = null } = {}) {
  const explicit = process.env.PIXCODE_PUBLIC_URL || process.env.PUBLIC_URL;
  if (explicit) {
    try {
      return {
        url: normalizePublicUrl(explicit),
        source: 'configured',
        tls: String(explicit).trim().toLowerCase().startsWith('https://'),
      };
    } catch {
      // Invalid optional configuration should not prevent a local server from
      // starting.  Expose no URL rather than echoing an unsafe value.
    }
  }

  const publicIp = process.env.PIXCODE_PUBLIC_IP || process.env.PUBLIC_IP;
  const proxyUrl = buildIpDnsPublicUrl({
    ip: publicIp,
    port: process.env.PIXCODE_PUBLIC_PORT || process.env.PUBLIC_PORT || null,
  });
  if (proxyUrl) {
    return {
      url: proxyUrl,
      source: 'ip-dns',
      tls: proxyUrl.startsWith('https://'),
      proxyDomain: process.env.PIXCODE_PUBLIC_PROXY_DOMAIN || process.env.PUBLIC_PROXY_DOMAIN || 'sslip.io',
    };
  }

  if (request) {
    const headers = request.headers || {};
    const trustProxy = request.app?.get?.('trust proxy');
    const proxyTrusted = trustProxy === true
      || (Number.isInteger(trustProxy) && trustProxy > 0);
    const forwardedProto = proxyTrusted
      ? String(headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase()
      : '';
    const forwardedHost = proxyTrusted
      ? String(headers['x-forwarded-host'] || '').split(',')[0].trim()
      : '';
    const rawHost = forwardedHost || String(request.get?.('host') || headers.host || '').trim();
    const host = normalizeRequestHost(rawHost);
    if (host) {
      const protocol = forwardedProto === 'https' || request.socket?.encrypted ? 'https' : 'http';
      return { url: `${protocol}://${host}`, source: 'request', tls: protocol === 'https' };
    }
  }

  return { url: null, source: 'none', tls: false };
}

function normalizeRequestHost(value) {
  const raw = String(value || '').split(',')[0].trim();
  if (!raw || raw.length > 255 || /[\s/?#\\]/u.test(raw)) return null;
  try {
    const parsed = new URL(`http://${raw}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    // URL.hostname accepts a wider set than HTTP Host (for example a trailing
    // dot and malformed bracket forms). Keep the canonical host:port only.
    return parsed.host || null;
  } catch {
    return null;
  }
}

export function getPublicAccessConfig({ request = null } = {}) {
  const resolved = resolveConfiguredPublicUrl({ request });
  return {
    ...resolved,
    proxy: resolved.source === 'ip-dns',
    requiresReverseProxy: resolved.source === 'ip-dns' && resolved.tls,
    notes: resolved.source === 'ip-dns'
      ? 'sslip.io/nip.io only provide DNS. Put Caddy, nginx, or Traefik in front for HTTPS.'
      : null,
  };
}
