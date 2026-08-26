# Pixcode

Pixcode v2 is a lightweight, self-hosted coding workbench. It serves a Preact
web UI from a small Node.js backend and exposes filesystem, Git, terminal, and
coding-agent operations over one authenticated WebSocket connection.

## Development

```sh
npm install
npm run build
npm start
```

Open `http://localhost:3001`. The first visit asks for a local password. Pixcode
uses port 3001 as its stable publication port.
The `npm start` and `npm run server` commands always bind to port 3001; use
`node server/cli.js start --port N` only for an isolated development instance.
Without `PIXCODE_WORKSPACE`, Pixcode creates and reuses numbered projects
under `pixcode-projects/pixcode-project-N`. The title bar uses persistent
`Workspace #1`, `Workspace #2`, ... tabs; each tab keeps its editor state, file
tree, Git view, normal terminals, and agent terminal list. A tab can point at a
managed project, a new numbered project, any local folder, or a cloned GitHub
repository. Switching tabs changes the active root without reloading the page.
Running agent PTYs stay alive in the background; completed/stopped sessions are
not auto-resumed. Folders opened from the picker are remembered as additional
workspace roots. Set `PIXCODE_WORKSPACE` to pin one external workspace and
`PIXCODE_PROJECTS` to change the numbered-project directory. Set `PIXCODE_HOME`
to choose where authentication and workspace state are stored.

The Git panel supports live status refresh, tracked and untracked diffs,
diff-backed editor work, stage/unstage, commit, pull, and push. The editor's
inline diff compares the working file with the Git index (or an empty baseline
for a new file), matching the VibeVim-style workflow. Remote credentials are
configured through Git or the terminal; panel pull/push operations do not open
interactive prompts.

The desktop workbench uses Tailwind CSS design tokens with Lucide icons and
includes an Explorer activity bar, content search,
CodeMirror editor tabs, a resizable agent terminal, resizable xterm terminal
panels, Git source control, project switching, dark/light themes, and mobile
bottom tabs.
