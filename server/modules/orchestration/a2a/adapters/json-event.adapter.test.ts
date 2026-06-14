import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { a2aBus } from '@/modules/orchestration/a2a/bus.js';
import type { Task } from '@/modules/orchestration/a2a/types.js';

import { JsonEventA2AAdapter } from './json-event.adapter.js';
import type { AdapterContext } from './abstract-a2a.adapter.js';

// Capture bus events by monkeypatching publish — the repo has no test runner
// with module mocking (node:test style, see providers/tests/mcp.test.ts).
const publishedEvents: any[] = [];
const originalPublish = a2aBus.publish.bind(a2aBus);
(a2aBus as any).publish = (event: any) => {
  publishedEvents.push(event);
};

void originalPublish; // retained for symmetry; process exits after tests

beforeEach(() => {
  publishedEvents.length = 0;
});

const makeTask = (id: string): Task => ({ id, history: [], artifacts: [] } as any);
const ctx = { cwd: '/tmp' } as unknown as AdapterContext;

test('JsonEventA2AAdapter initializes task state to working', async () => {
  const adapter = new JsonEventA2AAdapter();
  await adapter.submitTask(makeTask('test-task'), ctx);

  const stateEvent = publishedEvents.find((event) => event.kind === 'task-state');
  assert.ok(stateEvent, 'expected a task-state event');
  assert.equal(stateEvent.taskId, 'test-task');
  assert.equal(stateEvent.state, 'working');
});

test('JsonEventA2AAdapter handles external text events', async () => {
  const adapter = new JsonEventA2AAdapter();
  await adapter.submitTask(makeTask('test-task'), ctx);

  adapter.handleExternalEvent('test-task', { kind: 'text', text: 'Hello World' });

  const messageEvent = publishedEvents.find((event) => event.kind === 'message');
  assert.ok(messageEvent, 'expected a message event');
  assert.equal(messageEvent.taskId, 'test-task');
  assert.deepEqual(messageEvent.message.parts, [{ kind: 'text', text: 'Hello World' }]);
});

test('JsonEventA2AAdapter transitions to completed on terminal event', async () => {
  const adapter = new JsonEventA2AAdapter();
  await adapter.submitTask(makeTask('test-task'), ctx);

  adapter.handleExternalEvent('test-task', { kind: 'completed' });

  const completedEvent = publishedEvents.find(
    (event) => event.kind === 'task-state' && event.state === 'completed',
  );
  assert.ok(completedEvent, 'expected a completed task-state event');
  assert.equal(completedEvent.taskId, 'test-task');
});
