import { describe, it, expect, vi } from 'vitest';
import { JsonEventA2AAdapter } from './json-event.adapter.js';
import { a2aBus } from '@/modules/orchestration/a2a/bus.js';

vi.mock('@/modules/orchestration/a2a/bus.js', () => ({
  a2aBus: {
    publish: vi.fn(),
  },
}));

describe('JsonEventA2AAdapter', () => {
  it('should initialize task state to working', async () => {
    const adapter = new JsonEventA2AAdapter();
    const task = { id: 'test-task', history: [], artifacts: [] } as any;
    const ctx = { cwd: '/tmp' } as any;

    await adapter.submitTask(task, ctx);

    expect(a2aBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'task-state',
      taskId: 'test-task',
      state: 'working',
    }));
  });

  it('should handle external text events', async () => {
    const adapter = new JsonEventA2AAdapter();
    const task = { id: 'test-task', history: [], artifacts: [] } as any;
    await adapter.submitTask(task, {} as any);

    adapter.handleExternalEvent('test-task', { kind: 'text', text: 'Hello World' });

    expect(a2aBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'message',
      taskId: 'test-task',
      message: expect.objectContaining({
        parts: [{ kind: 'text', text: 'Hello World' }],
      }),
    }));
  });

  it('should transition to completed on terminal event', async () => {
    const adapter = new JsonEventA2AAdapter();
    const task = { id: 'test-task', history: [], artifacts: [] } as any;
    await adapter.submitTask(task, {} as any);

    adapter.handleExternalEvent('test-task', { kind: 'completed' });

    expect(a2aBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'task-state',
      taskId: 'test-task',
      state: 'completed',
    }));
  });
});
