import assert from 'node:assert/strict';

const { normalizedToChatMessages } = await import('../../src/components/chat/hooks/useChatMessages.ts');

const messages = [
  {
    id: 'assistant-later',
    sessionId: 'session-1',
    timestamp: '2026-05-08T13:29:50.000Z',
    provider: 'opencode',
    kind: 'text',
    role: 'assistant',
    content: "You're welcome! Good luck with your project.",
  },
  {
    id: 'tool-earlier',
    sessionId: 'session-1',
    timestamp: '2026-05-08T13:29:42.000Z',
    provider: 'opencode',
    kind: 'tool_use',
    toolName: 'Edit',
    toolId: 'tool-1',
    toolInput: {
      filePath: 'C:\\Users\\ALICOMERT\\pixcode\\projects\\pixcode-project-4\\index.html',
      oldString: '<html lang="tr">',
      newString: '<html lang="en">',
    },
  },
];

const converted = normalizedToChatMessages(messages);

assert.equal(converted.length, 2, 'Both renderable messages should remain visible.');
assert.equal(converted[0].toolName, 'Edit', 'Earlier tool use should render before a later assistant reply.');
assert.equal(
  converted[1].content,
  "You're welcome! Good luck with your project.",
  'Later assistant reply should remain after the older tool event.',
);

console.log('chat message timeline order smoke passed');
