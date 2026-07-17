/**
 * Auto-Planner — natural language → structured task graph.
 * No external agent runtime; pure Node heuristics + optional keyword provider routing.
 */

const VALID_AGENTS = new Set(['claude-code', 'cursor', 'codex', 'gemini', 'qwen', 'opencode']);

const ROLE_AGENT = {
  frontend: 'claude-code',
  backend: 'codex',
  fullstack: 'opencode',
  reviewer: 'codex',
  tester: 'gemini',
  custom: 'opencode',
};

export function detectAgent(text, fallback = 'opencode') {
  const lower = String(text || '').toLowerCase();
  if (/\b(claude|claude code)\b/.test(lower)) return 'claude-code';
  if (/\bcodex\b/.test(lower)) return 'codex';
  if (/\bcursor\b/.test(lower)) return 'cursor';
  if (/\bgemini\b/.test(lower)) return 'gemini';
  if (/\bqwen\b/.test(lower)) return 'qwen';
  if (/\b(opencode|open code|free model|zen)\b/.test(lower)) return 'opencode';
  if (fallback === null || fallback === undefined) return null;
  return VALID_AGENTS.has(fallback) ? fallback : 'opencode';
}

export function detectRole(text) {
  const lower = String(text || '').toLowerCase();
  if (/\b(frontend|ui|css|react|tailwind|tsx|jsx|sayfa|page)\b/.test(lower)) return 'frontend';
  if (/\b(backend|api|server|database|db|endpoint|auth)\b/.test(lower)) return 'backend';
  if (/\b(review|audit|inspect|code review)\b/.test(lower)) return 'reviewer';
  if (/\b(test|qa|spec|e2e|unit test)\b/.test(lower)) return 'tester';
  return 'fullstack';
}

export function titleFromPrompt(prompt, max = 72) {
  const cleaned = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Untitled job';
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function routeProvider(stepText, fallbackAgent) {
  const explicit = detectAgent(stepText, null);
  if (explicit && VALID_AGENTS.has(explicit) && /\b(claude|codex|cursor|gemini|qwen|opencode)\b/i.test(stepText)) {
    return explicit;
  }
  const role = detectRole(stepText);
  const fromRole = ROLE_AGENT[role] || fallbackAgent;
  return VALID_AGENTS.has(fromRole) ? fromRole : (VALID_AGENTS.has(fallbackAgent) ? fallbackAgent : 'opencode');
}

/**
 * Split a natural-language request into ordered plan steps.
 * Recognizes numbered lists, "then / sonra / and then", and multi-sentence goals.
 */
export function splitIntoSteps(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  // Numbered / bullet lists
  const listParts = raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);

  if (listParts.length >= 2 && listParts.length <= 12) {
    return listParts;
  }

  // Sequential connectors (TR + EN)
  const sequential = raw
    .split(/\s*(?:\bthen\b|\bafter that\b|\bnext\b|\bsonra\b|\bardından\b|\bardindan\b|\bundan sonra\b|\band then\b)\s*/i)
    .map((part) => part.replace(/^[.,;:\s]+|[.,;:\s]+$/g, '').trim())
    .filter((part) => part.length > 8);

  if (sequential.length >= 2 && sequential.length <= 10) {
    return sequential;
  }

  // Sentence split for long multi-goal prompts
  if (raw.length > 180) {
    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
    if (sentences.length >= 2 && sentences.length <= 8) {
      return sentences;
    }
  }

  // Role-based dual split: frontend + backend mentioned separately
  const lower = raw.toLowerCase();
  const hasFe = /\b(frontend|ui|react)\b/.test(lower);
  const hasBe = /\b(backend|api|server)\b/.test(lower);
  if (hasFe && hasBe) {
    return [
      `Frontend: ${raw}`,
      `Backend: ${raw}`,
      `Integrate frontend and backend for: ${raw}`,
    ];
  }

  return [raw];
}

/**
 * Build a structured auto-plan from natural language.
 * @returns {{ title, prompt, steps: Array, autonomyLevel, schedule }}
 */
export function buildAutoPlan(text, {
  defaultAgent = 'opencode',
  defaultModel,
  autonomyLevel = 'supervised',
} = {}) {
  const prompt = String(text || '').trim();
  const chunks = splitIntoSteps(prompt);
  const parallelHint = /\b(parallel|paralel|aynı anda|ayni anda|simultaneously)\b/i.test(prompt);

  const steps = chunks.map((chunk, index) => {
    const role = detectRole(chunk);
    const agentType = routeProvider(chunk, defaultAgent);
    const id = `s${index + 1}`;
    let dependsOn = [];
    if (!parallelHint && index > 0) {
      dependsOn = [`s${index}`];
    }
    // Independent review/test often depends on last implementation step
    if (role === 'reviewer' || role === 'tester') {
      if (index > 0) dependsOn = [`s${index}`];
    }
    return {
      id,
      title: titleFromPrompt(chunk, 64),
      description: chunk,
      assignedProvider: agentType,
      agentType,
      model: defaultModel || undefined,
      role,
      dependsOn,
      status: 'pending',
    };
  });

  return {
    title: titleFromPrompt(prompt),
    prompt,
    steps,
    autonomyLevel: autonomyLevel === 'auto' ? 'auto' : 'supervised',
    defaultAgent: VALID_AGENTS.has(defaultAgent) ? defaultAgent : 'opencode',
    defaultModel: defaultModel || undefined,
  };
}

/**
 * Topological waves for dependsOn graph (local step ids).
 * Returns array of waves (each wave = step ids that can run in parallel).
 */
export function topologicalWaves(steps) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const remaining = new Set(steps.map((step) => step.id));
  const waves = [];
  const completed = new Set();

  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => {
      const step = byId.get(id);
      const deps = Array.isArray(step?.dependsOn) ? step.dependsOn : [];
      return deps.every((dep) => completed.has(dep) || !byId.has(dep));
    });
    if (ready.length === 0) {
      // Cycle / bad graph — dump remaining as one sequential wave
      waves.push([...remaining]);
      break;
    }
    waves.push(ready);
    for (const id of ready) {
      remaining.delete(id);
      completed.add(id);
    }
  }
  return waves;
}

/**
 * After a step fails, propose an adaptive recovery step (simple).
 */
export function buildAdaptiveRecoveryStep(failedStep, errorMessage) {
  const id = `recover-${failedStep.id}-${Date.now().toString(36)}`;
  return {
    id,
    title: `Recover: ${failedStep.title}`,
    description: [
      `Previous step failed: ${failedStep.title}`,
      `Error: ${errorMessage || 'unknown'}`,
      'Diagnose the failure, fix root cause in the workspace, then complete the original goal:',
      failedStep.description,
    ].join('\n'),
    assignedProvider: failedStep.agentType || failedStep.assignedProvider || 'opencode',
    agentType: failedStep.agentType || failedStep.assignedProvider || 'opencode',
    model: failedStep.model,
    role: failedStep.role || 'fullstack',
    dependsOn: [],
    status: 'pending',
    adaptive: true,
  };
}

export function formatPlanPreview(plan) {
  const lines = [
    '**Auto-plan ready** — nothing runs until you approve.',
    '',
    `Goal: ${plan.title}`,
    `Steps: **${plan.steps.length}** · autonomy \`${plan.autonomyLevel || 'supervised'}\``,
    '',
  ];
  const waves = topologicalWaves(plan.steps);
  for (const [waveIndex, wave] of waves.entries()) {
    lines.push(`Wave ${waveIndex + 1}${wave.length > 1 ? ' (parallel)' : ''}:`);
    for (const stepId of wave) {
      const step = plan.steps.find((entry) => entry.id === stepId);
      if (!step) continue;
      const deps = step.dependsOn?.length ? ` · after ${step.dependsOn.join(', ')}` : '';
      lines.push(`  • **${step.id}** ${step.title}`);
      lines.push(`    CLI \`${step.agentType}\` · role \`${step.role}\`${deps}`);
    }
    lines.push('');
  }
  lines.push('Approve to execute the graph, or tell me how to change the plan.');
  return lines.join('\n');
}

export { VALID_AGENTS, ROLE_AGENT };
