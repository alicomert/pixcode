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
