#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chatInterface = readFileSync('src/components/chat/view/ChatInterface.tsx', 'utf8');
const chatComposer = readFileSync('src/components/chat/view/subcomponents/ChatComposer.tsx', 'utf8');
const chatMessagesPane = readFileSync('src/components/chat/view/subcomponents/ChatMessagesPane.tsx', 'utf8');

assert.ok(
  chatInterface.includes('composerFrameRef') && chatInterface.includes('ResizeObserver'),
  'ChatInterface should measure the fixed composer frame instead of relying on normal flex flow.',
);

assert.ok(
  chatInterface.includes('bottomPaddingPx={composerFrameHeight + 16}')
    && chatInterface.includes('composerContainerRef={composerFrameRef}'),
  'ChatInterface should reserve message-pane space and pass the composer frame ref.',
);

assert.ok(
  chatComposer.includes('composerContainerRef')
    && chatComposer.includes('absolute inset-x-0 bottom-0')
    && !chatComposer.includes('sticky bottom-0'),
  'ChatComposer should be an absolute bottom frame, not a sticky/flow-positioned element.',
);

assert.ok(
  chatMessagesPane.includes('bottomPaddingPx')
    && chatMessagesPane.includes('paddingBottom: bottomPaddingPx'),
  'ChatMessagesPane should reserve bottom padding equal to the fixed composer height.',
);

console.log('chat composer fixed layout smoke passed');
