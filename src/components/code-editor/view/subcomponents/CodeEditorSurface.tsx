import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import type { EditorProps, OnMount } from '@monaco-editor/react';
import type { Extension } from '@codemirror/state';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from 'react';

import MarkdownPreview from './markdown/MarkdownPreview';

const MonacoEditor = lazy(async () => {
  const module = await import('@monaco-editor/react');
  return { default: module.Editor };
});

type CodeEditorSurfaceProps = {
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
  markdownPreview: boolean;
  isMarkdownFile: boolean;
  isDarkMode: boolean;
  fontSize: number;
  showLineNumbers: boolean;
  wordWrap: boolean;
  extensions: Extension[];
  fileName: string;
  filePath: string;
  useMonacoEditor: boolean;
};

const lightEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  '.cm-scroller': {
    backgroundColor: '#ffffff',
  },
  '.cm-content': {
    caretColor: '#111827',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#111827',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#bfdbfe',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc',
    borderRightColor: '#e5e7eb',
    color: '#64748b',
  },
  '.cm-activeLine': {
    backgroundColor: '#f8fafc',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#eef2ff',
  },
  '.cm-panels': {
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  '.cm-panels.cm-panels-top': {
    borderBottomColor: '#e5e7eb',
  },
}, { dark: false });

function getMonacoLanguage(fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (lowerName === '.env' || lowerName.startsWith('.env.')) {
    return 'ini';
  }

  const extension = lowerName.split('.').pop();
  switch (extension) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

function getMonacoModelPath(filePath: string, fileName: string) {
  const normalizedPath = (filePath || fileName).replace(/\\/g, '/').replace(/^\/+/, '');
  const encodedPath = normalizedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `file:///${encodedPath || encodeURIComponent(fileName)}`;
}

export default function CodeEditorSurface({
  content,
  onChange,
  onSave,
  markdownPreview,
  isMarkdownFile,
  isDarkMode,
  fontSize,
  showLineNumbers,
  wordWrap,
  extensions,
  fileName,
  filePath,
  useMonacoEditor,
}: CodeEditorSurfaceProps) {
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const handleMonacoMount = useCallback<OnMount>((editor, monaco) => {
    const { KeyCode, KeyMod } = monaco;

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
      onSaveRef.current();
    });
    editor.focus();
  }, []);

  const monacoOptions = useMemo<EditorProps['options']>(() => ({
    automaticLayout: true,
    contextmenu: true,
    copyWithSyntaxHighlighting: true,
    cursorBlinking: 'blink',
    folding: true,
    fontLigatures: false,
    fontSize,
    glyphMargin: false,
    lineNumbers: showLineNumbers ? 'on' : 'off',
    minimap: { enabled: false },
    mouseWheelZoom: true,
    multiCursorModifier: 'alt',
    renderLineHighlight: 'all',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    selectOnLineNumbers: true,
    selectionClipboard: true,
    tabCompletion: 'on',
    wordWrap: wordWrap ? 'on' : 'off',
  }), [fontSize, showLineNumbers, wordWrap]);

  if (markdownPreview && isMarkdownFile) {
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-gray-900">
        <div className="prose prose-sm mx-auto max-w-none px-8 py-6 dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 prose-code:text-sm prose-pre:bg-gray-900 prose-img:rounded-lg dark:prose-a:text-blue-400">
          <MarkdownPreview content={content} />
        </div>
      </div>
    );
  }

  if (useMonacoEditor) {
    return (
      <div className="h-full min-h-0 w-full overflow-hidden">
        <Suspense fallback={null}>
          <MonacoEditor
            value={content}
            onChange={(nextValue) => onChange(nextValue ?? '')}
            language={getMonacoLanguage(fileName)}
            path={getMonacoModelPath(filePath, fileName)}
            theme={isDarkMode ? 'vs-dark' : 'light'}
            height="100%"
            width="100%"
            options={monacoOptions}
            onMount={handleMonacoMount}
            loading={null}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <CodeMirror
      value={content}
      onChange={onChange}
      extensions={extensions}
      theme={isDarkMode ? oneDark : lightEditorTheme}
      height="100%"
      style={{
        fontSize: `${fontSize}px`,
        height: '100%',
      }}
      basicSetup={{
        lineNumbers: showLineNumbers,
        foldGutter: true,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        highlightSelectionMatches: true,
        searchKeymap: true,
      }}
    />
  );
}
