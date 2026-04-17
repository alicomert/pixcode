<div align="center">
  <img src="public/logo.svg" alt="Pixcode" width="64" height="64">
  <h1>Cloud CLI (aka Claude Code UI)</h1>
  <p>A desktop and mobile UI for <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>, <a href="https://docs.cursor.com/en/cli/overview">Cursor CLI</a>, <a href="https://developers.openai.com/codex">Codex</a>, and <a href="https://geminicli.com/">Gemini-CLI</a>.<br>Use it locally or remotely to view your active projects and sessions from everywhere.</p>
</div>

<p align="center">
  <a href="https://github.com/alicomert/pixcode">Pixcode</a> · <a href="https://github.com/alicomert/pixcode">Documentation</a> · <a href="https://discord.gg/buxwujPNRE">Discord</a> · <a href="https://github.com/alicomert/pixcode/issues">Bug Reports</a> · <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/alicomert/pixcode"><img src="https://img.shields.io/badge/☁️_Pixcode_Cloud-Try_Now-0066FF?style=for-the-badge" alt="Pixcode"></a>
  <a href="https://discord.gg/buxwujPNRE"><img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord"></a>
  <br><br>
  <a href="https://trendshift.io/repositories/15586" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15586" alt="siteboon%2Fclaudecodeui | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
</p>

<div align="right"><i><b>English</b> · <a href="./README.ru.md">Русский</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.zh-CN.md">中文</a> · <a href="./README.ja.md">日本語</a></i></div>

---

## Screenshots

<div align="center">
  
<table>
<tr>
<td align="center">
<h3>Desktop View</h3>
<img src="public/screenshots/desktop-main.png" alt="Desktop Interface" width="400">
<br>
<em>Main interface showing project overview and chat</em>
</td>
<td align="center">
<h3>Mobile Experience</h3>
<img src="public/screenshots/mobile-chat.png" alt="Mobile Interface" width="250">
<br>
<em>Responsive mobile design with touch navigation</em>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<h3>CLI Selection</h3>
<img src="public/screenshots/cli-selection.png" alt="CLI Selection" width="400">
<br>
<em>Select between Claude Code, Gemini, Cursor CLI and Codex</em>
</td>
</tr>
</table>



</div>

## Features

- **Responsive Design** - Works seamlessly across desktop, tablet, and mobile so you can also use Agents from mobile 
- **Interactive Chat Interface** - Built-in chat interface for seamless communication with the Agents
- **Integrated Shell Terminal** - Direct access to the Agents CLI through built-in shell functionality
- **File Explorer** - Interactive file tree with syntax highlighting and live editing
- **Git Explorer** - View, stage and commit your changes. You can also switch branches 
- **Session Management** - Resume conversations, manage multiple sessions, and track history
- **Plugin System** - Extend Pixcode with custom plugins — add new tabs, backend services, and integrations. [Build your own →](https://github.com/alicomert/pixcode)
- **TaskMaster AI Integration** *(Optional)* - Advanced project management with AI-powered task planning, PRD parsing, and workflow automation
- **Model Compatibility** - Works with Claude, GPT, and Gemini model families (see [`shared/modelConstants.js`](shared/modelConstants.js) for the full list of supported models)


## Quick Start

### Pixcode (Recommended)

The fastest way to get started — no local setup required. Get a fully managed, containerized development environment accessible from the web, mobile app, API, or your favorite IDE.

**[Get started with Pixcode](https://github.com/alicomert/pixcode)**


### Self-Hosted (Open source)

#### npm

Try Pixcode instantly with **npx** (requires **Node.js** v22+):

```
npx pixcode
```

Or install **globally** for regular use:

```
npm install -g pixcode
pixcode
```

Open `http://localhost:3001` — all your existing sessions are discovered automatically.

Visit the **[documentation →](https://github.com/alicomert/pixcode)** for full configuration options, PM2, remote server setup and more.

#### Keep It Running On Linux (VDS / SSH-safe)

If you run Pixcode over SSH and your terminal disconnects, foreground processes like `npm run dev` will stop.  
Use the built-in daemon manager to run Pixcode as a persistent service:

```bash
# Default behavior on Linux (auto-daemon):
pixcode

# Explicit install (recommended on first setup):
pixcode daemon install --mode auto --port 3001
pixcode daemon status --mode auto
pixcode daemon doctor --mode auto
```

Useful commands:

```bash
pixcode daemon logs --mode auto
pixcode daemon restart --mode auto
pixcode daemon stop --mode auto      # temporary stop, auto-start remains enabled
pixcode daemon disable --mode auto   # disable auto-start at boot
pixcode daemon uninstall --mode auto
pixcode update --restart-daemon
```

Notes:
- On Linux, `pixcode` now attempts auto-daemon startup by default.
- `npm run dev`, `npm run start`, and direct server entrypoints now pass through the same auto-daemon behavior.
- Recommended for always-on server deployments: use `pixcode daemon install`, not `npm run dev`.
- `--mode user` uses `systemctl --user`, `--mode system` uses system service management, and `--mode auto` chooses the best available mode.
- Use `pixcode --no-daemon` (or `PIXCODE_NO_DAEMON=1`) to force foreground mode.
- On some servers you may need to enable linger for boot-time startup without an active login session:
  `sudo loginctl enable-linger <your-username>`

#### Docker Sandboxes (Experimental)

Run agents in isolated sandboxes with hypervisor-level isolation. Starts Claude Code by default. Requires the [`sbx` CLI](https://docs.docker.com/ai/sandboxes/get-started/).

```
npx pixcode@latest sandbox ~/my-project
```

Supports Claude Code, Codex, and Gemini CLI. See the [sandbox docs](docker/) for setup and advanced options.


---

## Which option is right for you?

Pixcode is the open source UI layer that powers Pixcode. You can self-host it on your own machine, run it in a Docker sandbox for isolation, or use Pixcode for a fully managed environment.

| | Self-Hosted (npm) | Self-Hosted (Docker Sandbox) *(Experimental)* | Pixcode |
|---|---|---|---|
| **Best for** | Local agent sessions on your own machine | Isolated agents with web/mobile IDE | Teams who want agents in the cloud |
| **How you access it** | Browser via `[yourip]:port` | Browser via `localhost:port` | Browser, any IDE, REST API, n8n |
| **Setup** | `npx pixcode` | `npx pixcode@latest sandbox ~/project` | No setup required |
| **Isolation** | Runs on your host | Hypervisor-level sandbox (microVM) | Full cloud isolation |
| **Machine needs to stay on** | Yes | Yes | No |
| **Mobile access** | Any browser on your network | Any browser on your network | Any device, native app coming |
| **Agents supported** | Claude Code, Cursor CLI, Codex, Gemini CLI | Claude Code, Codex, Gemini CLI | Claude Code, Cursor CLI, Codex, Gemini CLI |
| **File explorer and Git** | Yes | Yes | Yes |
| **MCP configuration** | Synced with `~/.claude` | Managed via UI | Managed via UI |
| **REST API** | Yes | Yes | Yes |
| **Team sharing** | No | No | Yes |
| **Platform cost** | Free, open source | Free, open source | Starts at $7/month |

> All options use your own AI subscriptions (Claude, Cursor, etc.) — Pixcode provides the environment, not the AI.

---

## Security & Tools Configuration

**🔒 Important Notice**: All Claude Code tools are **disabled by default**. This prevents potentially harmful operations from running automatically.

### Enabling Tools

To use Claude Code's full functionality, you'll need to manually enable tools:

1. **Open Tools Settings** - Click the gear icon in the sidebar
2. **Enable Selectively** - Turn on only the tools you need
3. **Apply Settings** - Your preferences are saved locally

<div align="center">

![Tools Settings Modal](public/screenshots/tools-modal.png)
*Tools Settings interface - enable only what you need*

</div>

**Recommended approach**: Start with basic tools enabled and add more as needed. You can always adjust these settings later.

---

## Plugins

Pixcode has a plugin system that lets you add custom tabs with their own frontend UI and optional Node.js backend. Install plugins from git repos directly in **Settings > Plugins**, or build your own.

### Available Plugins

| Plugin | Description |
|---|---|
| **[Project Stats](https://github.com/alicomert/pixcode)** | Shows file counts, lines of code, file-type breakdown, largest files, and recently modified files for your current project |
| **[Web Terminal](https://github.com/alicomert/pixcode)** | Full xterm.js terminal with multi-tab support|

### Build Your Own

**[Plugin Starter Template →](https://github.com/alicomert/pixcode)** — fork this repo to create your own plugin. It includes a working example with frontend rendering, live context updates, and RPC communication to a backend server.

**[Plugin Documentation →](https://github.com/alicomert/pixcode)** — full guide to the plugin API, manifest format, security model, and more.

---
## FAQ

<details>
<summary>How is this different from Claude Code Remote Control?</summary>

Claude Code Remote Control lets you send messages to a session already running in your local terminal. Your machine has to stay on, your terminal has to stay open, and sessions time out after roughly 10 minutes without a network connection.

Pixcode and Pixcode extend Claude Code rather than sit alongside it — your MCP servers, permissions, settings, and sessions are the exact same ones Claude Code uses natively. Nothing is duplicated or managed separately.

Here's what that means in practice:

- **All your sessions, not just one** — Pixcode auto-discovers every session from your `~/.claude` folder. Remote Control only exposes the single active session to make it available in the Claude mobile app.
- **Your settings are your settings** — MCP servers, tool permissions, and project config you change in Pixcode are written directly to your Claude Code config and take effect immediately, and vice versa.
- **Works with more agents** — Claude Code, Cursor CLI, Codex, and Gemini CLI, not just Claude Code.
- **Full UI, not just a chat window** — file explorer, Git integration, MCP management, and a shell terminal are all built in.
- **Pixcode runs in the cloud** — close your laptop, the agent keeps running. No terminal to babysit, no machine to keep awake.

</details>

<details>
<summary>Do I need to pay for an AI subscription separately?</summary>

Yes. Pixcode provides the environment, not the AI. You bring your own Claude, Cursor, Codex, or Gemini subscription. Pixcode starts at $7/month for the hosted environment on top of that.

</details>

<details>
<summary>Can I use Pixcode on my phone?</summary>

Yes. For self-hosted, run the server on your machine and open `[yourip]:port` in any browser on your network. For Pixcode, open it from any device — no VPN, no port forwarding, no setup. A native app is also in the works.

</details>

<details>
<summary>Will changes I make in the UI affect my local Claude Code setup?</summary>

Yes, for self-hosted. Pixcode reads from and writes to the same `~/.claude` config that Claude Code uses natively. MCP servers you add via the UI show up in Claude Code immediately and vice versa.

</details>

---

## Community & Support

- **[Documentation](https://github.com/alicomert/pixcode)** — installation, configuration, features, and troubleshooting
- **[Discord](https://discord.gg/buxwujPNRE)** — get help and connect with other users
- **[GitHub Issues](https://github.com/alicomert/pixcode/issues)** — bug reports and feature requests
- **[Contributing Guide](CONTRIBUTING.md)** — how to contribute to the project

## License

GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later) — see [LICENSE](LICENSE) for the full text, including additional terms under Section 7.

This project is open source and free to use, modify, and distribute under the AGPL-3.0-or-later license. If you modify this software and run it as a network service, you must make your modified source code available to users of that service.

Pixcode  - (https://github.com/alicomert/pixcode).

## Acknowledgments

### Built With
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** - Anthropic's official CLI
- **[Cursor CLI](https://docs.cursor.com/en/cli/overview)** - Cursor's official CLI
- **[Codex](https://developers.openai.com/codex)** - OpenAI Codex
- **[Gemini-CLI](https://geminicli.com/)** - Google Gemini CLI
- **[React](https://react.dev/)** - User interface library
- **[Vite](https://vitejs.dev/)** - Fast build tool and dev server
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[CodeMirror](https://codemirror.net/)** - Advanced code editor
- **[TaskMaster AI](https://github.com/eyaltoledano/claude-task-master)** *(Optional)* - AI-powered project management and task planning


### Sponsors
- [Siteboon - AI powered website builder](https://siteboon.ai)
---

<div align="center">
  <strong>Made with care for the Claude Code, Cursor and Codex community.</strong>
</div>
