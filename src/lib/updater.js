// Public release metadata for the desktop and web distributions. The check
// is deliberately informational: unsigned binaries are never downloaded or
// executed by the app. Users can review the GitHub release before installing
// an update, which also keeps the checker safe when a network is intercepted.

export const CURRENT_VERSION = "2.0.7"
export const RELEASE_URL = 'https://github.com/alicomert/pixcode/releases/latest'
const RELEASE_API_URL = 'https://api.github.com/repos/alicomert/pixcode/releases/latest'

function versionParts(value) {
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/)
  if (!match) return null
  return {
    numbers: [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)],
    prerelease: match[4] || ''
  }
}

export function compareVersions(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  if (!a || !b) return 0
  for (let index = 0; index < a.numbers.length; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] > b.numbers[index] ? 1 : -1
  }
  // A stable release is newer than its prerelease (2.0.6 > 2.0.6-beta.1).
  if (a.prerelease === b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true })
}

function platformAsset(assets = []) {
  const platform = typeof navigator !== 'undefined'
    ? (navigator.platform || '') + ' ' + (navigator.userAgent || '')
    : ''
  const names = assets
    .filter((asset) => asset && typeof asset.name === 'string' && typeof asset.browser_download_url === 'string')
    .map((asset) => ({ name: asset.name, url: asset.browser_download_url }))
  if (!names.length) return null
  const preferred = platform.toLowerCase().includes('win')
    ? names.find((asset) => /\.(msi|exe)$/i.test(asset.name))
    : platform.toLowerCase().includes('mac') || platform.toLowerCase().includes('darwin')
      ? names.find((asset) => /\.dmg$/i.test(asset.name))
      : platform.toLowerCase().includes('linux')
        ? names.find((asset) => /\.(appimage|deb|rpm)$/i.test(asset.name))
        : null
  return preferred || names.find((asset) => /\.(exe|msi|dmg|appimage|deb|rpm)$/i.test(asset.name)) || null
}

function releaseResult(release) {
  const tag = typeof release?.tag_name === 'string' ? release.tag_name : ''
  const version = tag.replace(/^v/i, '')
  const releaseUrl = typeof release?.html_url === 'string' ? release.html_url : RELEASE_URL
  const asset = platformAsset(release?.assets)
  return {
    currentVersion: CURRENT_VERSION,
    version,
    updateAvailable: Boolean(version && compareVersions(version, CURRENT_VERSION) > 0),
    releaseUrl,
    assetUrl: asset?.url || '',
    assetName: asset?.name || '',
    name: typeof release?.name === 'string' ? release.name : ('Pixcode ' + tag),
    notes: typeof release?.body === 'string' ? release.body.trim() : '',
    publishedAt: release?.published_at || ''
  }
}

/**
 * Check the public GitHub release feed. This never needs a Pixcode account or
 * token and rejects malformed responses so a proxy cannot make the UI offer a
 * bogus installer.
 */
export async function checkForUpdate({ timeout = 8_000, signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal
    })
    if (!response.ok) throw new Error('release feed returned ' + response.status)
    const release = await response.json()
    if (!release || typeof release !== 'object') throw new Error('invalid release feed')
    return releaseResult(release)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
