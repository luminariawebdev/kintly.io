import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

// Build stamp injected at build time so the in-app version label always
// reflects the actual deployed build, instead of a hardcoded "v1.0" that
// drifts. Local date (matches the user's timezone) + short git commit.
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const buildDate = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
} catch { /* not a git checkout — the date alone is enough */ }
const buildStamp = gitSha ? `build ${buildDate} (${gitSha})` : `build ${buildDate}`;

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp),
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    outDir: '..',
    emptyOutDir: false,
  },
});
