#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const sourcePath = 'src/components/chat/hooks/useChatSessionState.ts';
const source = readFileSync(sourcePath, 'utf8');

const staleStoreMessagesMemo = /const\s+storeMessages\s*=\s*useMemo\s*\([\s\S]{0,500}?sessionStore\.getMessages\(activeSessionId\)[\s\S]{0,300}?\[\s*activeSessionId\s*,\s*sessionStore\s*\]/m;

if (staleStoreMessagesMemo.test(source)) {
  console.error([
    'useChatSessionState keeps sessionStore.getMessages() behind a stale useMemo.',
    'The session store can notify a render while activeSessionId/sessionStore stay the same,',
    'so the chat pane must read store messages on each render.',
  ].join(' '));
  process.exit(1);
}

console.log('chat session state store read is render-fresh');
