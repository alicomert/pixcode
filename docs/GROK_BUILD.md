# Grok Build (xAI) in Pixcode

Pixcode treats **Grok Build** as a multi-CLI agent provider for **NanoClaw** schedules and immediate runs.

## Docs

- Overview: https://docs.x.ai/build/overview  
- Repo: https://github.com/xai-org/grok-build  
- Install (official): https://x.ai/cli  

```bash
# macOS / Linux
curl -fsSL https://x.ai/cli/install.sh | bash

# Windows PowerShell
irm https://x.ai/cli/install.ps1 | iex

grok --version
```

## Pixcode usage

1. Install the `grok` binary on the host (same machine as the Pixcode daemon).  
2. In the **Tasks / NanoClaw** UI, pick **Grok Build (xAI)** as the agent, **or** prefix a prompt:  
   `[agent:grok] summarize open issues`  
3. Remote / curl (see [NANOCLAW_API.md](./NANOCLAW_API.md)):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"prompt":"design a release checklist","agentType":"grok","projectId":"my-app"}' \
  "$PIXCODE_URL/api/nanoclaw/run"
```

Schedules (`POST /api/nanoclaw/tasks`) accept the same `[agent:grok]` directive in `prompt`.

Optional env:

| Variable | Meaning |
|----------|---------|
| `PIXCODE_GROK_BIN` / `GROK_BIN` | Path to binary if not on PATH |
| `PIXCODE_GROK_ARGS` | Extra CLI args before the prompt |

## Note

Grok Build is a Rust TUI/agent harness. Headless flags may evolve; if spawn fails, check https://docs.x.ai/build/overview and set `PIXCODE_GROK_ARGS` accordingly.
