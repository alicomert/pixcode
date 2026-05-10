#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const projectsState = readFileSync('src/hooks/useProjectsState.ts', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`chat-session-provider-pools smoke failed: ${message}`);
    process.exit(1);
  }
}

const getProjectSessionsBody = projectsState.match(/const getProjectSessions = \(project: Project\): ProjectSession\[\] => \{[\s\S]*?\n\};/)?.[0] ?? '';

assert(
  getProjectSessionsBody.includes('project.qwenSessions') && getProjectSessionsBody.includes('project.opencodeSessions'),
  'selected-session refresh logic should include qwen/opencode pools',
);

assert(
  projectsState.includes('serialize(nextProject.qwenSessions)') && projectsState.includes('serialize(nextProject.opencodeSessions)'),
  'project change detection should include qwen/opencode sessions',
);

assert(
  projectsState.includes("sessionId.startsWith('codex-')") && projectsState.includes("sessionId.startsWith('gemini_')"),
  'fallback session provider inference should cover codex and gemini ids, not only qwen/opencode',
);

assert(
  projectsState.includes("localStorage.setItem('selected-provider', session.__provider)"),
  'selecting an existing session should persist that session provider before navigation',
);

console.log('chat-session-provider-pools smoke passed');
