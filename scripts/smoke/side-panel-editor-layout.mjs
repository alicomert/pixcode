#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync('src/components/main-content/view/MainContent.tsx', 'utf8');
const editorSource = readFileSync('src/components/code-editor/view/EditorSidebar.tsx', 'utf8');

assert.ok(
  mainSource.includes('SIDE_PANEL_MAX_WIDTH = 50'),
  'Side panel split width should be capped at half of the main surface.',
);
assert.ok(
  mainSource.includes('dockEditorInsideFilesPanel'),
  'Files tab should dock the editor inside the files side panel.',
);
assert.ok(
  mainSource.includes('showSidePanelSplit)'),
  'Side panel split should remain active even when a file editor is open.',
);
assert.ok(
  mainSource.includes('!dockEditorInsideFilesPanel &&'),
  'Global editor sidebar should not render when the editor is docked inside the files panel.',
);
assert.ok(
  mainSource.includes('max-w-[50%]'),
  'The file list column inside the files panel should be capped at 50%.',
);
assert.ok(
  editorSource.includes("useFlexLayout ? 'flex-1' : ''"),
  'EditorSidebar should fill inline docked space when fillSpace is enabled.',
);

console.log('side panel editor layout smoke passed');
