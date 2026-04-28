// server/modules/orchestration/a2a/bus.ts
// In-process pub/sub on top of Node's EventEmitter.
// Subscribers receive every event for a given taskId; an
// "all" subscriber receives every event regardless of task.

import { EventEmitter } from 'node:events';

import type { BusEvent } from '@/modules/orchestration/a2a/types.js';

type Listener = (event: BusEvent) => void;

const ALL = '__all__';

class A2ABus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0); // SSE clients can be numerous
  }

  publish(event: BusEvent): void {
    this.emitter.emit(event.taskId, event);
    this.emitter.emit(ALL, event);
  }

  subscribe(taskId: string, listener: Listener): () => void {
    this.emitter.on(taskId, listener);
    return () => this.emitter.off(taskId, listener);
  }

  subscribeAll(listener: Listener): () => void {
    this.emitter.on(ALL, listener);
    return () => this.emitter.off(ALL, listener);
  }
}

export const a2aBus = new A2ABus();
export type { A2ABus };
