# Pixcode v2 — Multi-CLI A2A Platform

**Date:** 2026-04-28
**Status:** Draft (vision + orchestrator spec)
**Owner:** alicomert

## Document scope

This document is two things in one:

- **Vision (high-level):** Pixcode v2 product direction across four feature pillars — multi-CLI orchestration, task system + per-task dispatch, multi-model review/debate, and auto-preview port detection.
- **Detailed spec (implementation-ready):** The orchestrator + A2A protocol core (the foundation the other three pillars sit on). This part is intended as input to a writing-plans pass.

The other three pillars are sketched at vision depth here and will get their own focused specs once the orchestrator core is in place.

## Strategic positioning

**Hybrid product:** A pro multi-agent dev environment underneath, a vibe-coding playground on top.

- **Vibe coder surface:** Task board and auto-preview default-on. A2A invisible. "Build apps with AI" UX.
- **Pro / team surface:** A2A endpoint exposed, external agents plug in, worktree + Docker isolation, multi-model review active.

Existing pixcode investments — six CLI integrations, Docker sandbox, mobile PWA, plugin loader, TaskMaster context — already lean toward this hybrid. v2 makes it explicit.

## Goals

- A single UI to drive Claude Code, Codex, Cursor CLI, Gemini CLI, Qwen Code, and OpenCode in coordination.
- Industry-standard inter-agent communication (Google's A2A protocol, v0.2) so external agents (Claude.ai, Cursor IDE, third-party) can join workflows.
- Per-task CLI dispatch (manual / AI-suggested / auto) with a Vibe Kanban-style board.
- Built-in multi-model workflows: review fan-out, sequential handoff, adversarial debate.
- Auto-detect new listening ports inside running CLI sessions and surface a split-pane preview of the resulting web page.
- Hybrid isolation: git worktree per task by default, opt-in Docker sandbox per task.

## Non-goals

- Replacing TaskMaster's PRD-to-tasks planning. Pixcode dispatches and executes; TaskMaster plans. One-way sync.
- Owning agent reasoning. Each CLI keeps its own model, auth, MCP config, session storage. Pixcode integrates, never duplicates.
- Building a test runner. CLAUDE.md states there is none and one is not in scope. Verification stays at typecheck + lint + manual.
- Full A2A spec v0.3 readiness on day 1. v0.2 is the target; v0.3 will be a follow-on.

## Architecture overview

```
+---------------------------------------------------------+
|  Pixcode UI (React + mobile PWA)                        |
|  - Task board (Vibe Kanban-style, opt-in)               |
|  - Multi-session view + auto-preview split-pane         |
|  - Multi-model review/debate panel                      |
+---------------------+-----------------------------------+
                      | WS (/ws, /shell, /plugin-ws/*)
                      | + REST (/api/*, /a2a/*)
+---------------------v-----------------------------------+
|  Pixcode Server (Express + ws)                          |
|  +-----------------------------------------------+      |
|  |  Orchestration Module (NEW)                   |      |
|  |  - A2A Bus (in-process pub/sub)               |      |
|  |  - Task lifecycle (Submit -> Plan -> Run -> Done)    |
|  |  - Workflow DAG runner                        |      |
|  |  - Port watcher (auto-preview)                |      |
|  |  - Conflict & merge orchestration             |      |
|  +-----------------------+-----------------------+      |
|                          | A2A messages                 |
|  +-----------------------v-----------------------+      |
|  |  Provider Registry + A2A Adapters (6 CLIs)    |      |
|  |  Claude / Codex / Cursor / Gemini / Qwen / OC |      |
|  +-----------------------+-----------------------+      |
|                          | stdin/stdout / pty           |
|  +-----------------------v-----------------------+      |
|  |  Isolation Layer                              |      |
|  |  - Git worktree per agent (default)           |      |
|  |  - Docker sandbox per agent (opt-in)          |      |
|  +-----------------------------------------------+      |
+---------------------------------------------------------+
                      ^
                      | /a2a/* (external A2A clients)
                      |
        External A2A agents (Claude.ai, Cursor IDE, 3rd-party)
```

Existing modules stay untouched in shape:

- `server/modules/providers/` keeps its current structure; `server/modules/orchestration/` is added next to it.
- `provider.routes.ts` keeps its routes; `orchestration.routes.ts` and `a2a.routes.ts` are added.
- Legacy runtime files (`claude-sdk.js`, `cursor-cli.js`, etc.) are *wrapped* by adapters, not refactored in place.
- Existing `/ws` message types (`claude-command`, etc.) keep working. New features arrive over `/a2a/*` and a new orchestration channel; no migration is forced on existing UI.

## A2A protocol layer

Target: A2A v0.2 (Linux Foundation, late-2025 cut). A2A complements MCP — A2A is agent-to-agent, MCP is agent-to-tool. Pixcode supports both natively.

### Endpoints

```
GET  /a2a/.well-known/agent-card.json   Pixcode's own AgentCard (capabilities, skills)
GET  /a2a/agents                        Registered (internal) agents (the 6 CLIs)
GET  /a2a/agents/{id}/agent-card        One agent's AgentCard
POST /a2a/tasks                         Submit a task (sync or streaming)
GET  /a2a/tasks/{id}                    Task status
GET  /a2a/tasks/{id}/stream  (SSE)      Task event stream (Message + Artifact)
POST /a2a/tasks/{id}/cancel             Cancel a task
POST /a2a/messages                      Inter-agent message (no task)
```

Existing `/api/*` and `/ws` continue to operate. `/a2a/*` is a parallel surface.

### Core types

```ts
// server/modules/orchestration/a2a/types.ts
interface AgentCard {
  name: string;             // e.g. "pixcode-claude-code"
  description: string;
  url: string;
  capabilities: string[];   // ["streaming", "pushNotifications", "fileEdit"]
  skills: AgentSkill[];     // ["typescript-edit", "test-run", "git-commit"]
  authentication?: AuthScheme;
}

interface Task {
  id: string;
  contextId?: string;       // workflow grouping
  state: 'submitted' | 'working' | 'input-required' | 'completed' | 'canceled' | 'failed';
  history: Message[];       // append-only
  artifacts: Artifact[];
  metadata?: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'agent';
  parts: Part[];            // TextPart | FilePart | DataPart
  messageId: string;
  taskId?: string;
}

interface Artifact {
  artifactId: string;
  type: 'file-diff' | 'command-output' | 'preview-url' | 'data';
  parts: Part[];
  metadata?: Record<string, unknown>;
}
```

### In-process A2A bus

`server/modules/orchestration/a2a/bus.ts` — typed pub/sub on top of Node `EventEmitter`. In mediated mode, all traffic flows through it:

- Orchestrator publishes a `Task`; the bus routes to the chosen adapter.
- The adapter publishes `Message` and `Artifact` events as the CLI streams output.
- The orchestrator and the UI both subscribe by `taskId`.
- External A2A clients connect via HTTP/SSE; an edge translator bridges to the bus.

### Authentication

- **Local mode** (default, vibe coder): `localhost:3001/a2a` no-auth, loopback-bound only.
- **Remote mode** (pro / team): JWT (existing pixcode auth reused) plus optional mTLS. AgentCard advertises `authentication: { schemes: ["Bearer"] }`.

### Discovery

- **Inbound:** External A2A clients fetch `GET /a2a/.well-known/agent-card.json` to discover pixcode.
- **Outbound:** Pixcode registers external agents either by manual URL entry or as a "plugin" (existing plugin system extended). Optional zeroconf/mDNS for LAN discovery is a follow-on, not in scope.

## CLI adapter pattern

Each of the six CLI runtimes gets an adapter that wraps the existing runtime file. The existing files are not refactored.

### Abstract base

```ts
// server/modules/orchestration/a2a/adapters/abstract-a2a.adapter.ts
abstract class AbstractA2AAdapter extends AbstractProvider {
  abstract readonly agentCard: AgentCard;
  abstract submitTask(task: Task, ctx: AdapterContext): Promise<TaskHandle>;
  abstract cancelTask(taskId: string): Promise<void>;

  protected emitMessage(taskId: string, msg: Message): void;
  protected emitArtifact(taskId: string, art: Artifact): void;
  protected emitState(taskId: string, state: TaskState): void;
}

interface AdapterContext {
  workspace: WorkspaceHandle;
  permissions: PermissionMode;
  parentTaskId?: string;
}

interface TaskHandle {
  cancel(): Promise<void>;
  finished: Promise<TaskResult>;
}
```

### Inheritance

```
AbstractProvider (existing)
  +-- AbstractA2AAdapter (new)
       +-- ClaudeCodeA2AAdapter   wraps server/claude-sdk.js
       +-- CodexA2AAdapter        wraps server/openai-codex.js
       +-- CursorA2AAdapter       wraps server/cursor-cli.js
       +-- GeminiA2AAdapter       wraps server/gemini-cli.js
       +-- QwenA2AAdapter         wraps server/qwen-code-cli.js
       +-- OpenCodeA2AAdapter     wraps server/opencode-cli.js
```

### Translation layers

Every adapter has two mappings:

1. `task -> cli-input`: convert A2A `Task.history` and metadata into the CLI's expected prompt format and flags.
2. `cli-output -> bus events`: parse the CLI's stream into A2A `Message` and `Artifact` events.

Per-CLI parsing:

- **Claude / Codex / Gemini:** native streaming JSON, easy to map.
- **Cursor CLI:** stdout text only, regex/heuristic parser.
- **Qwen / OpenCode:** PTY with ANSI; strip ANSI then content-extract.

### AgentCard generation

Each adapter exports a static AgentCard with declared `skills[]`. Routing decisions (specialist routing, AI suggestions) read from these declarations, so they are not optional metadata.

### Permission and sandbox propagation

`AdapterContext.permissions` carries pixcode's permission mode (acceptEdits / plan / bypassPermissions) into each CLI's native flag. `WorkspaceHandle` is either a worktree path or a Docker mount; the adapter passes it as `cwd`.

### External agents as plugins

Pixcode's existing plugin system can host an external A2A agent in two ways:

- (a) **Remote A2A endpoint:** URL entered, AgentCard fetched, registered.
- (b) **Local plugin:** npm package, in-process, faster.

Same interface, same bus.

## Isolation layer

### `WorkspaceHandle` abstraction

```ts
interface WorkspaceHandle {
  id: string;                    // workspace_xyz
  kind: 'worktree' | 'docker';
  path: string;                  // host path (worktree) or container mount
  baseRef: string;               // git ref (worktree) or base image (docker)
  ports: PortMap;                // detected runtime ports
  exec(cmd: string): Promise<ExecResult>;
  readFile(p: string): Promise<string>;
  writeFile(p: string, c: string): Promise<void>;
  diff(): Promise<string>;
  destroy(): Promise<void>;
}
```

The orchestrator and adapters never branch on `kind`; they use the interface.

### Worktree mode (default)

```
Project repo (main):   /home/user/proj
                       +-- .git/
                       +-- (working tree)

Pixcode worktrees:     ~/.pixcode/worktrees/
                       +-- ws_abc/        agent A on branch pixcode/task_abc
                       +-- ws_def/        agent B on branch pixcode/task_def
                       +-- ws_xyz/        agent C
```

Lifecycle:

1. **Create** on task submit: `git worktree add ~/.pixcode/worktrees/ws_<taskId> -b pixcode/task_<taskId> <baseRef>`.
2. **Run** the adapter with the worktree path as `cwd`.
3. **Diff** when complete: `git diff <baseRef>...HEAD` emitted as an artifact.
4. **Merge / Discard / Keep:** user chooses in UI.
5. **Cleanup:** `git worktree remove` on task close.

Path traversal protection at the adapter layer; pixcode never reads user worktrees outside `~/.pixcode/worktrees/`.

### Docker mode (opt-in)

Existing `docker/` Dockerfiles (Claude / Codex / Gemini) are reused. Per-task containers are spawned:

```
docker run --rm \
  -v ~/.pixcode/worktrees/ws_abc:/workspace \
  -p 0:3000 \
  --network pixcode-tasks \
  pixcode/claude-sandbox:latest
```

Triggers:

- `task.metadata.isolation === "docker"`
- Orchestrator decision (e.g. "build & run" tasks)
- User toggle in UI

Worktree and Docker compose: the worktree path is mounted into the container, so git operations stay visible on the host.

## Auto-preview port detection

When a CLI subprocess opens a new listening port (e.g. `npm run dev`), pixcode detects it, emits a preview-url artifact, and the UI opens a resizable split-pane with the resulting page.

### Watcher

```ts
// server/modules/orchestration/preview/port-watcher.ts
class PortWatcher {
  watch(workspace: WorkspaceHandle, processPid: number): Observable<PortEvent>;
}
```

Two strategies depending on workspace `kind`:

- **Worktree mode (host):** `lsof -i -P -n -sTCP:LISTEN` or polling `/proc/<pid>/net/tcp` (~500ms cadence). Scoped to the subprocess tree of the adapter-spawned process. New port emits an A2A `Artifact`:
  ```ts
  { type: "preview-url", parts: [{ kind: "data", data: { url, port, processName } }] }
  ```
- **Docker mode:** `docker port` on the container is authoritative; `docker events` stream provides fast detection.

### UI — split-screen preview

`src/components/preview/PreviewPane.tsx`:

- On `preview-url` artifact, the current session view shifts and a resizable side panel opens (not exactly half).
- Loaded via `<iframe src={url}>`. Multiple ports become tabs.
- Mobile: bottom sheet (swipe-up half-screen). Desktop: side panel.
- If the port disappears, the pane stays open until manually closed (avoid jitter).

### Two known issues

- **CSP / X-Frame-Options:** some dev servers reject iframe embedding. Fallback: open new tab + show URL.
- **HTTPS mixed content** when accessing pixcode over HTTPS from mobile: extend `server/services/external-access.js` reverse proxy to expose `/preview/<port>/*` over HTTPS.

### Conflict orchestration (vision-level)

When two agents edit the same file in parallel worktrees:

1. Each worktree commits to its own branch.
2. Orchestrator attempts `git merge --no-commit` on completion.
3. No conflict -> auto-commit. Conflict -> emit a `Task` to the bus, surface in UI for manual resolve or route to a third "merge specialist" agent.

Full spec is its own document later.

## Task system + per-task CLI dispatch

### Existing

Pixcode already has `TaskMasterContext`, `server/routes/taskmaster.js`, and `server/utils/taskmaster-websocket.js`. They cover `.taskmaster/` folder detection and broadcast updates, but no dispatch layer.

### New flow

```
1. Task source        2. Task board       3. Dispatch        4. Execution
PRD (TaskMaster)  --> Vibe Kanban    --> CLI selection  --> A2A Task -> Adapter
Manual entry          - To Do            - Manual              - Worktree spawn
Plan from CLI         - In Progress      - AI-suggested        - Stream -> bus
                      - In Review        - Auto (skill match)  - Artifact emit
                      - Done                                   - Done state
```

### Board UI

`src/components/orchestration/TaskBoard.tsx`. Columns: To Do, In Progress, In Review, Done. Cards show title, assigned CLI badge, worktree branch (pro mode), progress, ETA. Drag-and-drop column moves. Mobile: horizontal swipe between columns, tap to expand.

### CLI selection — three modes

- **Manual** (default vibe coder): dropdown when creating a task. Six CLIs plus "Auto (recommend)".
- **AI-suggested:** task description goes to a small LLM call (Haiku 4.5 — cheap, fast) which inspects each adapter's `AgentCard.skills[]` and returns a suggestion + confidence + reason. User accepts or overrides.
- **Auto-route** (pro mode): no prompt; AI suggestion is dispatched directly. Override via "promote to manual".

### Dispatch path

```
[Card moved to In Progress]
                  POST /api/orchestration/tasks/{id}/dispatch
                  { adapterId, isolation }
                                |
                                v
                        OrchestratorService.dispatch(task)
                                |
                                v
                        WorkspaceManager.createWorktree(taskId)
                                |
                                v
                        AdapterRegistry.get(adapterId).submitTask(task, ctx)
                                |
                                v
                        A2A Bus emits Message/Artifact
                                |
                                v
[WS subscribe(taskId)] <-------- Bus -> /ws push
[card re-renders, stream + diff visible]
```

### TaskMaster integration

TaskMaster's `.taskmaster/tasks.json` stays the source of truth for plans. Pixcode adds a parallel orchestration table:

```sql
CREATE TABLE pixcode_tasks (
  id TEXT PRIMARY KEY,                    -- = A2A Task.id
  taskmaster_id TEXT,                     -- nullable link
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  state TEXT NOT NULL,                    -- A2A state
  adapter_id TEXT NOT NULL,
  workspace_kind TEXT NOT NULL,           -- worktree | docker
  workspace_path TEXT,
  base_ref TEXT,
  metadata JSON,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX idx_pixcode_tasks_taskmaster ON pixcode_tasks(taskmaster_id);
```

Sync: TaskMaster -> pixcode is one-way pull on project open. Pixcode -> TaskMaster is one-way push on task done (`task-master set-status --id=X --status=done` via MCP).

### Multi-CLI per task

A card can declare a pipeline (sequential or parallel) backed by the workflow DAG runner described next:

```
+--------------------------------+
| Implement search feature        |
| Pipeline:                       |
|  1. [Claude] architect          |
|  2. [Codex]  implement          |
|  3. [Gemini] review             |
| Status: Step 2/3                |
+--------------------------------+
```

## Workflow DAG + multi-model review

The DAG runner powers the multi-CLI-per-task pipelines, the built-in review/debate workflows, and external A2A clients that submit workflows.

### DAG types

```ts
interface WorkflowNode {
  id: string;
  adapterId: string;          // explicit, "auto", or "skill:<id>"
  prompt: string | PromptFn;
  inputs: string[];           // dependency edges
  output: 'message' | 'artifact' | 'both';
  onFail: 'abort' | 'continue' | 'retry';
  isolation?: 'worktree' | 'docker';
}

interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  trigger: 'manual' | 'on-task-create' | 'on-pr-open';
}
```

Topological sort + parallel execution: independent nodes run concurrently. Each node expands to one A2A `Task`, sharing a `contextId` with the parent run. The runner subscribes to the bus to advance state.

### Built-in workflows (3)

#### Multi-model review

```
                   +------------------+
                   | Source: PR diff  |
                   +--------+---------+
                            |  parallel fan-out
            +---------------+---------------+
            v               v               v
       +---------+    +---------+    +-----------+
       |  Codex  |    | Gemini  |    |  Claude   |
       | edges,  |    | sec,    |    | architect |
       | races   |    | scaling |    | validate  |
       +---+-----+    +----+----+    +-----+-----+
           |               |               |
           +---------------+---------------+
                           v
                   +----------------+
                   | Aggregator     |
                   | (Claude)       |
                   | merge / dedupe |
                   | / prioritize   |
                   +-------+--------+
                           v
                   Final review report
```

UI shows three review streams side-by-side with the aggregator output below.

#### Sequential handoff

```
[Claude: architect]
       |  artifact: design.md
       v
[Codex: implement]    reads design.md from worktree, edits files
       |  artifact: file diff
       v
[Gemini: review]
       |  artifact: review report
       v
Done -> UI: merge / discard / iterate
```

Hard-gate: if a node fails, the pipeline pauses and asks the user (echoes Maestro's structured flow as opt-in, not mandatory).

#### Adversarial debate

```
Round 1: [Claude] proposes solution
Round 2: [Codex]  critiques + alternative
Round 3: [Claude] responds
Round 4: [Gemini] judges -> verdict
Final:   best solution committed
```

Hot use case: contested architectural choices. Cost is four LLM calls; quality is the payoff.

### Custom workflow editor

`src/components/orchestration/WorkflowEditor.tsx` (React Flow). Drag-and-drop nodes, edges, per-node prompt template. Saved to SQLite. Mobile is read-only execute; desktop is full design.

### Specialist routing

`adapterId: "skill:typescript-edit"` resolves to the first registered adapter whose AgentCard advertises that skill. This ties the AgentCard skill declarations from the adapter section to actual routing behavior.

### Cost-aware routing

Nodes can carry `costHint: "cheap" | "expensive"`. The registry picks cheaper model variants for "cheap" (e.g. Claude Code with Haiku, Gemini Flash). Users can set per-project budget caps.

### External A2A visibility

A workflow run is one parent A2A `Task` with child tasks sharing `contextId`. External A2A clients can subscribe to `contextId` to follow progress, or POST a workflow definition to start one. This is the door pro / team users need: pixcode behaves as an agentic CI for outside agents.

### Storage

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  definition JSON NOT NULL,
  is_builtin INTEGER NOT NULL,
  created_by TEXT,
  created_at INTEGER
);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,             -- = parent A2A Task.id
  workflow_id TEXT NOT NULL,
  context_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  metadata JSON
);
```

Built-in workflows ship as seed migrations. Editing a built-in forks it.

## Error handling

A2A's `Task.state = 'failed'` and `Task.error` field are used consistently.

| Category | Example | Behavior |
|---|---|---|
| Adapter spawn failure | CLI binary missing, auth missing | `state: failed`, `error.code: ADAPTER_UNAVAILABLE`, UI shows Install / Login CTA |
| Adapter runtime error | CLI crashed mid-task | Stop streaming, `state: failed`, keep partial artifacts, offer Retry and Switch CLI |
| Workspace creation failure | Disk full, git error | `state: failed` before adapter spawn, no resource leak |
| A2A protocol violation | Malformed message from external agent | 400 + structured error, temporary suspend in registry |
| Timeout | Adapter heartbeat lost (30s) | Configurable per adapter; default 5min; cancel + cleanup worktree |
| Workflow node failure | Sequential handoff middle node fails | Apply `onFail` policy: abort (default), continue, retry (max 2) |
| Merge conflict | Parallel worktrees touch same file | Section-4 conflict orchestration: third agent or user |
| Auto-preview port disappears | Dev server crashed | Iframe shows error, pane stays open (manual close) |
| External client disconnects | Remote agent dropped mid-task | Task continues; client resumes via `GET /a2a/tasks/{id}/stream` |

Existing `/ws` and `/api/*` error behavior is unchanged. The new A2A surface reports failures in parallel; old clients are not affected.

## Testing strategy

CLAUDE.md is explicit: there is no test suite, and one is not in scope. Verification stays at:

1. **Type safety** — `npm run typecheck` after every TS edit. New A2A interfaces are typed, so protocol violations are caught at compile time.
2. **Lint boundaries** — `eslint-plugin-boundaries` already active. The new `server/modules/orchestration/` becomes a module with a barrel `index.ts`; cross-module imports go through it.
3. **Integration smoke (no runner)** — `server/modules/orchestration/tests/*.test.ts` follows the existing `providers/tests/*.test.ts` pattern: typechecked but not executed. Manual `node --test` is possible. Adding it to CI is out of scope.
4. **Manual checklist (pre-release)** — six-CLI hello-world A2A round-trip; worktree create/destroy lifecycle; auto-preview detect (`npm run dev` in a test repo); each built-in workflow; external A2A client (curl) round-trip.
5. **AgentCard contract checks** — each adapter's static `agentCard` validated with a zod schema or the upstream A2A validator. Runs at typecheck; no runner needed.

Adding a real test runner is a separate proposal; not part of this spec.

## Migration plan

Phased; each phase is independently mergeable and ship-able.

### Phase 0 — Preparation (~1 week)

- Empty skeleton + barrel for `server/modules/orchestration/`
- `a2a/types.ts` (interfaces) + `bus.ts` (EventEmitter)
- TypeScript path aliases verified
- No feature change; existing `/ws` continues unchanged

### Phase 1 — A2A surface (~1.5 weeks)

- `/a2a/.well-known/agent-card.json`, `/a2a/agents`, `/a2a/tasks/*`
- One adapter (Claude Code) full A2A round-trip
- Manual verification with curl and an A2A inspector
- Frontend unchanged

### Phase 2 — Adapters (~2 weeks)

- Five remaining CLI adapters (Codex, Cursor, Gemini, Qwen, OpenCode)
- Skills declared per adapter
- Existing runtime files wrapped, not refactored
- Existing `/ws` `claude-command` etc. continue in parallel

### Phase 3 — Isolation + auto-preview (~1.5 weeks)

- `WorkspaceHandle` interface + worktree backend
- Port watcher + frontend split-pane component
- Docker backend extends existing `pixcode sandbox` command

### Phase 4 — Task system + workflow (~2 weeks)

- DAG runner
- Task board UI (Vibe Kanban-style)
- Three built-in workflows + custom editor (read-only mobile, full desktop)
- TaskMaster sync

### Phase 5 — Polish + docs (~1 week)

- AI-suggested routing (Haiku call)
- Cost-aware routing
- A2A external-client onboarding doc
- Launch announcement: "first multi-CLI UI with full A2A"

**Total: ~9 weeks** for Approach 1 (full A2A).

### Versioning

- **v2.0.0-beta.1** after Phase 1 — A2A endpoint live, opt-in
- **v2.0.0-beta.4** after Phase 4 — Task board GA
- **v2.0.0** after Phase 5 — stable, marketing launch
- v1.x stays in bug-fix-only mode for 6 months

Conventional Commits: `feat:` for Phase 1–4; `feat!:` reserved for Phase 5 final API breaking changes.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A2A spec moves to v0.3 mid-build | Medium | Low | Adapter abstraction; bumping = adapter change only |
| `git worktree` on Windows is brittle | High | Medium | Most pixcode users are Linux/Mac; Windows fallback is shallow clone |
| AI-suggested routing hallucinates | Medium | Low | Confidence threshold; below threshold falls back to manual prompt |
| Mobile iframe blocked by mixed content | High | High | Reverse proxy via `external-access.js` is mandatory |
| Hostile external `/a2a` calls | Low | High | Default localhost-only bind; remote requires JWT |
| TaskMaster sync race | Medium | Low | One-way sync (TaskMaster -> pixcode for plans, pixcode -> TaskMaster for status only) |

## Open questions

- A2A v0.2 has multiple draft profiles; pick the "Streaming" profile or include "Push" too?
- Should auto-preview support non-HTTP ports (TCP, gRPC)? Vision says HTTP only for v2.0; revisit later.
- Workflow editor: React Flow is heavy; check bundle impact before committing. A lighter alternative may exist.
- For external A2A clients submitting workflows, do we want a quota / rate-limit scheme on day 1 or post-launch?
- Should pixcode publish its own AgentCard to a central A2A registry once one exists, for outbound discovery?

## Document history

- **2026-04-28** — Initial draft, derived from interactive brainstorm.
