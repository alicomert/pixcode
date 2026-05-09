#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workerSlots = readFileSync('src/components/chat/utils/workerSlots.ts', 'utf8');
const control = readFileSync('src/components/chat/view/subcomponents/WorkerSlotsControl.tsx', 'utf8');
const composerHook = readFileSync('src/components/chat/hooks/useChatComposerState.ts', 'utf8');
const composer = readFileSync('src/components/chat/view/subcomponents/ChatComposer.tsx', 'utf8');
const chatInterface = readFileSync('src/components/chat/view/ChatInterface.tsx', 'utf8');

assert.ok(
  workerSlots.includes('MAX_WORKER_SLOTS = 4'),
  'Worker slot state should cap parallel workers at four.',
);

assert.ok(
  workerSlots.includes('pixcode.workerSlots.v1') && workerSlots.includes('resolveWorkerSlotModel'),
  'Worker slots should persist configuration and resolve provider models.',
);

assert.ok(
  control.includes('WorkerSlotsControl') && control.includes('onAddSlot') && control.includes('projectPath'),
  'Composer should expose a worker slot control with project path selection.',
);

assert.ok(
  composerHook.includes('workerSlots') && composerHook.includes("authenticatedFetch('/api/agent'"),
  'Composer hook should launch configured worker slots through the REST agent endpoint.',
);

assert.ok(
  composer.includes('WorkerSlotsControl') && composer.includes('onWorkerSlotsChange'),
  'Chat composer should render and update worker slots.',
);

assert.ok(
  chatInterface.includes('workerSlots={workerSlots}') && chatInterface.includes('onWorkerSlotsChange={setWorkerSlots}'),
  'Chat interface should pass worker slot state into the composer.',
);

console.log('multi worker slots smoke passed');
