import { getProjects } from '../projects.js';

import { listWebhooks } from './webhooks.js';

// Stubs for removed orchestration module — will be replaced by task system
function workflowStoreStub() {
  return { listRuns: () => [] };
}
function listPendingApprovalsStub() {
  return [];
}
const workflowStore = workflowStoreStub();
const listPendingApprovals = listPendingApprovalsStub;

const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'canceled']);

function projectPath(project) {
  return project.fullPath || project.path || '';
}

function runBelongsToProject(run, project) {
  const projectId = run.metadata?.projectId;
  const path = run.metadata?.projectPath;
  return projectId === project.name || path === projectPath(project);
}

function countSessions(project) {
  return [
    project.sessions,
    project.codexSessions,
    project.cursorSessions,
    project.geminiSessions,
    project.qwenSessions,
    project.opencodeSessions,
  ].reduce((total, sessions) => total + (Array.isArray(sessions) ? sessions.length : 0), 0);
}

function summarizeProject(project, runs, approvals) {
  const projectRuns = runs.filter((run) => runBelongsToProject(run, project));
  const runningRuns = projectRuns.filter((run) => !TERMINAL_RUN_STATES.has(run.status));
  const failedRuns = projectRuns.filter((run) => run.status === 'failed');
  const projectApprovals = approvals.filter((approval) => (
    approval.runId && projectRuns.some((run) => run.id === approval.runId)
  ));

  return {
    id: project.name,
    name: project.displayName || project.name,
    path: projectPath(project),
    sessionCount: countSessions(project),
    activeRunCount: runningRuns.length,
    failedRunCount: failedRuns.length,
    pendingApprovalCount: projectApprovals.length,
    latestRuns: projectRuns.slice(0, 4).map((run) => ({
      id: run.id,
      workflowId: run.workflowId,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    })),
  };
}

export async function buildControlRoomSnapshot({ maxProjects = 4 } = {}) {
  const projects = await getProjects();
  const runs = workflowStore.listRuns();
  const pendingApprovals = listPendingApprovals();
  const webhooks = listWebhooks();
  const projectCards = projects
    .map((project) => summarizeProject(project, runs, pendingApprovals))
    .sort((a, b) => (
      b.pendingApprovalCount - a.pendingApprovalCount ||
      b.activeRunCount - a.activeRunCount ||
      b.failedRunCount - a.failedRunCount ||
      a.name.localeCompare(b.name)
    ))
    .slice(0, maxProjects);

  return {
    protocol: 'pixcode.control-room.v1',
    generatedAt: new Date().toISOString(),
    maxProjects,
    mobileFirst: true,
    totals: {
      projects: projects.length,
      activeRuns: runs.filter((run) => !TERMINAL_RUN_STATES.has(run.status)).length,
      failedRuns: runs.filter((run) => run.status === 'failed').length,
      pendingApprovals: pendingApprovals.length,
      webhooks: webhooks.length,
      enabledWebhooks: webhooks.filter((webhook) => webhook.enabled).length,
    },
    projects: projectCards,
    approvals: pendingApprovals.slice(0, 20),
    webhooks,
  };
}

export function buildMobileConsoleLayout() {
  return {
    protocol: 'pixcode.remote-console-layout.v1',
    mobileFirst: true,
    sections: [
      { id: 'projects', title: 'Projects', priority: 1 },
      { id: 'approvals', title: 'Approval queue', priority: 2 },
      { id: 'runs', title: 'Runs', priority: 3 },
      { id: 'webhooks', title: 'Webhooks', priority: 4 },
      { id: 'api', title: 'API SDK', priority: 5 },
    ],
    maxVisibleProjects: 4,
  };
}
