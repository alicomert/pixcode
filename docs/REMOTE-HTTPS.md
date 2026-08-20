# Pixcode: stable remote HTTPS access

Pixcode can be served behind a reverse proxy with a stable hostname even when
you do not own a domain. `sslip.io` and `nip.io` provide DNS only: a hostname
such as `pixcode.203.0.113.10.sslip.io` resolves to `203.0.113.10`, but neither
service provides a proxy or a TLS certificate.

The repository includes an optional Caddy overlay. Caddy terminates HTTPS and
automatically renews a Let's Encrypt certificate while ports 80 and 443 are
reachable from the Internet.

```powershell
$env:PUBLIC_IP = "203.0.113.10"
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

The HTTPS overlay derives `PIXCODE_DOMAIN` inside Caddy as
`pixcode.<PUBLIC_IP>.<PUBLIC_PROXY_DOMAIN>`; set `PIXCODE_DOMAIN` explicitly
when using a real domain or a non-default DNS suffix. The derivation is
intentionally done inside the container so different Compose implementations
do not interpret nested defaults differently.

The overlay fails fast when neither `PUBLIC_IP` nor `PIXCODE_DOMAIN` is set;
this prevents an accidental localhost certificate from being presented as a
public deployment.

The resulting URL is:

```text
https://pixcode.203.0.113.10.sslip.io
```

For a real domain, set `PIXCODE_DOMAIN` instead:

```powershell
$env:PIXCODE_DOMAIN = "code.example.com"
$env:CORS_ORIGINS = "https://code.example.com"
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

Operational requirements:

- Use Docker Compose 2.24+; the overlay uses the `!override` merge tag to
  replace the base port list and keep Pixcode's API bound to loopback only.
- The server must have a stable public IPv4 address (or use a real DNS record).
- TCP ports 80 and 443 must be forwarded to the Caddy container.
- Keep Pixcode's port 3001 private; expose only Caddy.
- Set `TRUST_PROXY_HOPS=1` only when Pixcode is actually behind one trusted
  reverse-proxy hop.
- Never set `CORS_ALLOW_ALL=1` on an Internet-facing deployment.
- `PUBLIC_IP` is metadata and does not discover your public address. Set it
  explicitly to avoid publishing an incorrect URL.

Authentication transport:

- Use `Authorization: Bearer <px_...>` or `X-API-Key: <px_...>` for API calls.
- Browser SSE/WebSocket clients should request a short-lived stream ticket from
  `/api/auth/stream-ticket` and pass only `?streamTicket=...` to the stream URL.
- Raw `?token=...` and `?apiKey=...` credentials are disabled by default. They
  can be re-enabled for legacy EventSource clients with
  `PIXCODE_ALLOW_QUERY_CREDENTIALS=1`, but this exposes credentials to browser
  history, proxy logs, and referrer headers and is not recommended on public
  deployments.

If inbound ports cannot be opened, use the built-in Cloudflare Tunnel or
Tailscale flow from Settings → Access. Those are different from sslip.io/nip.io
and do not require an inbound port, but their URLs/availability follow the
tunnel provider's lifecycle.
