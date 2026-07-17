/**
 * Per-project concurrency control (nanoclaw-lite group-queue.ts adapted).
 * One active run per project; global MAX_CONCURRENT_AGENTS across projects.
 */
import { MAX_CONCURRENT_AGENTS } from './config.js';

export class ProjectQueue {
  constructor() {
    this.projects = new Map();
    this.activeCount = 0;
    this.waiting = [];
    this.shuttingDown = false;
  }

  getState(projectId) {
    let state = this.projects.get(projectId);
    if (!state) {
      state = {
        active: false,
        runningTaskId: null,
        pending: [],
      };
      this.projects.set(projectId, state);
    }
    return state;
  }

  /**
   * @param {string} projectId
   * @param {string} taskId
   * @param {() => Promise<void>} fn
   */
  enqueue(projectId, taskId, fn) {
    if (this.shuttingDown) return;
    const state = this.getState(projectId);

    if (state.runningTaskId === taskId) return;
    if (state.pending.some((entry) => entry.id === taskId)) return;

    if (state.active) {
      state.pending.push({ id: taskId, projectId, fn });
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_AGENTS) {
      state.pending.push({ id: taskId, projectId, fn });
      if (!this.waiting.includes(projectId)) this.waiting.push(projectId);
      return;
    }

    void this.run(projectId, { id: taskId, projectId, fn });
  }

  async run(projectId, task) {
    const state = this.getState(projectId);
    if (state.active) {
      state.pending.push(task);
      return;
    }
    if (this.activeCount >= MAX_CONCURRENT_AGENTS) {
      state.pending.push(task);
      if (!this.waiting.includes(projectId)) this.waiting.push(projectId);
      return;
    }

    state.active = true;
    state.runningTaskId = task.id;
    this.activeCount += 1;

    try {
      await task.fn();
    } catch (error) {
      console.error('[nanoclaw-queue] task failed', projectId, task.id, error?.message || error);
    } finally {
      state.active = false;
      state.runningTaskId = null;
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.drain(projectId);
    }
  }

  drain(projectId) {
    const state = this.getState(projectId);
    if (state.pending.length > 0) {
      const next = state.pending.shift();
      void this.run(projectId, next);
      return;
    }
    while (this.waiting.length > 0 && this.activeCount < MAX_CONCURRENT_AGENTS) {
      const nextProject = this.waiting.shift();
      const nextState = this.getState(nextProject);
      if (nextState.pending.length > 0 && !nextState.active) {
        const next = nextState.pending.shift();
        void this.run(nextProject, next);
      }
    }
  }

  shutdown() {
    this.shuttingDown = true;
  }
}

export const projectQueue = new ProjectQueue();
