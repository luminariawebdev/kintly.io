// Build identity. `__BUILD_STAMP__` is replaced at build time by Vite
// (see vite.config.js) with a local-date + short-git-sha string like
// "build 2026.06.14 (5e839f4)". The typeof guard keeps this safe if the
// define is ever absent (e.g. a test runner) — it falls back to "dev".
export const BUILD_STAMP =
  typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev';

// What the footer renders. CSS uppercases it for display.
export const VERSION_LABEL = `kinnekt · ${BUILD_STAMP}`;
