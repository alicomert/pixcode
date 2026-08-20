#!/bin/sh
# Keep existing POSIX callers working while the npm script uses the same
# cross-platform launcher on Windows, macOS, and Linux.
exec node scripts/release.mjs "$@"
