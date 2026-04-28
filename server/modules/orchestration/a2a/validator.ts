// server/modules/orchestration/a2a/validator.ts
// Hand-written validators for incoming A2A payloads.
// We deliberately avoid adding a new dep (zod, ajv) for the
// foundation; a follow-on plan can swap to a schema lib if needed.
//
// All path strings use JSONPath-style "$" as the document root so
// callers can map errors to wire-payload locations consistently.

import type { AgentCard, DataPart, FilePart, Message, Part, SubmitTaskInput, TextPart } from '@/modules/orchestration/a2a/types.js';

export class A2AValidationError extends Error {
  constructor(message: string, public readonly path: string) {
    super(`${path}: ${message}`);
    this.name = 'A2AValidationError';
  }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new A2AValidationError('expected non-empty string', path);
  }
}

function assertPart(value: unknown, path: string): asserts value is Part {
  if (!value || typeof value !== 'object') {
    throw new A2AValidationError('expected object', path);
  }
  const part = value as { kind?: unknown };
  if (part.kind === 'text') {
    assertNonEmptyString((part as Partial<TextPart>).text, `${path}.text`);
    return;
  }
  if (part.kind === 'file') {
    assertNonEmptyString((part as Partial<FilePart>).name, `${path}.name`);
    return;
  }
  if (part.kind === 'data') {
    const data = (part as Partial<DataPart>).data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new A2AValidationError('data must be a plain object', `${path}.data`);
    }
    return;
  }
  throw new A2AValidationError('part.kind must be text|file|data', `${path}.kind`);
}

export function assertMessage(value: unknown, path = '$'): asserts value is Message {
  if (!value || typeof value !== 'object') {
    throw new A2AValidationError('expected object', path);
  }
  const m = value as { messageId?: unknown; role?: unknown; parts?: unknown };
  assertNonEmptyString(m.messageId, `${path}.messageId`);
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
  assertNonEmptyString(v.adapterId, '$.adapterId');
}

export function assertAgentCard(value: unknown): asserts value is AgentCard {
  if (!value || typeof value !== 'object') {
    throw new A2AValidationError('expected object', '$');
  }
  const card = value as Partial<AgentCard>;
  assertNonEmptyString(card.name, '$.name');
  assertNonEmptyString(card.description, '$.description');
  assertNonEmptyString(card.url, '$.url');
  assertNonEmptyString(card.version, '$.version');
  if (!Array.isArray(card.capabilities)) {
    throw new A2AValidationError('capabilities must be array', '$.capabilities');
  }
  if (!Array.isArray(card.skills)) {
    throw new A2AValidationError('skills must be array', '$.skills');
  }
  card.skills.forEach((s, i) => {
    assertNonEmptyString(s.id, `$.skills[${i}].id`);
    assertNonEmptyString(s.description, `$.skills[${i}].description`);
  });
}
