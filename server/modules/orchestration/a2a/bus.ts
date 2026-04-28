// server/modules/orchestration/a2a/bus.ts
// In-process pub/sub on top of Node's EventEmitter.
// Subscribers receive every event for a given taskId; an
// "all" subscriber receives every event regardless of task.
// Note: the literal taskId "__all__" is reserved for the broadcast
// channel; callers must not use it as a real taskId.

import { EventEmitter } from 'node:events';

import type { BusEvent } from '@/modules/orchestration/a2a/types.js';

type Listener = (event: BusEvent) => void;

const ALL = '__all__';

class A2ABus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0); // SSE clients can be numerous
  }

  /** Synchronous: listeners run before publish() returns. */
  publish(event: BusEvent): void {
    this.emitter.emit(event.taskId, event);
    this.emitter.emit(ALL, event);
  }

  /** Subscribe to events for a specific taskId. Returns an unsubscribe
   *  function — caller MUST invoke it to release the listener; the bus
   *  retains a strong reference until then. */
  subscribe(taskId: string, listener: Listener): () => void {
    this.emitter.on(taskId, listener);
    return () => this.emitter.off(taskId, listener);
  }

  /** Subscribe to ALL events. Returns an unsubscribe function with the
   *  same release semantics as subscribe(). */
  subscribeAll(listener: Listener): () => void {
    this.emitter.on(ALL, listener);
    return () => this.emitter.off(ALL, listener);
  }
}

export const a2aBus = new A2ABus();
export type { A2ABus };
