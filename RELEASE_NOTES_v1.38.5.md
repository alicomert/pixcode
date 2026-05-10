# Pixcode v1.38.5

Pixcode 1.38.5 is a Command Center hotfix for agent-written files.

<!-- pixcode:issue-progress -->
- [x] Command Center now listens to realtime agent write/edit events, not only git/filesystem polling.
- [x] Changed-file clicks open the editor with diff context when the agent provides it.
- [x] Repeated writes to the same file keep the newest diff payload visible.
<!-- /pixcode:issue-progress -->

## What changed

- Agent `Write`, `Edit`, `MultiEdit`, `ApplyPatch`, and provider file-change events are now extracted from realtime session messages and merged into the Command Center changed-files rail immediately.
- Command Center still polls git/filesystem status, but polling no longer replaces or hides direct agent-write entries.
- Clicking a changed file now opens the file editor with the available `old_string` / `new_string` payload, so changed content can render with the green diff view instead of only focusing the Files panel.
- Absolute tool paths are normalized back to project-relative paths before highlighting and opening, which keeps macOS/Windows/Linux agent writes consistent.

## Verification

- `node scripts/smoke/command-center-agent-writes.mjs`
- `node scripts/smoke/command-center-non-git.mjs`
- realtime changed-file extraction behavior check
- `npm run typecheck`
- `npm run lint`
- `npm run build`
