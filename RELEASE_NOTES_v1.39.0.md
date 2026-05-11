# Pixcode v1.39.0

Pixcode 1.39.0 adds custom OpenAI-compatible TaskMaster configuration and refreshes the public project presentation so the repo is easier to understand, install, contribute to, and discover from GitHub Pages or AI search tools.

## Highlights

- TaskMaster Settings now supports a custom OpenAI-compatible API key, API URL, and model field.
- Custom TaskMaster values are mapped into `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` during TaskMaster CLI execution.
- Standard OpenAI fields still work; custom OpenAI-compatible values override them only for TaskMaster execution when configured.
- README was rewritten as a complete product and open-source overview with screenshots, install commands, API examples, TaskMaster guidance, and contribution/security links.
- GitHub Pages landing page was redesigned as a text-first product page focused on what Pixcode does, not placeholder screenshots.
- Chat composer is now pinned to the bottom of the chat frame with measured message-pane padding, so it stays usable across empty chats, active sessions, split panels, and side-panel layouts.
- Orchestration now allows page-level vertical scrolling before desktop split mode, fixing mobile/tablet layouts where only small internal panes scrolled and lower content was unreachable.
- Added `CODE_OF_CONDUCT.md`, `SECURITY.md`, and a `good first issue` template.
- Updated static docs, feature page, sitemap, `llms.txt`, and `llms-full.txt` so search engines and AI assistants can understand the new feature set.

## Verification

- `node scripts/smoke/taskmaster-config.mjs`
- `node scripts/smoke/chat-composer-fixed-layout.mjs`
- `node scripts/smoke/orchestration-mobile-scroll.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
- `HUSKY=0 NPM_CONFIG_CACHE=/tmp/npm-cache npm pack --dry-run --ignore-scripts`
