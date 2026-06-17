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
    path: 'server/routes/git.js',
    assert: (source) =>
      source.includes('fs.opendir') &&
      source.includes('FILESYSTEM_SCAN_EXCLUDED_DIRS') &&
      source.includes("'prebuilts'"),
    message: 'Git filesystem fallback must use bounded streaming directory scans and skip heavy folders.',
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
      source.includes('pixcode-shell-terminal') &&
      source.includes('min-w-0') &&
      source.includes('max-w-full'),
    message: 'Shell must support true headerless rendering and a stable terminal fit container.',
  },
  {
    path: 'src/components/shell/utils/terminalStyles.ts',
    assert: (source) =>
      source.includes('.pixcode-shell-terminal') &&
      source.includes('display: flex') &&
      source.includes('max-width: 100%') &&
      source.includes('.pixcode-shell-terminal .xterm-viewport'),
    message: 'Terminal styles must avoid forcing viewport height independently from xterm fit.',
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
