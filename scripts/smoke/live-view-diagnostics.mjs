import assert from 'node:assert/strict';

const {
  buildLiveViewUnavailablePayload,
  renderLiveViewDiagnosticHtml,
} = await import('../../server/routes/live-view.js');

const phpSession = {
  projectName: 'php-demo',
  shareId: '88461d5616c52f954ac9a74b',
  sharePath: '/live/88461d5616c52f954ac9a74b/',
  status: 'error',
  kind: 'process',
  framework: 'PHP',
  label: 'PHP built-in server',
  command: {
    id: 'php-built-in',
    label: 'PHP built-in server',
    displayCommand: 'php -S 127.0.0.1:8123 -t .',
  },
  port: 8123,
  upstreamUrl: 'http://127.0.0.1:8123',
  error: 'process error: spawn php ENOENT',
  log: [
    '$ php -S 127.0.0.1:8123 -t .',
    'process error: spawn php ENOENT',
  ],
};

const payload = buildLiveViewUnavailablePayload(phpSession, {
  reason: 'session_error',
});

assert.equal(payload.error, 'Live View session is not available.');
assert.equal(payload.status, 'error');
assert.equal(payload.framework, 'PHP');
assert.match(payload.message, /PHP built-in server/i);
assert.match(payload.errorDetail, /spawn php ENOENT/);
assert.ok(payload.diagnostics.command.includes('php -S'), 'Payload should include the attempted PHP command.');
assert.ok(payload.diagnostics.logs.some((line) => line.includes('spawn php ENOENT')), 'Payload should include process logs.');
assert.ok(
  payload.suggestions.some((suggestion) => /php/i.test(suggestion) && /PATH/i.test(suggestion)),
  'PHP failures should suggest checking the php executable in PATH.',
);
assert.notEqual(payload.error, 'Live View session not found.', 'Existing failed sessions must not be hidden as missing sessions.');

const html = renderLiveViewDiagnosticHtml(payload);
assert.match(html, /Live View/i);
assert.match(html, /PHP built-in server/i);
assert.match(html, /spawn php ENOENT/i);
assert.match(html, /php -S 127\.0\.0\.1:8123 -t \./i);

console.log('live view diagnostics smoke passed');
