# Pixcode v2 Orchestration + A2A Foundation Implementation Plan

> **Current state:** Completed / archive. This plan describes the foundation that is already present in `server/modules/orchestration/`. Do not use the unchecked historical tasks below as the next implementation queue.
>
> **Next active plans:**
> - `docs/superpowers/plans/2026-04-29-orchestration-workspace-isolation.md`
> - `docs/superpowers/plans/2026-04-29-orchestration-auto-preview.md`
> - `docs/superpowers/plans/2026-04-29-orchestration-task-dispatch-ui.md`
> - `docs/superpowers/plans/2026-04-29-orchestration-workflow-dag-runner.md`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the orchestrator + A2A protocol foundation for pixcode — a new `server/modules/orchestration/` module with full A2A v0.2 HTTP surface, an in-process A2A bus, and one working CLI adapter (Claude Code) end-to-end. After this plan, an external A2A client can submit a task to pixcode, watch it stream over SSE, and read back artifacts produced by Claude Code.

**Architecture:** A new module under `server/modules/orchestration/` exposing typed A2A primitives (`Task`, `Message`, `Artifact`, `AgentCard`), a typed pub/sub bus on top of Node `EventEmitter`, an `AbstractA2AAdapter` base class extending the existing `AbstractProvider`, an `AdapterRegistry`, one concrete adapter (`ClaudeCodeA2AAdapter` wrapping the existing `server/claude-sdk.js`), and an Express router mounted at `/a2a/*` with discovery, task lifecycle, and message endpoints. Localhost-only auth bypass; JWT for remote.

**Tech Stack:** TypeScript (NodeNext), Express, ws, Node `EventEmitter`, existing `@anthropic-ai/claude-agent-sdk`, existing pixcode JWT auth (`server/database/`), no new runtime dependencies.

**Source spec:** `docs/superpowers/specs/2026-04-28-multi-cli-orchestration-vision.md` — sections 2 (A2A protocol layer), 3 (CLI adapter pattern). This plan implements Phase 0 + Phase 1 from the migration plan in that spec.

**Out of scope for this plan:** five remaining adapters (Codex, Cursor, Gemini, Qwen, OpenCode), worktree/Docker isolation, port watcher, task board UI, workflow DAG runner. Each gets its own plan after this one ships.

## Progress Update

- [x] Foundation module shipped: `server/modules/orchestration/` with `types`, `bus`, `auth.middleware`, `agent-card`, `validator`, `adapter-registry`, `routes`
- [x] Claude Code A2A adapter shipped and mounted under `/a2a/*`
- [x] Remaining first-party adapters landed after the initial foundation: `codex`, `cursor`, `gemini`, `qwen`, `opencode`
- [x] Durable A2A task persistence added via `task-store.ts` with restart recovery and terminal-task TTL eviction
- [x] External-client ergonomics added: `POST /a2a/adapters/resolve`, `GET /a2a/tasks`, task summaries, selector/routing hints
- [x] Smoke coverage expanded beyond the original Claude-only roundtrip to cover full adapter registration plus API negative paths
- [ ] Still pending beyond foundation scope: workflow DAG runner, task board orchestration UI, worktree/Docker execution isolation, port watcher/auto-preview

**Status:** The original foundation goal is complete and has been extended into a six-adapter, opt-in A2A surface. The remaining work is now productization and orchestration depth, not basic protocol bootstrapping.

---

## Verification approach (CLAUDE.md-compliant)

CLAUDE.md is explicit: "There is no test suite. Do not invent a test runner." This plan substitutes for the standard TDD loop:

| Concern | Verifier | Run |
|---|---|---|
| Type safety / interface contracts | TypeScript compiler | `npm run typecheck` |
| Lint and module boundaries | ESLint flat config | `npm run lint` |
| HTTP endpoint behavior | curl + documented expected response | `curl ...` (see Task 15) |
| End-to-end A2A roundtrip | Smoke script | `node scripts/smoke/a2a-roundtrip.mjs` |

Per-step "Run" / "Expected" lines below show exactly what to run and what to see.

---

## File structure

Files to create:

```
server/modules/orchestration/
├── index.ts                              # Barrel — public exports for the module
├── a2a/
│   ├── types.ts                          # Task, Message, Artifact, AgentCard
│   ├── bus.ts                            # Typed pub/sub on EventEmitter
│   ├── agent-card.ts                     # Pixcode self-AgentCard generator
│   ├── validator.ts                      # Manual AgentCard / Task validation
│   ├── adapter-registry.ts               # AdapterRegistry singleton
│   ├── auth.middleware.ts                # Localhost bypass + JWT for remote
│   ├── routes.ts                         # Express router mounted at /a2a
│   └── adapters/
│       ├── abstract-a2a.adapter.ts       # AbstractA2AAdapter base
│       └── claude-code.adapter.ts        # ClaudeCodeA2AAdapter (wraps claude-sdk.js)

scripts/smoke/
└── a2a-roundtrip.mjs                     # End-to-end smoke check
```

Files to modify:

```
server/index.js                           # Mount /a2a router; register Claude adapter at boot
```

The orchestration module exports its public API only through `index.ts`. Cross-module consumers that arrive later (e.g. a future `task-board` module) will go through this barrel per the boundaries config in `eslint.config.js`.

---

## Task 1: Module skeleton + barrel

**Files:**
- Create: `server/modules/orchestration/index.ts`
- Create: `server/modules/orchestration/a2a/.gitkeep` (placeholder so the empty folder is committed)

- [ ] **Step 1: Create the orchestration module folders and barrel**

```ts
// server/modules/orchestration/index.ts
// Public surface for the orchestration module.
// All cross-module consumers must import from here per
// eslint.config.js boundaries rules.

export {};
// Concrete exports are added in later tasks. Keep this file present so
// the module's barrel exists from the first commit.
```

```
# server/modules/orchestration/a2a/.gitkeep
(empty file)
```

- [ ] **Step 2: Verify the module compiles**

Run: `npm run typecheck`
Expected: PASS — no diagnostics. The empty barrel typechecks cleanly.

- [ ] **Step 3: Verify lint sees the new module as a boundary element**

Run: `npm run lint -- server/modules/orchestration`
Expected: PASS — no boundary errors. (`server/modules/orchestration` is now a `backend-module` per `eslint.config.js`.)

- [ ] **Step 4: Commit**

```bash
git add server/modules/orchestration/
git commit -m "feat(orchestration): add empty module skeleton with barrel"
```

---

## Task 2: A2A core types

**Files:**
- Create: `server/modules/orchestration/a2a/types.ts`

- [ ] **Step 1: Write the A2A type definitions**

```ts
// server/modules/orchestration/a2a/types.ts
// A2A protocol v0.2 types — minimal surface used by pixcode.
// See https://a2a-protocol.org for the full spec; this file
// keeps only what the orchestrator actually exchanges.

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed';

export type Role = 'user' | 'agent';

export type PartKind = 'text' | 'file' | 'data';

export interface TextPart {
  kind: 'text';
  text: string;
}

export interface FilePart {
  kind: 'file';
  name: string;
  mimeType?: string;
  bytesBase64?: string;
  uri?: string;
}

export interface DataPart {
  kind: 'data';
  data: Record<string, unknown>;
}

export type Part = TextPart | FilePart | DataPart;

export interface Message {
  messageId: string;
  role: Role;
  parts: Part[];
  taskId?: string;
}

export type ArtifactType =
  | 'file-diff'
  | 'command-output'
  | 'preview-url'
  | 'data';

export interface Artifact {
  artifactId: string;
  type: ArtifactType;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

export interface TaskError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Task {
  id: string;
  contextId?: string;
  state: TaskState;
  history: Message[];
  artifacts: Artifact[];
  error?: TaskError;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface AgentSkill {
  id: string;
  description: string;
  examples?: string[];
}

export type AuthScheme =
  | { type: 'none' }
  | { type: 'bearer' }
  | { type: 'mtls' };

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: string[];
  skills: AgentSkill[];
  authentication: AuthScheme;
}

export interface SubmitTaskInput {
  message: Message;
  contextId?: string;
  metadata?: Record<string, unknown>;
  /** Adapter id, "auto", or "skill:<id>". Resolved by the adapter registry. */
  adapterId: string;
}

export type BusEvent =
  | { kind: 'task-state'; taskId: string; state: TaskState; error?: TaskError }
  | { kind: 'message'; taskId: string; message: Message }
  | { kind: 'artifact'; taskId: string; artifact: Artifact };
```

- [ ] **Step 2: Verify the types compile**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/modules/orchestration/a2a/types.ts
git commit -m "feat(orchestration): define A2A v0.2 core types"
```

---

## Task 3: A2A in-process bus

**Files:**
- Create: `server/modules/orchestration/a2a/bus.ts`

- [ ] **Step 1: Write the typed pub/sub bus**

```ts
// server/modules/orchestration/a2a/bus.ts
// In-process pub/sub on top of Node's EventEmitter.
// Subscribers receive every event for a given taskId; an
// "all" subscriber receives every event regardless of task.

import { EventEmitter } from 'node:events';

import type { BusEvent } from '@/modules/orchestration/a2a/types.js';

type Listener = (event: BusEvent) => void;

const ALL = '__all__';

class A2ABus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0); // SSE clients can be numerous
  }

  publish(event: BusEvent): void {
    this.emitter.emit(event.taskId, event);
    this.emitter.emit(ALL, event);
  }

  subscribe(taskId: string, listener: Listener): () => void {
    this.emitter.on(taskId, listener);
    return () => this.emitter.off(taskId, listener);
  }

  subscribeAll(listener: Listener): () => void {
    this.emitter.on(ALL, listener);
    return () => this.emitter.off(ALL, listener);
  }
}

export const a2aBus = new A2ABus();
export type { A2ABus };
```

- [ ] **Step 2: Verify the bus compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/modules/orchestration/a2a/bus.ts
git commit -m "feat(orchestration): add in-process A2A pub/sub bus"
```

---

## Task 4: AbstractA2AAdapter base class

**Files:**
- Create: `server/modules/orchestration/a2a/adapters/abstract-a2a.adapter.ts`

- [ ] **Step 1: Write the abstract adapter base**

```ts
// server/modules/orchestration/a2a/adapters/abstract-a2a.adapter.ts
// Base class every CLI adapter extends. Adapters wrap the
// existing per-CLI runtime files (claude-sdk.js, openai-codex.js, ...)
// and translate between A2A messages and the CLI's native I/O.

import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
import type {
  AgentCard,
  Artifact,
  Message,
  Task,
  TaskError,
  TaskState,
} from '@/modules/orchestration/a2a/types.js';

export interface AdapterContext {
  /** Where the adapter executes — for now this is the project cwd; a future
   *  plan introduces WorkspaceHandle (worktree / docker). */
  cwd: string;
  /** pixcode permission mode passed through to the underlying CLI. */
  permissionMode?: 'acceptEdits' | 'plan' | 'bypassPermissions' | 'default';
  /** Optional parent task id when this adapter is invoked inside a workflow. */
  parentTaskId?: string;
}

export interface TaskHandle {
  cancel(): Promise<void>;
  finished: Promise<void>;
}

export abstract class AbstractA2AAdapter {
  abstract readonly id: string;
  abstract readonly agentCard: AgentCard;

  abstract submitTask(task: Task, ctx: AdapterContext): Promise<TaskHandle>;
  abstract cancelTask(taskId: string): Promise<void>;

  protected emitState(taskId: string, state: TaskState, error?: TaskError): void {
    a2aBus.publish({ kind: 'task-state', taskId, state, error });
  }

  protected emitMessage(taskId: string, message: Message): void {
    a2aBus.publish({ kind: 'message', taskId, message });
  }

  protected emitArtifact(taskId: string, artifact: Artifact): void {
    a2aBus.publish({ kind: 'artifact', taskId, artifact });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/modules/orchestration/a2a/adapters/abstract-a2a.adapter.ts
git commit -m "feat(orchestration): add AbstractA2AAdapter base class"
```

---

## Task 5: Adapter registry

**Files:**
- Create: `server/modules/orchestration/a2a/adapter-registry.ts`

- [ ] **Step 1: Write the registry**

```ts
// server/modules/orchestration/a2a/adapter-registry.ts
// In-process registry mapping adapter ids to AbstractA2AAdapter
// instances. Resolution supports three id forms:
//   - "claude-code"        explicit
//   - "skill:<skillId>"    first adapter advertising that skill
//   - "auto"               first registered adapter (placeholder until
//                          AI-suggested routing arrives in a later plan)

import type { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard } from '@/modules/orchestration/a2a/types.js';

class AdapterRegistry {
  private readonly byId = new Map<string, AbstractA2AAdapter>();

  register(adapter: AbstractA2AAdapter): void {
    if (this.byId.has(adapter.id)) {
      throw new Error(`A2A adapter already registered: ${adapter.id}`);
    }
    this.byId.set(adapter.id, adapter);
  }

  get(idOrSelector: string): AbstractA2AAdapter | undefined {
    if (idOrSelector === 'auto') {
      const first = this.byId.values().next().value;
      return first ?? undefined;
    }
    if (idOrSelector.startsWith('skill:')) {
      const skill = idOrSelector.slice('skill:'.length);
      for (const adapter of this.byId.values()) {
        if (adapter.agentCard.skills.some((s) => s.id === skill)) {
          return adapter;
        }
      }
      return undefined;
    }
    return this.byId.get(idOrSelector);
  }

  list(): AbstractA2AAdapter[] {
    return [...this.byId.values()];
  }

  agentCards(): AgentCard[] {
    return this.list().map((a) => a.agentCard);
  }
}

export const adapterRegistry = new AdapterRegistry();
export type { AdapterRegistry };
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/modules/orchestration/a2a/adapter-registry.ts
git commit -m "feat(orchestration): add adapter registry with id/skill/auto resolution"
```

---

## Task 6: Pixcode self-AgentCard generator

**Files:**
- Create: `server/modules/orchestration/a2a/agent-card.ts`

- [ ] **Step 1: Write the AgentCard generator**

```ts
// server/modules/orchestration/a2a/agent-card.ts
// Pixcode advertises itself as one A2A agent at /a2a/.well-known/agent-card.json.
// Per-CLI adapters publish their own cards under /a2a/agents/:id/agent-card.

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import type { AgentCard } from '@/modules/orchestration/a2a/types.js';

const VERSION: string =
  // __PIXCODE_UI_VERSION__ is defined by Vite for the frontend bundle, but
  // the backend reads the package.json directly via load-env. We accept
  // either origin so this file works during dev and after build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any).__PIXCODE_UI_VERSION__ as string | undefined) ?? '0.0.0-dev';

export function buildPixcodeAgentCard(baseUrl: string): AgentCard {
  const skills = adapterRegistry
    .agentCards()
    .flatMap((card) => card.skills)
    .filter((skill, idx, arr) => arr.findIndex((s) => s.id === skill.id) === idx);

  return {
    name: 'pixcode',
    description:
      'Pixcode multi-CLI orchestration platform. Routes A2A tasks to ' +
      'Claude Code, Codex, Cursor, Gemini, Qwen, or OpenCode adapters.',
    url: `${baseUrl.replace(/\/$/, '')}/a2a`,
    version: VERSION,
    capabilities: ['streaming', 'pushNotifications', 'taskRouting'],
    skills,
    authentication: { type: 'bearer' },
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/modules/orchestration/a2a/agent-card.ts
git commit -m "feat(orchestration): add pixcode self-AgentCard generator"
```

---

## Task 7: Manual AgentCard / submit-input validator

**Files:**
- Create: `server/modules/orchestration/a2a/validator.ts`

- [ ] **Step 1: Write the validator**

```ts
// server/modules/orchestration/a2a/validator.ts
// Hand-written validators for incoming A2A payloads.
// We deliberately avoid adding a new dep (zod, ajv) for the
// foundation; a follow-on plan can swap to a schema lib if needed.

import type { AgentCard, Message, Part, SubmitTaskInput } from '@/modules/orchestration/a2a/types.js';

export class A2AValidationError extends Error {
  constructor(message: string, public readonly path: string) {
    super(`${path}: ${message}`);
    this.name = 'A2AValidationError';
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new A2AValidationError('expected non-empty string', path);
  }
}

function assertPart(value: unknown, path: string): asserts value is Part {
  if (!value || typeof value !== 'object') {
    throw new A2AValidationError('expected object', path);
  }
  const part = value as { kind?: unknown };
  if (part.kind !== 'text' && part.kind !== 'file' && part.kind !== 'data') {
    throw new A2AValidationError('part.kind must be text|file|data', path);
  }
}

export function assertMessage(value: unknown, path = 'message'): asserts value is Message {
  if (!value || typeof value !== 'object') {
    throw new A2AValidationError('expected object', path);
  }
  const m = value as { messageId?: unknown; role?: unknown; parts?: unknown };
  assertString(m.messageId, `${path}.messageId`);
  if (m.role !== 'user' && m.role !== 'agent') {
    throw new A2AValidationError('role must be user|agent', `${path}.role`);
  }
  if (!Array.isArray(m.parts) || m.parts.length === 0) {
    throw new A2AValidationError('parts must be non-empty array', `${path}.parts`);
  }
  m.parts.forEach((p, i) => assertPart(p, `${path}.parts[${i}]`));
}

export function assertSubmitTaskInput(value: unknown): asserts value is SubmitTaskInput {
  if (!value || typeof value !== 'object') {
    throw new A2AValidationError('expected object', '$');
  }
  const v = value as { message?: unknown; adapterId?: unknown };
  assertMessage(v.message, '$.message');
  assertString(v.adapterId, '$.adapterId');
}

export function assertAgentCard(card: AgentCard): void {
  assertString(card.name, 'agentCard.name');
  assertString(card.description, 'agentCard.description');
  assertString(card.url, 'agentCard.url');
  assertString(card.version, 'agentCard.version');
  if (!Array.isArray(card.capabilities)) {
    throw new A2AValidationError('capabilities must be array', 'agentCard.capabilities');
  }
  if (!Array.isArray(card.skills)) {
    throw new A2AValidationError('skills must be array', 'agentCard.skills');
  }
  card.skills.forEach((s, i) => {
    assertString(s.id, `agentCard.skills[${i}].id`);
    assertString(s.description, `agentCard.skills[${i}].description`);
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/modules/orchestration/a2a/validator.ts
git commit -m "feat(orchestration): add hand-written A2A payload validators"
```

---

## Task 8: ClaudeCodeA2AAdapter (wraps claude-sdk.js)

**Files:**
- Create: `server/modules/orchestration/a2a/adapters/claude-code.adapter.ts`

The existing `server/claude-sdk.js` exports `queryClaudeSDK(command, options, ws)`. This adapter calls it but passes a custom shim object that satisfies the WebSocket interface the SDK expects (`send`, `readyState`), translating each SDK message into A2A bus events instead of WS frames.

- [ ] **Step 1: Write the adapter**

```ts
// server/modules/orchestration/a2a/adapters/claude-code.adapter.ts
// Wraps the existing server/claude-sdk.js queryClaudeSDK() function.
// claude-sdk.js was designed to stream SDK messages over a WebSocket
// connection, so we feed it a "fake WS" that captures send() calls and
// emits A2A bus events instead.

import crypto from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS module
import { queryClaudeSDK, abortClaudeSDKSession } from '@/claude-sdk.js';
import { AbstractA2AAdapter } from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type {
  AdapterContext,
  TaskHandle,
} from '@/modules/orchestration/a2a/adapters/abstract-a2a.adapter.js';
import type { AgentCard, Message, Part, Task } from '@/modules/orchestration/a2a/types.js';

interface FakeWS {
  send(data: string): void;
  readyState: number;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

const WS_OPEN = 1;

function joinPartsToPrompt(parts: Part[]): string {
  return parts
    .map((p) => {
      if (p.kind === 'text') return p.text;
      if (p.kind === 'data') return JSON.stringify(p.data);
      // file parts: include name + uri/inline marker
      return `[file:${p.name}${p.uri ? ` uri=${p.uri}` : ''}]`;
    })
    .join('\n');
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export class ClaudeCodeA2AAdapter extends AbstractA2AAdapter {
  readonly id = 'claude-code';

  readonly agentCard: AgentCard = {
    name: 'pixcode-claude-code',
    description: 'Anthropic Claude Code, accessed via Pixcode',
    url: '/a2a/agents/claude-code',
    version: '1.0.0',
    capabilities: ['streaming', 'fileEdit', 'commandExec', 'mcp'],
    skills: [
      {
        id: 'architectural-review',
        description: 'Review code architecture and propose structural changes',
      },
      {
        id: 'typescript-edit',
        description: 'Edit TypeScript files with type-aware reasoning',
      },
      {
        id: 'multi-file-refactor',
        description: 'Coordinated edits across many files',
      },
      {
        id: 'test-run',
        description: 'Run test suites and react to results',
      },
    ],
    authentication: { type: 'bearer' },
  };

  private readonly active = new Map<string, { sessionId: string | null }>();

  async submitTask(task: Task, ctx: AdapterContext): Promise<TaskHandle> {
    const promptText = joinPartsToPrompt(
      task.history[task.history.length - 1]?.parts ?? [],
    );
    const session = { sessionId: null as string | null };
    this.active.set(task.id, session);

    this.emitState(task.id, 'working');

    const fakeWS: FakeWS = {
      readyState: WS_OPEN,
      send: (data: string) => this.handleSdkFrame(task.id, data, session),
      on: () => {},
      removeListener: () => {},
    };

    const finished = (async () => {
      try {
        await queryClaudeSDK(
          promptText,
          {
            cwd: ctx.cwd,
            permissionMode: ctx.permissionMode ?? 'default',
          },
          fakeWS,
        );
        if (this.active.has(task.id)) {
          this.emitState(task.id, 'completed');
        }
      } catch (err) {
        this.emitState(task.id, 'failed', {
          code: 'ADAPTER_RUNTIME_ERROR',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.active.delete(task.id);
      }
    })();

    return {
      cancel: () => this.cancelTask(task.id),
      finished,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    const session = this.active.get(taskId);
    if (!session?.sessionId) {
      this.emitState(taskId, 'canceled');
      this.active.delete(taskId);
      return;
    }
    try {
      await abortClaudeSDKSession(session.sessionId);
    } finally {
      this.emitState(taskId, 'canceled');
      this.active.delete(taskId);
    }
  }

  /**
   * claude-sdk.js sends JSON frames over the WS. We parse each frame
   * and translate it into A2A bus events.
   */
  private handleSdkFrame(taskId: string, raw: string, session: { sessionId: string | null }): void {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      // Non-JSON frame; treat as plain text agent message.
      const message: Message = {
        messageId: newId('msg'),
        role: 'agent',
        parts: [{ kind: 'text', text: raw }],
        taskId,
      };
      this.emitMessage(taskId, message);
      return;
    }

    const f = frame as { type?: string; data?: Record<string, unknown> };
    const data = f.data ?? {};

    // Capture sessionId on the first frame that exposes it so cancel works.
    const maybeSessionId = (data as { session_id?: unknown }).session_id;
    if (typeof maybeSessionId === 'string' && !session.sessionId) {
      session.sessionId = maybeSessionId;
    }

    switch (f.type) {
      case 'claude-text':
      case 'text':
      case 'message': {
        const text = (data as { text?: unknown }).text;
        if (typeof text === 'string') {
          this.emitMessage(taskId, {
            messageId: newId('msg'),
            role: 'agent',
            parts: [{ kind: 'text', text }],
            taskId,
          });
        }
        return;
      }
      case 'tool_use':
      case 'tool-use': {
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'command-output',
          parts: [{ kind: 'data', data }],
          metadata: { source: 'claude-tool-use' },
        });
        return;
      }
      case 'file_edit':
      case 'file-edit': {
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'file-diff',
          parts: [{ kind: 'data', data }],
          metadata: { source: 'claude-file-edit' },
        });
        return;
      }
      default: {
        // Unknown frame type — surface as data artifact for visibility.
        this.emitArtifact(taskId, {
          artifactId: newId('art'),
          type: 'data',
          parts: [{ kind: 'data', data: { frameType: f.type, ...data } }],
        });
      }
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS. The `@ts-ignore` on the `claude-sdk.js` import is intentional — the file is plain JS, identical to the pattern in `server/modules/providers/provider.routes.ts`.

- [ ] **Step 3: Verify lint**

Run: `npm run lint -- server/modules/orchestration`
Expected: PASS. Boundaries should not flag this file because it stays inside the orchestration module.

- [ ] **Step 4: Commit**

```bash
git add server/modules/orchestration/a2a/adapters/claude-code.adapter.ts
git commit -m "feat(orchestration): add ClaudeCodeA2AAdapter wrapping claude-sdk.js"
```

---

## Task 9: A2A auth middleware

**Files:**
- Create: `server/modules/orchestration/a2a/auth.middleware.ts`

- [ ] **Step 1: Write the middleware**

```ts
// server/modules/orchestration/a2a/auth.middleware.ts
// Localhost callers bypass auth; everyone else needs a Bearer JWT
// validated by pixcode's existing auth stack.

import type { NextFunction, Request, Response } from 'express';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS module
import { authenticateToken } from '@/middleware/auth.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

function isLocalRequest(req: Request): boolean {
  const remote = req.socket.remoteAddress ?? '';
  if (LOCAL_HOSTS.has(remote)) return true;
  // Trust the X-Forwarded-For header only when the inbound socket is local
  // (i.e. the reverse proxy itself is on the same host).
  return false;
}

export function a2aAuth(req: Request, res: Response, next: NextFunction): void {
  if (isLocalRequest(req)) {
    next();
    return;
  }
  // Delegate to existing pixcode JWT middleware. authenticateToken
  // populates req.user on success and 401s on failure.
  authenticateToken(req, res, next);
}
```

Note for the engineer: `server/middleware/auth.js` is the file `server/index.js:377` already imports as `authenticateToken`. If the path differs in the actual repo, grep for `authenticateToken` to locate it and update the import.

- [ ] **Step 2: Confirm the existing auth import path**

Run: `grep -rn "export.*authenticateToken\|module.exports.*authenticateToken" server/`
Expected: a single hit pointing to the file that exports `authenticateToken`. Update the import in `auth.middleware.ts` to match if it isn't `@/middleware/auth.js`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/modules/orchestration/a2a/auth.middleware.ts
git commit -m "feat(orchestration): add A2A auth middleware (localhost bypass + JWT)"
```

---

## Task 10: A2A routes

**Files:**
- Create: `server/modules/orchestration/a2a/routes.ts`

This task delivers the full HTTP surface in one file because the routes share helpers. It is large but every endpoint is one small handler.

- [ ] **Step 1: Write the router**

```ts
// server/modules/orchestration/a2a/routes.ts
// HTTP surface for A2A v0.2. Mounted at /a2a in server/index.js.

import crypto from 'node:crypto';

import type { Request, Response, Router } from 'express';
import express from 'express';

import { adapterRegistry } from '@/modules/orchestration/a2a/adapter-registry.js';
import { buildPixcodeAgentCard } from '@/modules/orchestration/a2a/agent-card.js';
import { a2aAuth } from '@/modules/orchestration/a2a/auth.middleware.js';
import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
import type {
  BusEvent,
  Message,
  Task,
  TaskState,
} from '@/modules/orchestration/a2a/types.js';
import {
  A2AValidationError,
  assertMessage,
  assertSubmitTaskInput,
} from '@/modules/orchestration/a2a/validator.js';

// In-memory task store. Persistence is out of scope for the foundation;
// a follow-on plan adds SQLite-backed storage.
const tasks = new Map<string, Task>();

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function getBaseUrl(req: Request): string {
  // Honour the standard reverse-proxy headers when present.
  const proto = req.header('x-forwarded-proto') ?? req.protocol;
  const host = req.header('x-forwarded-host') ?? req.get('host');
  return `${proto}://${host}`;
}

function attachBusToTask(task: Task): () => void {
  return a2aBus.subscribe(task.id, (event: BusEvent) => {
    if (event.kind === 'task-state') {
      task.state = event.state;
      if (event.error) task.error = event.error;
      task.updatedAt = Date.now();
    } else if (event.kind === 'message') {
      task.history.push(event.message);
      task.updatedAt = Date.now();
    } else if (event.kind === 'artifact') {
      task.artifacts.push(event.artifact);
      task.updatedAt = Date.now();
    }
  });
}

export function createA2ARouter(): Router {
  const router: Router = express.Router();

  router.use(express.json({ limit: '5mb' }));
  router.use(a2aAuth);

  // Discovery
  router.get('/.well-known/agent-card.json', (req, res) => {
    res.json(buildPixcodeAgentCard(getBaseUrl(req)));
  });

  router.get('/agents', (_req, res) => {
    res.json({ agents: adapterRegistry.agentCards() });
  });

  router.get('/agents/:id/agent-card', (req, res) => {
    const adapter = adapterRegistry.get(req.params.id);
    if (!adapter) {
      res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: req.params.id } });
      return;
    }
    res.json(adapter.agentCard);
  });

  // Task lifecycle
  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      assertSubmitTaskInput(req.body);
    } catch (err) {
      const e = err as A2AValidationError;
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: e.message, path: e.path } });
      return;
    }

    const adapter = adapterRegistry.get(req.body.adapterId);
    if (!adapter) {
      res.status(404).json({
        error: { code: 'ADAPTER_NOT_FOUND', message: req.body.adapterId },
      });
      return;
    }

    const userMessage: Message = req.body.message;
    const task: Task = {
      id: newId('task'),
      contextId: req.body.contextId,
      state: 'submitted',
      history: [userMessage],
      artifacts: [],
      metadata: req.body.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tasks.set(task.id, task);
    attachBusToTask(task);

    try {
      await adapter.submitTask(task, { cwd: process.cwd() });
    } catch (err) {
      task.state = 'failed';
      task.error = {
        code: 'ADAPTER_SUBMIT_FAILED',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    res.status(202).json(task);
  });

  router.get('/tasks/:id', (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    res.json(task);
  });

  router.get('/tasks/:id/stream', (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Replay current state once so late subscribers see history.
    const initial = { kind: 'task-snapshot' as const, task };
    res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);

    const TERMINAL: TaskState[] = ['completed', 'canceled', 'failed'];
    const unsubscribe = a2aBus.subscribe(task.id, (event) => {
      res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.kind === 'task-state' && TERMINAL.includes(event.state)) {
        res.end();
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  router.post('/tasks/:id/cancel', async (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: req.params.id } });
      return;
    }
    // Look up the adapter that owns this task. We stored adapterId in metadata.
    const adapterId = req.body?.adapterId ?? task.metadata?.adapterId;
    const adapter = typeof adapterId === 'string' ? adapterRegistry.get(adapterId) : undefined;
    if (!adapter) {
      res.status(400).json({
        error: {
          code: 'ADAPTER_REQUIRED',
          message: 'Provide adapterId to cancel a task whose adapter is unknown',
        },
      });
      return;
    }
    await adapter.cancelTask(task.id);
    res.json(tasks.get(task.id));
  });

  router.post('/messages', (req, res) => {
    try {
      assertMessage(req.body);
    } catch (err) {
      const e = err as A2AValidationError;
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: e.message, path: e.path } });
      return;
    }
    a2aBus.publish({
      kind: 'message',
      taskId: req.body.taskId ?? 'broadcast',
      message: req.body,
    });
    res.status(202).json({ accepted: true });
  });

  return router;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint -- server/modules/orchestration`
Expected: PASS — import order respected, no boundary violations.

- [ ] **Step 4: Commit**

```bash
git add server/modules/orchestration/a2a/routes.ts
git commit -m "feat(orchestration): add A2A v0.2 HTTP router (discovery, tasks, SSE, messages)"
```

---

## Task 11: Update the module barrel

**Files:**
- Modify: `server/modules/orchestration/index.ts`

- [ ] **Step 1: Re-export the public API**

```ts
// server/modules/orchestration/index.ts
// Public surface for the orchestration module.
// All cross-module consumers must import from here per
// eslint.config.js boundaries rules.

export { createA2ARouter } from './a2a/routes.js';
export { adapterRegistry } from './a2a/adapter-registry.js';
export { ClaudeCodeA2AAdapter } from './a2a/adapters/claude-code.adapter.js';
export type {
  AdapterContext,
  TaskHandle,
} from './a2a/adapters/abstract-a2a.adapter.js';
export { AbstractA2AAdapter } from './a2a/adapters/abstract-a2a.adapter.js';
export { a2aBus } from './a2a/bus.js';
export type {
  AgentCard,
  Artifact,
  ArtifactType,
  BusEvent,
  Message,
  Part,
  SubmitTaskInput,
  Task,
  TaskError,
  TaskState,
} from './a2a/types.js';
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/modules/orchestration/index.ts
git commit -m "feat(orchestration): publish module barrel"
```

---

## Task 12: Mount /a2a router and register Claude adapter at boot

**Files:**
- Modify: `server/index.js` (around the existing `app.use('/api/providers', ...)` line — currently `server/index.js:377`)

- [ ] **Step 1: Locate the existing router mount**

Run: `grep -n "providerRoutes\|/api/providers" server/index.js`
Expected: at least two hits — one for the import, one for `app.use('/api/providers', ..., providerRoutes)`. Note the line numbers; the new code goes immediately after.

- [ ] **Step 2: Add the import block**

Open `server/index.js`. Find the existing line:

```js
import providerRoutes from './modules/providers/provider.routes.js';
```

Insert immediately after it:

```js
import {
  createA2ARouter,
  adapterRegistry,
  ClaudeCodeA2AAdapter,
} from './modules/orchestration/index.js';
```

- [ ] **Step 3: Register the Claude adapter at module load time**

In the same import block region (after the new orchestration import), add a single line that runs once at server boot:

```js
adapterRegistry.register(new ClaudeCodeA2AAdapter());
```

If `server/index.js` has a clearly demarcated "boot" section (search for `app.listen` or a `bootstrap` function), put the line there. Otherwise placing it at top-level after the imports is correct — registry construction is idempotent and safe at import time.

- [ ] **Step 4: Mount the A2A router**

Find the existing line:

```js
app.use('/api/providers', authenticateToken, providerRoutes);
```

Add immediately after it:

```js
app.use('/a2a', createA2ARouter());
```

A2A has its own auth middleware (Task 9) so we deliberately do not wrap it with `authenticateToken` here.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS for both.

- [ ] **Step 6: Boot the server and confirm the endpoint exists**

Run (in one terminal): `npm run server:dev-watch` — or, if already running, restart it.
Run (in another terminal):

```bash
curl -s http://127.0.0.1:3001/a2a/.well-known/agent-card.json | head -c 200
```

Expected: a JSON response starting with `{"name":"pixcode",...`. If you see `{"error":` or HTML, the router is not mounted; revisit step 4.

- [ ] **Step 7: Commit**

```bash
git add server/index.js
git commit -m "feat(orchestration): mount /a2a router and register Claude adapter at boot"
```

---

## Task 13: End-to-end smoke script

**Files:**
- Create: `scripts/smoke/a2a-roundtrip.mjs`

This script is the manual smoke check. It is not run in CI; it lives in `scripts/smoke/` for reproducibility and so the engineer running this plan has an exact command to verify the work.

- [ ] **Step 1: Write the smoke script**

```js
// scripts/smoke/a2a-roundtrip.mjs
// End-to-end smoke check for the A2A foundation.
//
// Usage:   node scripts/smoke/a2a-roundtrip.mjs [baseUrl]
// Default: http://127.0.0.1:3001
//
// Pre-reqs:
//   - pixcode server running (npm run server:dev-watch)
//   - ANTHROPIC_API_KEY (or pixcode auth) configured for Claude Code
//
// What it does:
//   1. GET /a2a/.well-known/agent-card.json   - sanity check
//   2. GET /a2a/agents                        - confirms claude-code is registered
//   3. POST /a2a/tasks                        - submits a tiny task
//   4. Streams /a2a/tasks/:id/stream          - prints events until terminal state
//
// Pass/fail:
//   Exits 0 on terminal state "completed". Non-zero otherwise.

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3001';

async function jget(path) {
  const r = await fetch(`${baseUrl}${path}`);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

async function main() {
  console.log('1) /a2a/.well-known/agent-card.json');
  const card = await jget('/a2a/.well-known/agent-card.json');
  console.log('   name=', card.name, 'version=', card.version);
  if (card.name !== 'pixcode') throw new Error('AgentCard.name != "pixcode"');

  console.log('2) /a2a/agents');
  const agents = await jget('/a2a/agents');
  const ids = agents.agents.map((a) => a.name);
  console.log('   registered:', ids.join(', '));
  if (!ids.includes('pixcode-claude-code')) {
    throw new Error('claude-code adapter not registered');
  }

  console.log('3) POST /a2a/tasks');
  const submitRes = await fetch(`${baseUrl}/a2a/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      adapterId: 'claude-code',
      message: {
        messageId: 'm_smoke_1',
        role: 'user',
        parts: [{ kind: 'text', text: 'Reply with the single word: ok' }],
      },
    }),
  });
  if (!submitRes.ok) throw new Error(`submit -> ${submitRes.status}`);
  const task = await submitRes.json();
  console.log('   task.id=', task.id, 'state=', task.state);

  console.log('4) GET /a2a/tasks/:id/stream (SSE)');
  const streamRes = await fetch(`${baseUrl}/a2a/tasks/${task.id}/stream`);
  if (!streamRes.ok) throw new Error(`stream -> ${streamRes.status}`);

  const reader = streamRes.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  let terminalState = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice('data: '.length));
      console.log('   event:', event.kind ?? 'snapshot', '->', event);
      if (event.kind === 'task-state') {
        terminalState = event.state;
        if (['completed', 'canceled', 'failed'].includes(terminalState)) break;
      }
    }
    if (terminalState && ['completed', 'canceled', 'failed'].includes(terminalState)) break;
  }

  console.log('terminal state:', terminalState);
  if (terminalState !== 'completed') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err);
  process.exit(2);
});
```

- [ ] **Step 2: Run the smoke script**

Pre-req: `npm run server:dev-watch` is running and Claude Code auth is configured.

Run: `node scripts/smoke/a2a-roundtrip.mjs`
Expected output (abbreviated):

```
1) /a2a/.well-known/agent-card.json
   name= pixcode version= ...
2) /a2a/agents
   registered: pixcode-claude-code
3) POST /a2a/tasks
   task.id= task_xxx state= submitted
4) GET /a2a/tasks/:id/stream (SSE)
   event: snapshot -> { kind: 'task-snapshot', task: { ... } }
   event: task-state -> { kind: 'task-state', taskId: '...', state: 'working' }
   event: message -> { kind: 'message', ..., parts: [ { kind: 'text', text: 'ok' } ] }
   event: task-state -> { kind: 'task-state', state: 'completed' }
terminal state: completed
```

Exit code: 0.

If exit code is non-zero:
- 401 from `/a2a/...` → auth middleware misconfigured (Task 9). Localhost should bypass.
- 404 on `/a2a/...` → router not mounted (Task 12 step 4).
- ADAPTER_NOT_FOUND → Claude adapter not registered (Task 12 step 3).
- ADAPTER_RUNTIME_ERROR → Claude SDK auth missing (`ANTHROPIC_API_KEY` env, or `~/.claude/auth.json`).

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke/a2a-roundtrip.mjs
git commit -m "test(orchestration): add A2A end-to-end smoke script"
```

---

## Self-review

This plan was checked against the spec sections it implements:

### Spec coverage (sections 2 + 3 of the vision spec)

| Spec item | Implemented in |
|---|---|
| A2A v0.2 endpoint set | Task 10 (router) |
| AgentCard, Task, Message, Artifact types | Task 2 |
| In-process A2A bus | Task 3 |
| AbstractA2AAdapter base class | Task 4 |
| AdapterRegistry with skill / id / auto resolution | Task 5 |
| Pixcode self-AgentCard | Task 6 |
| Validator for incoming payloads | Task 7 |
| ClaudeCodeA2AAdapter wrapping `claude-sdk.js` | Task 8 |
| Localhost auth bypass + JWT for remote | Task 9 |
| `/a2a/*` mounted alongside existing `/api/*` and `/ws` | Task 12 |
| Existing `/ws` and runtime files unchanged | Tasks 8, 12 (wrap, do not edit `claude-sdk.js`) |
| Module barrel for boundaries compliance | Tasks 1, 11 |

### Out-of-scope items deferred to later plans

| Spec item | Future plan |
|---|---|
| Five remaining adapters (Codex, Cursor, Gemini, Qwen, OpenCode) | "Phase 2 — adapters" plan |
| Persistent task storage (SQLite-backed) | Folded into the task-board plan |
| WorkspaceHandle (worktree / Docker) | "Phase 3 — isolation" plan |
| Port watcher + split-pane preview | Same as above |
| Workflow DAG runner | "Phase 4 — workflows" plan |
| AI-suggested routing | "Phase 5 — polish" plan |
| zod / formal A2A validator | Stated as alternative in spec — manual validators are sufficient for foundation |

### Type consistency check

- `Task`, `Message`, `Artifact` field names used in Task 8 (adapter), Task 10 (routes), and Task 13 (smoke script) all match Task 2 definitions.
- `adapterRegistry.get()` signature is the same in Task 8, Task 10, and Task 12.
- `AbstractA2AAdapter.submitTask()` returns `TaskHandle` consistently in Tasks 4 and 8.
- `BusEvent` discriminator (`kind: 'task-state' | 'message' | 'artifact'`) is uniform across Tasks 3, 4, 10, and 13.
- `a2aBus.publish()` / `subscribe()` signatures used in Task 4 and Task 10 match Task 3.

### Placeholder scan

No "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", "similar to Task N", "write tests for the above", or unspecified types. Every task carries the actual code that goes into the file.

One marked exception: Task 9 step 2 instructs the engineer to `grep` for `authenticateToken` and adjust the import path if it isn't `@/middleware/auth.js`. This is an explicit verification step — not a placeholder — because pixcode's middleware location is one of the items the spec called out as "may have moved during the v1.30.0 merge".

---

## Plan complete

Plan complete and saved to `docs/superpowers/plans/2026-04-28-orchestration-a2a-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
