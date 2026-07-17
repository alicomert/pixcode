# Grok Build (xAI) in Pixcode

Pixcode treats **Grok Build** as a multi-CLI agent provider for NanoClaw / PixBot schedules.

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
2. In PixBot, pick **Grok Build (xAI)** as Default CLI, or prefix a message:  
   `[agent:grok] summarize open issues`  
3. Schedules/MCP `schedule_task` prompts can use the same `[agent:grok]` directive.

Optional env:

| Variable | Meaning |
|----------|---------|
| `PIXCODE_GROK_BIN` / `GROK_BIN` | Path to binary if not on PATH |
| `PIXCODE_GROK_ARGS` | Extra CLI args before the prompt |

## Note

Grok Build is a Rust TUI/agent harness. Headless flags may evolve; if spawn fails, check https://docs.x.ai/build/overview and set `PIXCODE_GROK_ARGS` accordingly.
