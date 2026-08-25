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

Open `http://localhost:3210`. The first visit asks for a local workspace
password. Set `PIXCODE_WORKSPACE` to choose a different workspace and
`PIXCODE_HOME` to choose where authentication data is stored.

The Git panel supports status, diff-backed editor work, stage/unstage, commit,
pull, and push. Remote credentials are configured through Git or the terminal;
panel pull/push operations do not open interactive prompts.
