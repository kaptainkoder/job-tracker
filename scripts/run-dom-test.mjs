// DOM test runner for React components. The repo's other tests are pure (esbuild | node);
// this one needs a DOM, so it bundles the component test with esbuild while redirecting the
// two impure modules — the Supabase client (reads import.meta.env + hits the network) and the
// AuthProvider (React context) — to deterministic stubs, then evaluates the bundle under jsdom.
//
// Usage: node scripts/run-dom-test.mjs <entry.test.tsx>
import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import path from 'node:path';

const entry = process.argv[2];
if (!entry) {
  console.error('usage: node scripts/run-dom-test.mjs <entry.test.tsx>');
  process.exit(1);
}

const root = process.cwd();

const stubPlugin = {
  name: 'dom-test-stubs',
  setup(build) {
    build.onResolve({ filter: /[\\/]shared[\\/]lib[\\/]supabase$/ }, () => ({
      path: path.resolve(root, 'test/stubs/supabase.ts'),
    }));
    build.onResolve({ filter: /[\\/]auth[\\/]AuthProvider$/ }, () => ({
      path: path.resolve(root, 'test/stubs/AuthProvider.tsx'),
    }));
    build.onResolve({ filter: /[\\/]shared[\\/]lib[\\/]llmClient$/ }, () => ({
      path: path.resolve(root, 'test/stubs/llmClient.ts'),
    }));
  },
};

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  jsx: 'automatic',
  loader: { '.ttf': 'dataurl' },
  plugins: [stubPlugin],
});

// --- jsdom globals, installed before the bundle evaluates ---
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'Node',
  'getComputedStyle',
]) {
  // Node 22 defines some of these (e.g. navigator) as read-only globals; redefine where we can.
  try {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  } catch {
    // Leave Node's built-in in place if it can't be overridden.
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const code = result.outputFiles[0].text;
const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
await import(url);

// React's scheduler holds a MessageChannel port open, so the process won't exit on its own.
// The test file flips globalThis.__DOM_TESTS_DONE__ once every test has run and records any
// failures in globalThis.__DOM_TEST_STATE__.failures, so we exit deterministically with the
// right code. A 20s hard cap guards against a true hang.
const poll = setInterval(() => {
  if (globalThis.__DOM_TESTS_DONE__) {
    clearInterval(poll);
    const failures = globalThis.__DOM_TEST_STATE__?.failures ?? 0;
    if (failures > 0) console.error(`[runner] ${failures} test(s) failed`);
    process.exit(failures > 0 ? 1 : 0);
  }
}, 50);
setTimeout(() => {
  console.error('[runner] timed out waiting for tests to complete');
  process.exit(1);
}, 20000).unref();
