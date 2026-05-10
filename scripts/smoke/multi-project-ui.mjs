#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const chatComposer = readFileSync('src/components/chat/view/subcomponents/ChatComposer.tsx', 'utf8');
const workerSlotsControl = readFileSync('src/components/chat/view/subcomponents/WorkerSlotsControl.tsx', 'utf8');
const mainContent = readFileSync('src/components/main-content/view/MainContent.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`multi-project-ui smoke failed: ${message}`);
    process.exit(1);
  }
}

assert(
  chatComposer.includes('worker-slot-composer-rail'),
  'chat composer should render the multi-project launcher in a dedicated rail next to submit',
);

assert(
  /<WorkerSlotsControl[\s\S]*align="right"/.test(chatComposer),
  'chat composer should right-align the worker slot popover near the submit button',
);

assert(
  workerSlotsControl.includes('MAX_WORKER_SLOTS') && workerSlotsControl.includes('workerSlotsFull'),
  'worker slots control should keep the four-slot limit visible in the UI',
);

assert(
  workerSlotsControl.includes('translate-y-0') && workerSlotsControl.includes('opacity-100'),
  'worker slots popover should animate into view instead of appearing abruptly',
);

assert(
  mainContent.includes('x: 28') && mainContent.includes("transformOrigin: 'right center'"),
  'right side panels should animate from the right edge toward the left',
);

assert(
  mainContent.includes('transition-[width,opacity,transform]'),
  'split panes should animate width, opacity, and transform changes',
);

console.log('multi-project-ui smoke passed');
