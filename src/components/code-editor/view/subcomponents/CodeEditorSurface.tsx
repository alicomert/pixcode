import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

import MarkdownPreview from './markdown/MarkdownPreview';

type CodeEditorSurfaceProps = {
  content: string;
  onChange: (value: string) => void;
  markdownPreview: boolean;
  isMarkdownFile: boolean;
  isDarkMode: boolean;
  fontSize: number;
  showLineNumbers: boolean;
  extensions: Extension[];
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

export default function CodeEditorSurface({
  content,
  onChange,
  markdownPreview,
  isMarkdownFile,
  isDarkMode,
  fontSize,
  showLineNumbers,
  extensions,
}: CodeEditorSurfaceProps) {
  if (markdownPreview && isMarkdownFile) {
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-gray-900">
        <div className="prose prose-sm mx-auto max-w-none px-8 py-6 dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 prose-code:text-sm prose-pre:bg-gray-900 prose-img:rounded-lg dark:prose-a:text-blue-400">
          <MarkdownPreview content={content} />
        </div>
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
