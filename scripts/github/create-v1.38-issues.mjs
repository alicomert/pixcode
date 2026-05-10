#!/usr/bin/env node
import fs from 'node:fs';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const OWNER = 'alicomert';
const REPO = 'pixcode';
const TRACKING_FILE = 'RELEASE_TRACKING_v1.38.md';

const issues = [
  {
    key: 'remote',
    placeholder: 'GH-TBD-remote',
    title: 'feat(remote): add first-run local/remote connection mode and API URL pairing',
    body: [
      '## Problem',
      'Pixcode can run on a server, desktop, or local machine, but first-run setup still assumes the current machine is the primary runtime. Users need to choose whether they are using this computer directly or connecting to a remote Pixcode server.',
      '',
      '## Goal',
      'Add a first-run connection mode before normal setup and update checks: local computer mode or remote server mode. Remote mode should accept an API URL, handle login/register/pairing, show connection health, and keep the app usable when the controlled server continues running.',
      '',
      '## Requirements',
      '- Ask local vs remote before normal onboarding and before startup update flow.',
      '- Remote mode accepts server URL and API key/session credentials.',
      '- If login/register is needed, guide the user inside the app instead of failing silently.',
      '- Show a full-width connection warning when the remote server is unreachable or degraded.',
      '- Persist the selected mode and allow changing it from Settings.',
      '- Keep update checks and release notes aware of the selected runtime.',
      '',
      '## Acceptance Criteria',
      '- New users can choose remote mode and connect to an existing Pixcode server.',
      '- A disconnected remote server shows a clear banner and retry action.',
      '- Local mode behavior remains unchanged.',
      '- Smoke coverage verifies local/remote mode persistence and health banner behavior.',
    ].join('\n'),
  },
  {
    key: 'api',
    placeholder: 'GH-TBD-api',
    title: 'feat(api): expose complete Pixcode control surface through API keys',
    body: [
      '## Problem',
      'Pixcode has many internal endpoints, but users need a clean public API model so every major feature can be automated from external clients, scripts, Telegram, or another UI.',
      '',
      '## Goal',
      'Create a stable API key and base URL system that exposes projects, sessions, providers, orchestration, tasks, files, source-control state, notifications, and settings through documented endpoints.',
      '',
      '## Requirements',
      '- Define public API groups for auth, projects, sessions, provider runs, orchestration, Taskmaster tasks, notifications, files, git/source-control, settings, and update status.',
      '- Keep px_ API key prefix and support scoped/revocable keys.',
      '- Add OpenAPI coverage for the public routes.',
      '- Ensure Telegram and future remote clients use the same API/service layer instead of separate logic.',
      '- Add rate limits and audit records for sensitive actions.',
      '',
      '## Acceptance Criteria',
      '- A user can operate core Pixcode flows using API URL + API key without the web UI.',
      '- OpenAPI docs include authenticated examples.',
      '- Invalid/missing scopes produce clear 401/403 responses.',
      '- Smoke coverage validates at least one full API-key flow: create/list project -> run provider prompt -> fetch result.',
    ].join('\n'),
  },
  {
    key: 'telegram',
    placeholder: 'GH-TBD-telegram',
    title: 'feat(telegram): reach web UI feature parity for remote control',
    body: [
      '## Problem',
      'Telegram control exists, but the long-term product goal is to manage Pixcode without opening the web UI. Telegram should not be just completion notifications or simple forwarding.',
      '',
      '## Goal',
      'Make Telegram a first-class Pixcode control client for sessions, projects, providers, models, orchestration, Taskmaster, settings, notifications, and progress/output preferences.',
      '',
      '## Requirements',
      '- Add structured menus for active sessions, new chat, existing project, provider/model selection, orchestration workflows, Taskmaster tasks, and settings.',
      '- Let users choose notification granularity: final result only, step summaries, all agent outputs, errors only.',
      '- Allow selecting active worker slot and project from Telegram.',
      '- Support task creation/start/stop/status from Telegram.',
      '- Keep inline menus edited in place to avoid chat spam.',
      '- Respect user language preference across every menu.',
      '',
      '## Acceptance Criteria',
      '- A linked Telegram user can start an orchestration run and monitor it without the web UI.',
      '- A linked Telegram user can create and run a Taskmaster task.',
      '- Telegram can switch active project/session/provider/model.',
      '- Smoke coverage verifies command routing, callback routing, language, and task/run status messages.',
    ].join('\n'),
  },
  {
    key: 'taskmaster',
    placeholder: 'GH-TBD-taskmaster',
    title: 'feat(tasks): make Taskmaster the shared execution queue for CLI agents',
    body: [
      '## Problem',
      'Taskmaster setup and Telegram execution foundations exist, but tasks are not yet the shared queue that coordinates all CLI agents and long-running project work.',
      '',
      '## Goal',
      'Make Taskmaster a first-class execution backbone: create tasks, assign provider/model, run until completion, update progress, retry/fallback on errors, and expose the same state in UI, API, and Telegram.',
      '',
      '## Requirements',
      '- Add task create/edit/list/detail flows in the web UI.',
      '- Bind tasks to project path, provider, model, permission mode, fallback provider, and worker slot.',
      '- Persist step summaries, final output, failure reasons, and changed files per task.',
      '- Support retry, pause/cancel, fallback, and continue-from-last-output.',
      '- Emit notifications for task started, waiting, completed, failed, fallback used.',
      '- Make Telegram and API operate the same task model.',
      '',
      '## Acceptance Criteria',
      '- A task can be created in UI/API/Telegram and run by a selected CLI provider.',
      '- Failed provider execution can route to configured fallback.',
      '- Task detail shows progress, outputs, changed files, and final summary.',
      '- Smoke coverage validates create -> dispatch -> progress -> completion/failure state.',
    ].join('\n'),
  },
  {
    key: 'plugins',
    placeholder: 'GH-TBD-plugins',
    title: 'feat(providers): expose CLI plugin and external tool configuration',
    body: [
      '## Problem',
      'Claude, Codex, OpenCode, Gemini, Qwen, and Cursor have their own plugin/MCP/tool configuration surfaces, but Pixcode does not yet make those external configurations visible and manageable in one place.',
      '',
      '## Goal',
      'Add provider plugin/tool configuration management so users can inspect, enable, disable, update, and validate provider-specific plugins/MCP/tool integrations without leaving Pixcode.',
      '',
      '## Requirements',
      '- Detect provider-specific plugin/tool config locations where supported.',
      '- Show installed/available plugin state per provider.',
      '- Allow safe enable/disable/update with preview and backup.',
      '- Add validation and repair hints for broken plugin configs.',
      '- Avoid IDE-specific integrations unless explicitly requested.',
      '- Keep secrets redacted.',
      '',
      '## Acceptance Criteria',
      '- Settings shows provider plugin/tool state without slow repeated checks.',
      '- Users can refresh plugin state manually.',
      '- Broken config produces actionable diagnostics.',
      '- Smoke coverage validates config discovery/parsing for sample provider configs.',
    ].join('\n'),
  },
  {
    key: 'desktop',
    placeholder: 'GH-TBD-desktop',
    title: 'build(desktop): harden installer release, signing, and update recovery',
    body: [
      '## Problem',
      'Desktop installers build, but macOS unsigned-app warnings, release artifact confidence, and update recovery need a dedicated release-hardening pass.',
      '',
      '## Goal',
      'Improve desktop release quality for .exe, .dmg, and AppImage users while keeping npm/server update recovery reliable.',
      '',
      '## Requirements',
      '- Document and/or implement macOS signing/notarization path.',
      '- Surface unsigned macOS warning guidance in README/release docs until signing is complete.',
      '- Verify installer artifacts against the app version and bundled Pixcode dependency.',
      '- Keep startup update/recovery visible to users.',
      '- Add release checklist coverage for desktop artifacts.',
      '',
      '## Acceptance Criteria',
      '- Desktop artifact versions match package version.',
      '- Release notes clearly explain macOS unsigned behavior until signing is complete.',
      '- Installer build workflow status is tracked as part of release readiness.',
      '- Smoke or script coverage verifies desktop package version alignment.',
    ].join('\n'),
  },
  {
    key: 'observability',
    placeholder: 'GH-TBD-observability',
    title: 'feat(observability): add run diagnostics and provider health visibility',
    body: [
      '## Problem',
      'When a provider, workflow, Telegram action, or task stalls, users need a clear reason instead of guessing from blank screens or network panels.',
      '',
      '## Goal',
      'Add a diagnostics surface that explains provider availability, run state, queued work, recent errors, CLI auth/install status, WebSocket health, and notification delivery.',
      '',
      '## Requirements',
      '- Add a diagnostics page/panel for provider health, active runs, WebSocket state, notification channel status, and recent errors.',
      '- Add lightweight server-side event/error records for provider runs and workflow tasks.',
      '- Show stalled/waiting/error states in user language.',
      '- Add manual refresh instead of expensive repeated checks.',
      '- Include copyable diagnostics bundle for support/debugging.',
      '',
      '## Acceptance Criteria',
      '- Users can see why a CLI is unavailable or why a run is waiting.',
      '- Settings no longer blocks on repeated provider checks.',
      '- Diagnostics can be copied without leaking secrets.',
      '- Smoke coverage validates health-state aggregation and secret redaction.',
    ].join('\n'),
  },
];

function buildPayload(issueNumbers = new Map()) {
  const scope = issues
    .map(issue => {
      const reference = issueNumbers.has(issue.key) ? `#${issueNumbers.get(issue.key)}` : issue.placeholder;
      return `- ${reference} ${issue.title}`;
    })
    .join('\n');

  const epic = {
    key: 'epic',
    placeholder: 'GH-TBD-epic',
    title: 'epic(product): track v1.38 remote API and task operations',
    body: [
      '## Goal',
      'Track the v1.38 remote-control, API, task, provider, desktop, and diagnostics package as a GitHub-native work plan. v1.37 shipped the orchestration reliability foundation; v1.38 should make Pixcode easier to operate remotely, automate externally, and diagnose confidently.',
      '',
      '## Scope',
      scope,
      '',
      '## Release Strategy',
      '1. Stabilize remote/local first-run mode and public API foundation.',
      '2. Build Telegram and Taskmaster on the same API/task service model.',
      '3. Add provider plugin/tool configuration visibility and diagnostics.',
      '4. Harden desktop installer/signing/update recovery paths.',
      '5. Ship release notes with issue-backed progress metadata.',
      '',
      '## Acceptance Criteria',
      '- Each child issue has implementation and smoke coverage before closure.',
      '- The v1.38 release notes reference completed issue numbers.',
      '- Update UI can show issue-backed progress for v1.38.',
      '- API/Telegram/Taskmaster work share service contracts instead of divergent behavior.',
    ].join('\n'),
  };

  return {
    version: '1.38',
    owner: OWNER,
    repo: REPO,
    issues,
    epic,
    trackingReplacements: [
      ...issues.map(issue => ({
        placeholder: issue.placeholder,
        value: issueNumbers.has(issue.key) ? `#${issueNumbers.get(issue.key)}` : issue.placeholder,
      })),
      {
        placeholder: epic.placeholder,
        value: issueNumbers.has('epic') ? `#${issueNumbers.get('epic')}` : epic.placeholder,
      },
    ],
  };
}

function githubRequest(method, path, payload) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is required for --apply');
  }

  const data = payload ? JSON.stringify(payload) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pixcode-v138-issue-planner',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        raw += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(raw ? JSON.parse(raw) : null);
          return;
        }
        reject(new Error(`${method} ${path} -> ${res.statusCode}: ${raw}`));
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function findExistingIssue(title) {
  const q = encodeURIComponent(`repo:${OWNER}/${REPO} type:issue in:title "${title}"`);
  const result = await githubRequest('GET', `/search/issues?q=${q}&per_page=10`);
  return result.items?.find(item => item.title === title) || null;
}

async function createOrReuseIssue(issue) {
  const existing = await findExistingIssue(issue.title);
  if (existing) {
    return existing;
  }
  return await githubRequest('POST', `/repos/${OWNER}/${REPO}/issues`, {
    title: issue.title,
    body: issue.body,
  });
}

function writeTracking(payload) {
  let content = fs.readFileSync(TRACKING_FILE, 'utf8');
  for (const replacement of payload.trackingReplacements) {
    content = content.replaceAll(replacement.placeholder, replacement.value);
  }
  fs.writeFileSync(TRACKING_FILE, content);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run') || !args.has('--apply');
  const shouldWriteTracking = args.has('--write-tracking') || args.has('--apply');

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(buildPayload(), null, 2)}\n`);
    return;
  }

  const numbers = new Map();
  for (const issue of issues) {
    const created = await createOrReuseIssue(issue);
    numbers.set(issue.key, created.number);
    console.log(`#${created.number} ${created.title}`);
  }

  const payloadBeforeEpic = buildPayload(numbers);
  const epic = await createOrReuseIssue(payloadBeforeEpic.epic);
  numbers.set('epic', epic.number);
  console.log(`#${epic.number} ${epic.title}`);

  const finalPayload = buildPayload(numbers);
  if (shouldWriteTracking) {
    writeTracking(finalPayload);
    console.log(`${TRACKING_FILE} updated`);
  }
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedPath) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to create v1.38 issues: ${message}`);
    process.exitCode = 1;
  }
}

export { buildPayload, issues };
