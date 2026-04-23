/// <reference types="vite/client" />

// Injected by vite.config.js via `define` at build time. Mirrors the
// repo's package.json version so the UI knows its own ground-truth
// version independent of whatever /health reports.
declare const __PIXCODE_UI_VERSION__: string;
