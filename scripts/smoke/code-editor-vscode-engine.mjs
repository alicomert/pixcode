import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const packageJson = JSON.parse(read('package.json'));
const surface = read('src/components/code-editor/view/subcomponents/CodeEditorSurface.tsx');
const editor = read('src/components/code-editor/view/CodeEditor.tsx');
const localMonaco = read('src/components/code-editor/utils/localMonaco.ts');

const allDeps = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};

assert.ok(allDeps['@monaco-editor/react'], 'Code editor should depend on the React Monaco wrapper.');
assert.ok(allDeps['monaco-editor'], 'Code editor should depend on the Monaco editor engine.');

assert.match(
  surface,
  /const MonacoEditor = lazy[\s\S]*import\(['"]@monaco-editor\/react['"]\)/,
  'Normal file editing should lazy-load Monaco instead of keeping a CodeMirror-only surface.',
);

assert.match(
  surface,
  /ensureLocalMonaco\(\)/,
  'Monaco should be configured before mount so Linux/self-hosted installs do not depend on the CDN loader.',
);

assert.match(
  localMonaco,
  /LOCAL_MONACO_BASE_PATH\s*=\s*['"]\/vendor\/monaco-editor\/min\/vs['"]/,
  "Code editor should load Monaco from Pixcode's same-origin vendor route.",
);

assert.match(
  localMonaco,
  /loader\.config\(\{\s*paths:\s*\{\s*vs:\s*LOCAL_MONACO_BASE_PATH/s,
  'Code editor should point @monaco-editor/react at the local Monaco loader path.',
);

assert.doesNotMatch(
  localMonaco,
  /https:\/\/cdn\.jsdelivr\.net|unpkg\.com|from ['"]monaco-editor/,
  'Local Monaco setup should not use a remote CDN or import the full monaco-editor barrel.',
);

assert.match(
  read('server/index.js'),
  /\/vendor\/monaco-editor\/min\/vs[\s\S]*express\.static/,
  'Server should serve Monaco loader and workers from the same-origin vendor route.',
);

assert.match(
  surface,
  /onMount=\{handleMonacoMount\}/,
  'Monaco should expose an onMount hook so Pixcode can wire VS Code-style key commands.',
);

assert.match(
  surface,
  /KeyMod\.CtrlCmd\s*\|\s*KeyCode\.KeyS/,
  'Monaco should handle Ctrl/Cmd+S with the native editor command system.',
);

assert.match(
  surface,
  /selectOnLineNumbers:\s*true/,
  'Monaco should support line-number click selection like VS Code.',
);

assert.match(
  surface,
  /automaticLayout:\s*true/,
  'Monaco should relayout cleanly inside resizable workbench panes.',
);

assert.match(
  editor,
  /const useMonacoEditor = !\(/,
  'CodeEditor should keep the existing CodeMirror diff fallback while using Monaco for regular files.',
);

assert.match(
  editor,
  /useMonacoEditor=\{useMonacoEditor\}/,
  'CodeEditor should pass the Monaco-vs-diff decision into the editor surface.',
);

console.log('code editor VS Code engine smoke passed');
