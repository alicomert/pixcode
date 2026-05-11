# Security Policy

Pixcode is a self-hosted control plane for local projects, provider CLIs, API
keys, Telegram pairing, shell access, files, Git state, and agent sessions. Treat
it like sensitive developer infrastructure.

## Supported Versions

Security fixes are targeted at the latest published release and the current
`main` branch.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | Best effort |

## Reporting a Vulnerability

Please do not open a public issue for private vulnerabilities, leaked tokens, or
exploit details.

Use GitHub Security Advisories for this repository when available. If advisory
reporting is not available, contact the repository owner privately through
GitHub and include:

- affected Pixcode version or commit,
- operating system and deployment mode,
- reproduction steps,
- expected impact,
- relevant logs with secrets removed.

## Deployment Guidance

- Do not expose Pixcode directly to the public internet without a trusted reverse
  proxy, VPN, firewall, or equivalent access control.
- Use strong local account credentials.
- Rotate `px_` API keys and provider tokens if they are exposed.
- Do not paste production provider tokens into public issues or screenshots.
- Keep desktop installers and npm packages updated from official Pixcode
  releases.

## Scope

Reports are most useful when they involve Pixcode application code, API
authorization, session isolation, secret handling, desktop packaging, update
behavior, or unsafe shell/file access.
