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

Open `http://localhost:3210`. The first visit asks for a local password.
Without `PIXCODE_WORKSPACE`, Pixcode creates and reuses numbered projects
under `pixcode-projects/pixcode-project-N`; the title bar lets you switch or
create projects. Set `PIXCODE_WORKSPACE` to use one external workspace and
`PIXCODE_PROJECTS` to change the numbered-project directory. Set
`PIXCODE_HOME` to choose where authentication data is stored.

The Git panel supports status, diff-backed editor work, stage/unstage, commit,
pull, and push. Remote credentials are configured through Git or the terminal;
panel pull/push operations do not open interactive prompts.

The desktop workbench uses Tailwind CSS design tokens with Lucide icons and
includes an Explorer activity bar, content search,
CodeMirror editor tabs, a resizable agent terminal, resizable xterm terminal
panels, Git source control, project switching, dark/light themes, and mobile
bottom tabs.
