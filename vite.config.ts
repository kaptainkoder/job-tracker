import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// App version = semver from package.json + the short commit SHA, so the value
// shown in-app changes on every deploy. On Vercel the SHA comes from the build
// env; locally we read git; otherwise "dev".
function buildVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };
  let sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  if (!sha) {
    try { sha = execSync('git rev-parse --short HEAD').toString().trim(); } catch { sha = 'dev'; }
  }
  return `${pkg.version}+${sha}`;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  build: {
    rollupOptions: {
      output: {
        // Keep heavy, independently-cacheable vendors out of the entry chunk.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Forward /api to `vercel dev` (serverless functions on :3000) in local dev.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
