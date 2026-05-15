import { useCallback, useEffect, useState } from 'react';

export type WorkbenchLayoutPreference = 'classic' | 'vscode';

export const WORKBENCH_LAYOUT_STORAGE_KEY = 'pixcode.workbench.layout';
export const WORKBENCH_LAYOUT_CHANGE_EVENT = 'pixcode:workbench-layout-change';

function readWorkbenchLayoutPreference(): WorkbenchLayoutPreference {
  if (typeof window === 'undefined') {
    return 'classic';
  }

  return window.localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY) === 'vscode'
    ? 'vscode'
    : 'classic';
}

export function useWorkbenchLayoutPreference() {
  const [workbenchLayout, setWorkbenchLayoutState] = useState<WorkbenchLayoutPreference>(
    readWorkbenchLayoutPreference,
  );

  const setWorkbenchLayout = useCallback((nextLayout: WorkbenchLayoutPreference) => {
    setWorkbenchLayoutState(nextLayout);

    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(WORKBENCH_LAYOUT_STORAGE_KEY, nextLayout);
    window.dispatchEvent(new CustomEvent(WORKBENCH_LAYOUT_CHANGE_EVENT, { detail: nextLayout }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === WORKBENCH_LAYOUT_STORAGE_KEY) {
        setWorkbenchLayoutState(readWorkbenchLayoutPreference());
      }
    };

    const handlePreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<WorkbenchLayoutPreference>).detail;
      setWorkbenchLayoutState(detail === 'vscode' ? 'vscode' : 'classic');
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(WORKBENCH_LAYOUT_CHANGE_EVENT, handlePreferenceChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(WORKBENCH_LAYOUT_CHANGE_EVENT, handlePreferenceChange);
    };
  }, []);

  return {
    workbenchLayout,
    setWorkbenchLayout,
    useVscodeWorkbench: workbenchLayout === 'vscode',
  };
}
