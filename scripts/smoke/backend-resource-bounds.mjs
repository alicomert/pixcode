#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const checks = [
  {
    path: 'server/projects.js',
    assert: (source) =>
      source.includes('CLAUDE_JSONL_LINE_MAX_CHARS') &&
      source.includes('firstUserMessageIds') &&
      source.includes('fs.opendir') &&
      !source.includes('entries.push(entry)') &&
      !source.includes('result.entries') &&
      !source.includes('allEntries') &&
      !source.includes('uuidToSessionMap'),
    message: 'Claude project parsing must not retain every JSONL entry in memory.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes('FILE_TREE_MAX_ITEMS') &&
      source.includes('FILE_TREE_MAX_DIRECTORIES') &&
      source.includes('FILE_TREE_SCAN_MAX_MS') &&
      source.includes('fsPromises.opendir') &&
      source.includes('invalidated: true') &&
      source.includes('JSONL_STREAM_LINE_MAX_CHARS') &&
      source.includes('fs.createReadStream'),
    message: 'Backend watchers/file tree scans must be bounded and must not broadcast full project trees.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes('function resizeTerminalPty') &&
      source.includes("resizeTerminalPty(shellProcess, data.cols, data.rows, 'reconnect resize')") &&
      source.includes('resizeTerminalPty(activePty, data.cols, data.rows)'),
    message: 'Shell reconnect must resize existing PTYs with the latest browser rows and columns.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes('async function resolveShellProjectPath') &&
      source.includes('ensurePrivateWorkspaceRoot(user)') &&
      source.includes('function canUseShellProjectPath') &&
      source.includes('req.pixcodeProjectPath') &&
      source.includes('projectPath = await resolveShellProjectPath(request.user, data.projectPath)'),
    message: 'Member terminals must default to a created private workspace root across HTTP and WebSocket transports.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes('A reconnect can replace `session.ws`') &&
      source.includes('if (session.ws && session.ws !== ws)'),
    message: 'A stale shell WebSocket close must not timeout or tear down a PTY that has already been reattached.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes("/api/telegram/active-terminal', authenticateToken, requireApiScope('telegram:write')") &&
      source.includes("/api/telegram/active-terminal', authenticateToken, requireApiScope('telegram:write'), (req, res)") ,
    message: 'Telegram terminal attach/detach must honor the telegram:write API-key scope.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes('SHELL_HTTP_INPUT_MAX_CHARS') &&
      source.includes("input exceeds the ${SHELL_HTTP_INPUT_MAX_CHARS} character limit") &&
      source.includes('res.status(413).json'),
    message: 'HTTP provider-terminal input must be bounded before writing to a PTY.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes('Session ownership could not be verified') &&
      source.includes("info.req.headers['x-api-key']") &&
      source.includes('const headerApiKey'),
    message: 'Provider session resume must fail closed without ownership and WebSocket API clients must support X-API-Key.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes('const queryApiKey = url.searchParams.get(\'apiKey\')') &&
      source.includes('const streamTicket = url.searchParams.get(\'streamTicket\')') &&
      source.includes('ALLOW_QUERY_CREDENTIALS ? (queryToken || queryApiKey) : null'),
    message: 'WebSocket query credentials must be opt-in while stream tickets remain usable.',
  },
  {
    path: 'server/index.js',
    assert: (source) =>
      source.includes("url.pathname === '/ws'") &&
      source.includes("webSocketUserHasScope(user, 'sessions:write')") &&
      source.includes('Chat WebSocket access denied'),
    message: 'Explicitly scoped API keys must carry sessions:write before opening the chat WebSocket.',
  },
  {
    path: 'server/middleware/auth.js',
    assert: (source) =>
      source.includes("const ALLOW_QUERY_CREDENTIALS = process.env.PIXCODE_ALLOW_QUERY_CREDENTIALS === '1'") &&
      source.includes('const rawQueryToken') &&
      source.includes('const queryToken = ALLOW_QUERY_CREDENTIALS ? rawQueryToken : null') &&
      source.includes('const streamTicket =') &&
      source.includes('query_param_credential_rejected') &&
      source.includes('PLATFORM_AUTH_BYPASS_ENABLED = IS_PLATFORM &&'),
    message: 'Raw HTTP query credentials must be opt-in while stream tickets remain supported.',
  },
  {
    path: 'server/middleware/auth.js',
    assert: (source) =>
      source.includes('const API_KEY_SCOPE_RULES') &&
      source.includes('requiredApiKeyScopeForRequest') &&
      source.includes('enforceApiKeyScope') &&
      source.includes("/api\\/projects") &&
      source.includes("read: 'tasks:read'") &&
      source.includes('No scope mapping for API endpoint'),
    message: 'Explicit API-key scopes must be enforced centrally by method/path groups.',
  },
  {
    path: 'server/routes/settings.js',
    assert: (source) =>
      source.includes("const DEFAULT_NEW_API_KEY_SCOPES = ['projects:read']") &&
      source.includes('At least one API-key scope is required.') &&
      source.includes('scopes must be a non-empty array'),
    message: 'New and updated API keys must receive a least-privilege scope and reject explicit empty scopes.',
  },
  {
    path: 'server/routes/agent.js',
    assert: (source) =>
      source.includes('ALLOW_QUERY_CREDENTIALS') &&
      source.includes('ALLOW_QUERY_CREDENTIALS && typeof req.query.apiKey ===') &&
      source.includes('api_key_has_explicit_scopes'),
    message: 'The legacy agent ?apiKey authentication fallback must be opt-in.',
  },
  {
    path: 'server/routes/agent.js',
    assert: (source) =>
      source.includes('PLATFORM_AUTH_BYPASS_ENABLED') &&
      source.includes('if (PLATFORM_AUTH_BYPASS_ENABLED)'),
    message: 'Agent platform authentication bypass must require the explicit opt-in flag.',
  },
  {
    path: 'server/modules/providers/provider.routes.ts',
    assert: (source) =>
      source.includes('PIXCODE_ALLOW_QUERY_CREDENTIALS=1') &&
      source.includes('short-lived `streamTicket`'),
    message: 'Provider SSE docs must direct browser clients to stream tickets and mark query auth legacy.',
  },
  {
    path: 'server/services/public-api-manifest.js',
    assert: (source) =>
      source.includes('legacyQueryCredentials') &&
      source.includes('enabledByDefault: false') &&
      source.includes('PIXCODE_ALLOW_QUERY_CREDENTIALS=1'),
    message: 'Public API manifest must document header auth and the disabled-by-default query fallback.',
  },
  {
    path: '.env.example',
    assert: (source) => source.includes('PIXCODE_ALLOW_QUERY_CREDENTIALS=0'),
    message: '.env.example must make the raw query-credential fallback explicit and disabled by default.',
  },
  {
    path: 'docker-compose.yml',
    assert: (source) =>
      source.includes('PIXCODE_ALLOW_QUERY_CREDENTIALS: "${PIXCODE_ALLOW_QUERY_CREDENTIALS:-0}"') &&
      source.includes('PIXCODE_ALLOW_PLATFORM_AUTH_BYPASS: "${PIXCODE_ALLOW_PLATFORM_AUTH_BYPASS:-0}"'),
    message: 'Docker deployments must keep query credentials and platform auth bypass opt-in.',
  },
  {
    path: 'server/modules/nanoclaw/bridge.js',
    assert: (source) =>
      source.includes('const ownerMatch = folder?.match(/^u(\\d+)_/u)') &&
      source.includes('ownerUserId,'),
    message: 'NanoClaw scheduler results must carry the namespaced task owner into conversation routing.',
  },
  {
    path: 'server/modules/nanoclaw/chat-engine.js',
    assert: (source) =>
      source.includes('normalizedOwnerUserId') &&
      source.includes('Number(conv.ownerUserId) !== normalizedOwnerUserId') &&
      source.includes('ownerMatches'),
    message: 'Scheduled NanoClaw results must not append to another owner\'s conversation.',
  },
  {
    path: 'server/modules/nanoclaw/bridge.js',
    assert: (source) =>
      source.includes('const MAX_NANO_PROMPT_CHARS = 64 * 1024') &&
      source.includes('const MAX_NANO_SCHEDULE_CHARS = 256') &&
      source.includes('const MAX_NANO_PROJECT_ID_CHARS = 256') &&
      source.includes('const MAX_NANO_PROJECT_PATH_CHARS = 4096') &&
      source.includes("router.post('/run'") &&
      source.includes("router.post('/tasks'") &&
      source.includes("router.patch('/tasks/:taskId'") &&
      source.includes("router.post('/bot/chat'") &&
      source.includes("router.post('/bot/chat/stream'") &&
      source.includes("'schedule_type must be one of: cron, interval, once'") &&
      source.includes('update.prompt = readNanoText') &&
      source.includes("'message',\n        { required: true }") &&
      source.includes("'projectPath',\n      ) || null"),
    message: 'NanoClaw run/task/chat inputs must be bounded and schedule types must be validated.',
  },
  {
    path: 'server/routes/git.js',
    assert: (source) =>
      source.includes('fs.opendir') &&
      source.includes('FILESYSTEM_SCAN_EXCLUDED_DIRS') &&
      source.includes("'prebuilts'"),
    message: 'Git filesystem fallback must use bounded streaming directory scans and skip heavy folders.',
  },
  {
    path: 'server/routes/agent.js',
    assert: (source) =>
      source.includes('function canonicalExistingPath') &&
      source.includes('fsSync.realpathSync.native(cursor)') &&
      source.includes('isPathWithinExternalProjects'),
    message: 'External agent workspaces must resolve existing symlink parents before containment checks.',
  },
  {
    path: 'server/routes/agent.js',
    assert: (source) =>
      source.includes('MAX_AGENT_MESSAGE_CHARS') &&
      source.includes('MAX_AGENT_PATH_CHARS') &&
      source.includes('MAX_AGENT_URL_CHARS') &&
      source.includes('readBoundedAgentText') &&
      source.includes('messageResult') &&
      source.includes('modelResult'),
    message: 'External agent requests must bound prompt, path, URL, model, and branch inputs before spawning a provider.',
  },
  {
    path: 'server/routes/projects.js',
    assert: (source) =>
      source.includes("router.post('/create-workspace'") &&
      source.includes("newGithubToken.length > 512") &&
      source.includes("githubTokenId !== undefined") &&
      source.includes("GitHub token id is invalid."),
    message: 'Direct workspace creation must bound one-time GitHub credentials and validate credential ids.',
  },
  {
    path: 'src/types/app.ts',
    assert: (source) => source.includes('projects?: Project[]') && source.includes('invalidated?: boolean'),
    message: 'Project update websocket messages must support lightweight invalidation payloads.',
  },
  {
    path: 'src/hooks/useProjectsState.ts',
    assert: (source) => source.includes('void fetchProjects();') && source.includes('Array.isArray(projectsMessage.projects)'),
    message: 'Projects state must refetch after lightweight invalidation messages.',
  },
  {
    path: 'src/components/standalone-shell/view/StandaloneShell.tsx',
    assert: (source) => source.includes('showHeader={showHeader}') && source.includes('layoutSignal={layoutSignal}'),
    message: 'Standalone shell must pass header visibility and layout refit signals through to the inner shell.',
  },
  {
    path: 'src/components/shell/view/Shell.tsx',
    assert: (source) =>
      source.includes('showHeader?: boolean') &&
      source.includes('showHeader &&') &&
      source.includes('layoutSignal?: string | number | null') &&
      source.includes('isRightCliTerminal') &&
      source.includes('pixcode-shell-terminal--right-cli') &&
      source.includes('pixcode-shell-terminal') &&
      source.includes('min-w-0') &&
      source.includes('max-w-full'),
    message: 'Shell must support true headerless rendering, right CLI scoping, and a stable terminal fit container.',
  },
  {
    path: 'src/components/shell/hooks/useShellTerminal.ts',
    assert: (source) =>
      source.includes('fitShellTerminal') &&
      source.includes('layoutSignalRef.current') &&
      !source.includes('}, [fitAddonRef, layoutSignal, terminalContainerRef, terminalRef, wsRef])'),
    message: 'Shell terminal must refit on layout changes without reconnecting the terminal lifecycle.',
  },
  {
    path: 'src/components/shell/hooks/useShellConnection.ts',
    assert: (source) =>
      source.includes('terminalContainerRef') &&
      source.includes('layoutSignalRef') &&
      source.includes('fitShellTerminal') &&
      source.includes('cols: currentTerminal.cols') &&
      source.includes('rows: currentTerminal.rows'),
    message: 'Shell connection init must fit terminal dimensions from the real container before sending PTY rows and columns.',
  },
  {
    path: 'src/components/shell/utils/terminalFit.ts',
    assert: (source) =>
      source.includes('getBoundingClientRect()') &&
      source.includes('measureCellFromDom') &&
      source.includes('proposeDimensionsFromContainer') &&
      source.includes('right-cli:') &&
      source.includes('terminal.resize(nextCols, nextRows)') &&
      !source.includes('terminal.options.fontSize = nextFontSize'),
    message: 'Terminal fit utility must use real container geometry for the right CLI panel.',
  },
  {
    path: 'src/components/shell/utils/terminalStyles.ts',
    assert: (source) =>
      source.includes('.pixcode-shell-terminal') &&
      source.includes('display: flex') &&
      source.includes('max-width: 100%') &&
      source.includes('.pixcode-shell-terminal .xterm-viewport') &&
      source.includes('.pixcode-shell-terminal--right-cli .xterm-rows') &&
      !source.includes('white-space: pre-wrap !important') &&
      !source.includes('overflow-wrap: anywhere !important') &&
      !source.includes('word-break: break-word !important') &&
      !source.includes('.pixcode-shell-terminal .xterm-rows > div'),
    message: 'Terminal styles must preserve xterm row semantics and avoid CSS wrapping terminal rows.',
  },
  {
    path: 'src/components/vscode-workbench/view/VSCodeWorkbench.tsx',
    assert: (source) =>
      source.includes('getDefaultBottomTerminalHeight') &&
      source.includes("useState(() => getDefaultBottomTerminalHeight())") &&
      !source.includes('BOTTOM_TERMINAL_DEFAULT_HEIGHT'),
    message: 'Desktop workbench terminal must use a viewport-aware default height.',
  },
  {
    path: 'src/components/vscode-workbench/view/VSCodeWorkbench.tsx',
    assert: (source) =>
      source.includes("autoConnect={canAutoConnect && tab.id === activeCliTab?.id}") &&
      source.includes('layoutSignal={rightPaneWidth}') &&
      source.includes('right-cli:${layoutSignal}') &&
      source.includes('getRightPaneMaxWidth') &&
      source.includes('RIGHT_HARD_MAX_WIDTH') &&
      !source.includes('RIGHT_MAX_WIDTH = 680') &&
      source.includes("absolute inset-0 min-w-0 overflow-hidden") &&
      source.includes("h-full min-w-0 shrink-0 overflow-hidden bg-background"),
    message: 'Right CLI panel must keep hidden tabs disconnected, refit on resize, and avoid a narrow fixed width cap.',
  },
];

const failures = checks.flatMap(({ path, assert, message }) => {
  const source = read(path);
  return assert(source) ? [] : [`${path}: ${message}`];
});

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('backend resource bound static checks passed');
