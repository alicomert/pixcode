import crypto from 'node:crypto';

import { appConfigDb } from '../database/db.js';

const CONFIG_KEY = 'production_agent_loop';

export const DESKTOP_RELEASE_ASSET_TYPES = [
  { id: 'windows-x64', extension: '.exe', required: true },
  { id: 'linux-x64', extension: '.AppImage', required: true },
  { id: 'linux-deb', extension: '.deb', required: true },
  { id: 'macos-x64', extension: 'x64.dmg', required: true },
  { id: 'macos-arm64', extension: 'arm64.dmg', required: true },
];

function nowIso() {
  return new Date().toISOString();
}

function readStore() {
  const raw = appConfigDb.get(CONFIG_KEY);
  if (!raw) {
    return {
      issueRuns: [],
      reviewQueue: [],
      schedulerJobs: [],
      checkpoints: [],
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      issueRuns: Array.isArray(parsed.issueRuns) ? parsed.issueRuns : [],
      reviewQueue: Array.isArray(parsed.reviewQueue) ? parsed.reviewQueue : [],
      schedulerJobs: Array.isArray(parsed.schedulerJobs) ? parsed.schedulerJobs : [],
      checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
    };
  } catch {
    return {
      issueRuns: [],
      reviewQueue: [],
      schedulerJobs: [],
      checkpoints: [],
    };
  }
}

function writeStore(store) {
  appConfigDb.set(CONFIG_KEY, JSON.stringify(store));
}

function compact(text, max = 90) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? value.slice(0, max).replace(/[-_\s]+$/g, '') : value;
}

function slugify(value) {
  const slug = compact(value, 64)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'agent-task';
}

export function parseGitHubIssueRef(input = {}) {
  const url = typeof input.issueUrl === 'string' ? input.issueUrl.trim() : '';
  const directNumber = Number.parseInt(String(input.issueNumber || ''), 10);
  const urlMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  return {
    owner: input.owner || urlMatch?.[1] || null,
    repo: input.repo || urlMatch?.[2] || null,
    issueNumber: Number.isFinite(directNumber) ? directNumber : Number.parseInt(urlMatch?.[3] || '0', 10) || null,
    issueUrl: url || null,
  };
}

export function createIssueToPrRun(input = {}, userId = null) {
  const issue = parseGitHubIssueRef(input);
  if (!issue.issueNumber && !input.title) {
    throw new Error('Issue-to-PR run requires an issue number, issue URL, or title.');
  }

  const title = compact(input.title || `Issue ${issue.issueNumber}`);
  const branchName = input.branchName || `pixcode/issue-${issue.issueNumber || 'manual'}-${slugify(title)}`;
  const run = {
    id: crypto.randomUUID(),
    type: 'github_issue_to_pr',
    status: 'queued',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    userId,
    issue,
    projectName: input.projectName || null,
    projectPath: input.projectPath || null,
    provider: input.provider || 'opencode',
    model: input.model || null,
    branchName,
    baseBranch: input.baseBranch || 'main',
    acceptanceCriteria: Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria : [],
    agentRequest: {
      projectPath: input.projectPath || undefined,
      githubUrl: input.githubUrl || undefined,
      message: [
        `Resolve ${issue.issueUrl || `GitHub issue #${issue.issueNumber || ''}`}`.trim(),
        input.body || title,
        'Create a branch, run verification, and prepare a pull request summary.',
      ].filter(Boolean).join('\n\n'),
      provider: input.provider || 'opencode',
      model: input.model || undefined,
      branchName,
      createBranch: true,
      createPR: true,
    },
  };

  const store = readStore();
  store.issueRuns.unshift(run);
  writeStore(store);
  return run;
}

export function parseCiRepairSignals(logText = '') {
  const text = String(logText || '');
  const lines = text.split(/\r?\n/);
  const failedCommands = [];
  const files = new Set();
  const errors = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/npm ERR!|error TS\d+|FAIL|failed|exit code/i.test(trimmed)) {
      errors.push(trimmed);
    }
    const command = trimmed.match(/(?:run|command|script)\s+[`'"]?([a-z0-9:_-]+)[`'"]?/i)?.[1];
    if (command) failedCommands.push(command);
    const file = trimmed.match(/((?:src|server|shared|scripts|desktop)\/[^\s:)]+)/)?.[1];
    if (file) files.add(file);
  }

  return {
    failedCommands: Array.from(new Set(failedCommands)),
    files: Array.from(files),
    errors: errors.slice(0, 25),
    repairPrompt: [
      'CI-aware repair loop:',
      '1. Reproduce the failing command locally.',
      '2. Fix only the failing behavior.',
      '3. Re-run the failed command plus related smoke checks.',
      '',
      errors.slice(0, 8).join('\n'),
    ].join('\n').trim(),
  };
}

export function createReviewQueueItem(input = {}, userId = null) {
  const item = {
    id: crypto.randomUUID(),
    status: input.status || 'review_requested',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    userId,
    projectName: input.projectName || null,
    projectPath: input.projectPath || null,
    title: compact(input.title || 'Review requested'),
    changedFiles: Array.isArray(input.changedFiles) ? input.changedFiles : [],
    notes: input.notes || '',
  };
  const store = readStore();
  store.reviewQueue.unshift(item);
  writeStore(store);
  return item;
}

export function updateReviewQueueItem(itemId, patch = {}) {
  const store = readStore();
  let updated = null;
  store.reviewQueue = store.reviewQueue.map((item) => {
    if (item.id !== itemId) return item;
    updated = {
      ...item,
      ...patch,
      id: item.id,
      updatedAt: nowIso(),
    };
    return updated;
  });
  writeStore(store);
  return updated;
}

export function scheduleBackgroundAgentJob(input = {}, userId = null) {
  const job = {
    id: crypto.randomUUID(),
    status: 'scheduled',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    userId,
    name: compact(input.name || 'Background agent job'),
    mode: input.mode || 'manual',
    cron: input.cron || null,
    watch: input.watch || null,
    projectName: input.projectName || null,
    provider: input.provider || 'opencode',
    prompt: input.prompt || '',
    nextRunAt: input.nextRunAt || null,
  };
  const store = readStore();
  store.schedulerJobs.unshift(job);
  writeStore(store);
  return job;
}

export function createWorkspaceCheckpoint(input = {}, userId = null) {
  const checkpoint = {
    id: crypto.randomUUID(),
    protocol: 'pixcode.workspace-checkpoint.v1',
    createdAt: nowIso(),
    userId,
    projectName: input.projectName || null,
    projectPath: input.projectPath || null,
    reason: compact(input.reason || 'manual checkpoint'),
    gitHead: input.gitHead || null,
    changedFiles: Array.isArray(input.changedFiles) ? input.changedFiles : [],
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
  const store = readStore();
  store.checkpoints.unshift(checkpoint);
  writeStore(store);
  return checkpoint;
}

export function getProductionAgentLoopState() {
  return readStore();
}

export function evaluateDesktopReleaseAssetPolicy(assetNames = []) {
  const names = Array.isArray(assetNames) ? assetNames.map(String) : [];
  const required = DESKTOP_RELEASE_ASSET_TYPES.map((assetType) => ({
    ...assetType,
    present: names.some((name) => name.endsWith(assetType.extension)),
  }));
  return {
    protocol: 'pixcode.desktop-release-assets.v1',
    required,
    complete: required.every((asset) => asset.present),
    rule: 'Every GitHub release must include Windows exe, Linux AppImage, Linux deb, macOS x64 dmg, and macOS arm64 dmg assets. Assets may be carried forward and renamed when the app updates internally.',
  };
}
