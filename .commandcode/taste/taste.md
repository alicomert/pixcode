# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# Communication
- Communicate in Turkish with this user. Confidence: 0.85

# Verification
- Do not invent a test runner; verification stays at `npm run typecheck` + `npm run lint` + targeted smoke/manual checks. Confidence: 0.90

# Architecture
- Prefer JSON-backed stores initially with a documented migration path to SQLite later. Confidence: 0.70
- Use module barrel (`index.ts`) for public exports with eslint boundaries enforcement. Confidence: 0.65
- Keep plan documents in sync with actual implementation status; mark completed phases as checked to avoid plan/implementation drift. Confidence: 0.70

# Releases
- Build cross-platform distributables for releases: exe (Windows), dmg (macOS), deb (Linux), and AppImage. Confidence: 0.75
- Include comprehensive release notes documenting all features and changes for each version. Confidence: 0.70

