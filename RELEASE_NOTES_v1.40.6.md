# Pixcode v1.40.6

This patch fixes the Live View managed runtime startup errors reported after v1.40.5.

## Fixed

- Vite and other package-script previews no longer fail with `Runtime metadata request failed with HTTP 406`; Pixcode now asks the npm registry for normal JSON metadata instead of using GitHub's API media type.
- npm registry and custom runtime downloads no longer receive GitHub bearer auth headers unless the URL is actually GitHub-hosted.
- PHP managed runtime setup on Windows now passes `Expand-Archive` arguments through a PowerShell param block, fixing the empty `LiteralPath` error during FrankenPHP zip extraction.

## Verified

- Live View integration smoke test now covers npm metadata header handling and managed npm installation.
- The smoke test also guards the Windows archive extraction command shape that caused the PHP runtime failure.
