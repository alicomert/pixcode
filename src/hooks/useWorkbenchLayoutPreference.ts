import { useCallback, useEffect, useState } from 'react';

export type WorkbenchLayoutPreference = 'vscode';

export const WORKBENCH_LAYOUT_STORAGE_KEY = 'pixcode.workbench.layout';
export const WORKBENCH_LAYOUT_CHANGE_EVENT = 'pixcode:workbench-layout-change';

function readWorkbenchLayoutPreference(): WorkbenchLayoutPreference {
  return 'vscode';
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

    window.localStorage.setItem(WORKBENCH_LAYOUT_STORAGE_KEY, 'vscode');
    window.dispatchEvent(new CustomEvent(WORKBENCH_LAYOUT_CHANGE_EVENT, { detail: 'vscode' }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === WORKBENCH_LAYOUT_STORAGE_KEY) {
        setWorkbenchLayoutState('vscode');
      }
    };

    const handlePreferenceChange = () => {
      setWorkbenchLayoutState('vscode');
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
    useVscodeWorkbench: true,
  };
}
