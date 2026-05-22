import { loader } from '@monaco-editor/react';

export const LOCAL_MONACO_BASE_PATH = '/vendor/monaco-editor/min/vs';

let configured = false;

export function ensureLocalMonaco() {
  if (configured) {
    return;
  }

  loader.config({
    paths: {
      vs: LOCAL_MONACO_BASE_PATH,
    },
  });
  configured = true;
}
