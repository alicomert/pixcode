import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../utils/api';
import type { CodeEditorFile } from '../types/types';
import { isBinaryFile } from '../utils/binaryFile';

type UseCodeEditorDocumentParams = {
  file: CodeEditorFile;
  projectPath?: string;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const useCodeEditorDocument = ({ file, projectPath }: UseCodeEditorDocumentParams) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isBinary, setIsBinary] = useState(false);
  const fileProjectName = file.projectName ?? projectPath;
  const filePath = file.path;
  const fileName = file.name;
  const fileDiffNewString = file.diffInfo?.new_string;
  const fileDiffOldString = file.diffInfo?.old_string;
  const loadGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const loadFileContent = async () => {
      try {
        setLoading(true);
        setIsBinary(false);
        setSaveError(null);

        // Check if file is binary by extension
        if (isBinaryFile(fileName)) {
          if (generation !== loadGenerationRef.current) return;
          setIsBinary(true);
          setContent('');
          setLoading(false);
          return;
        }

        // Diff payload may already include full old/new snapshots, so avoid disk read.
        if (file.diffInfo && fileDiffNewString !== undefined && fileDiffOldString !== undefined) {
          if (generation !== loadGenerationRef.current) return;
          setContent(fileDiffNewString);
          setLoading(false);
          return;
        }

        if (!fileProjectName) {
          throw new Error('Missing project identifier');
        }

        const response = await api.readFile(fileProjectName, filePath, { signal: controller.signal });
        if (generation !== loadGenerationRef.current) return;

        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as { content?: string };
        if (generation !== loadGenerationRef.current) return;

        setContent(typeof data.content === 'string' ? data.content : '');
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        if (generation !== loadGenerationRef.current) return;

        const message = getErrorMessage(error);
        console.error('Error loading file:', error);
        setContent(`// Error loading file: ${message}\n// File: ${fileName}\n// Path: ${filePath}`);
      } finally {
        if (generation === loadGenerationRef.current) {
          setLoading(false);
        }
      }
    };

    void loadFileContent();

    return () => {
      controller.abort();
    };
  }, [file.diffInfo, fileDiffNewString, fileDiffOldString, fileName, filePath, fileProjectName]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    try {
      if (!fileProjectName) {
        throw new Error('Missing project identifier');
      }

      const response = await api.saveFile(fileProjectName, filePath, content);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Save failed: ${response.status}`);
        }

        const textError = await response.text();
        console.error('Non-JSON error response:', textError);
        throw new Error(`Save failed: ${response.status} ${response.statusText}`);
      }

      await response.json();

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);

      window.dispatchEvent(new CustomEvent('pixcode:file-saved', {
        detail: { path: filePath },
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Error saving file:', error);
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }, [content, filePath, fileProjectName]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = file.name;

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    URL.revokeObjectURL(url);
  }, [content, file.name]);

  return {
    content,
    setContent,
    loading,
    saving,
    saveSuccess,
    saveError,
    isBinary,
    handleSave,
    handleDownload,
  };
};
