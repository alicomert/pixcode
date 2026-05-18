import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const surface = read('src/components/code-editor/view/subcomponents/CodeEditorSurface.tsx');
const styles = read('src/components/code-editor/utils/editorStyles.ts');
const editorSettings = read('src/components/code-editor/hooks/useCodeEditorSettings.ts');
const settingsController = read('src/components/settings/hooks/useSettingsController.ts');
const settingsConstants = read('src/components/settings/constants/constants.ts');
const themeContext = read('src/contexts/ThemeContext.jsx');

assert.match(
  surface,
  /const lightEditorTheme = EditorView\.theme/,
  'Code editor should define an explicit light CodeMirror theme.',
);

assert.match(
  surface,
  /theme=\{isDarkMode \? oneDark : lightEditorTheme\}/,
  'Code editor should use the light theme when dark mode is disabled.',
);

assert.match(
  styles,
  /\.cm-editor[\s\S]*background-color: \$\{isDarkMode \? '#111827' : '#ffffff'\} !important;/,
  'Injected editor styles should force a light editor background when light mode is active.',
);

assert.match(
  editorSettings,
  /const readAppTheme = \(\)/,
  'Code editor settings should fall back to the app theme when no editor theme is saved.',
);

assert.match(
  settingsController,
  /const readCodeEditorTheme = \(\): CodeEditorSettingsState\['theme'\]/,
  'Settings should show the app-aligned editor theme fallback.',
);

assert.match(
  settingsConstants,
  /theme: 'light'/,
  'Code editor settings should no longer default to a dark editor in light installations.',
);

assert.match(
  themeContext,
  /syncCodeEditorThemeWithApp/,
  'Main theme toggle should keep the code editor theme aligned unless the editor was customized separately.',
);

console.log('code editor theme smoke passed');
