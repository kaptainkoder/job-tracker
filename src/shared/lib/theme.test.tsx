import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeProvider, useTheme } from './theme';
import ThemeToggle from '../ui/ThemeToggle';

// Direct DOM coverage for the shared theme contract. This deliberately exercises the public
// provider/toggle surface: document state, persisted choice, PWA chrome, and visible controls.
const state = ((globalThis as unknown as { __DOM_TEST_STATE__?: { failures: number } }).__DOM_TEST_STATE__ ??= {
  failures: 0,
});

const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function addThemeColorMeta(content = '#initial') {
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
  return meta;
}

function themeMeta() {
  return document.querySelector('meta[name="theme-color"]');
}

async function cleanupMounted() {
  while (mounted.length > 0) {
    const item = mounted.pop()!;
    try {
      await act(async () => item.root.unmount());
    } finally {
      item.container.remove();
    }
  }
}

async function resetEnvironment() {
  await cleanupMounted();
  document.documentElement.className = '';
  document.body.replaceChildren();
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  window.localStorage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: window.localStorage,
    configurable: true,
    writable: true,
  });
  globalThis.fetch = () => {
    throw new Error('network access is forbidden in theme DOM tests');
  };
}

async function restoreEnvironment() {
  await cleanupMounted();
  document.documentElement.className = '';
  document.body.replaceChildren();
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  window.localStorage.clear();
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await resetEnvironment();
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    state.failures += 1;
    console.log(`not ok - ${name}`);
    console.error(error instanceof Error ? error.stack : String(error));
  } finally {
    await restoreEnvironment();
  }
}

async function mount(children: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(children));
  return container;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

function ThemeProbe() {
  const { theme, setTheme, toggleTheme } = useTheme();
  return (
    <>
      <output data-testid="theme-state">{theme}</output>
      <button type="button" data-testid="set-dark" onClick={() => setTheme('dark')}>Set dark</button>
      <button type="button" data-testid="set-light" onClick={() => setTheme('light')}>Set light</button>
      <button type="button" data-testid="toggle-theme" onClick={toggleTheme}>Toggle theme</button>
    </>
  );
}

function renderedTheme(container: Element) {
  return container.querySelector('[data-testid="theme-state"]')?.textContent;
}

function providerWithProbe(extra: React.ReactNode = null) {
  return (
    <ThemeProvider>
      <ThemeProbe />
      {extra}
    </ThemeProvider>
  );
}

async function main() {
  await test('1: ThemeProvider initializes dark from an existing html.dark class', async () => {
    document.documentElement.classList.add('dark');
    const container = await mount(providerWithProbe());
    assert.equal(renderedTheme(container), 'dark');
  });

  await test('2: ThemeProvider initializes light when html.dark is absent', async () => {
    const container = await mount(providerWithProbe());
    assert.equal(renderedTheme(container), 'light');
  });

  await test('3: setTheme synchronizes React, root, storage, and PWA chrome for both values', async () => {
    const meta = addThemeColorMeta();
    const container = await mount(providerWithProbe());
    const dark = container.querySelector('[data-testid="set-dark"]');
    const light = container.querySelector('[data-testid="set-light"]');
    assert.ok(dark);
    assert.ok(light);

    await click(dark);
    assert.equal(renderedTheme(container), 'dark');
    assert.equal(document.documentElement.classList.contains('dark'), true);
    assert.equal(window.localStorage.getItem('theme'), 'dark');
    assert.equal(meta.getAttribute('content'), '#0b1117');

    await click(light);
    assert.equal(renderedTheme(container), 'light');
    assert.equal(document.documentElement.classList.contains('dark'), false);
    assert.equal(window.localStorage.getItem('theme'), 'light');
    assert.equal(meta.getAttribute('content'), '#fbfbfc');
  });

  await test('4: denied storage leaves React, root class, and PWA chrome synchronized', async () => {
    const meta = addThemeColorMeta();
    window.localStorage.setItem('theme', 'light');
    const storage = window.localStorage;
    const throwingStorage = new Proxy(storage, {
      get(target, property) {
        if (property === 'setItem') return () => { throw new Error('storage denied'); };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: throwingStorage,
      configurable: true,
      writable: true,
    });

    try {
      const container = await mount(providerWithProbe());
      const dark = container.querySelector('[data-testid="set-dark"]');
      assert.ok(dark);
      await click(dark);
      assert.equal(renderedTheme(container), 'dark');
      assert.equal(document.documentElement.classList.contains('dark'), true);
      assert.equal(meta.getAttribute('content'), '#0b1117');
      assert.equal(storage.getItem('theme'), 'light', 'throwing setItem leaves the prior choice untouched');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: storage,
        configurable: true,
        writable: true,
      });
    }
  });

  await test('5: a missing theme-color meta tag is tolerated while the other contracts update', async () => {
    const container = await mount(providerWithProbe());
    assert.equal(themeMeta(), null, 'fixture intentionally has no theme-color meta tag');
    const dark = container.querySelector('[data-testid="set-dark"]');
    assert.ok(dark);
    await click(dark);
    assert.equal(renderedTheme(container), 'dark');
    assert.equal(document.documentElement.classList.contains('dark'), true);
    assert.equal(window.localStorage.getItem('theme'), 'dark');
    assert.equal(themeMeta(), null);
  });

  await test('6: toggleTheme follows the current document class when the DOM has drifted', async () => {
    addThemeColorMeta();
    document.documentElement.classList.add('dark');
    const container = await mount(providerWithProbe());
    assert.equal(renderedTheme(container), 'dark', 'provider starts from the initial dark class');
    document.documentElement.classList.remove('dark');
    assert.equal(renderedTheme(container), 'dark', 'React state intentionally still reflects its initial value');

    const toggle = container.querySelector('[data-testid="toggle-theme"]');
    assert.ok(toggle);
    await click(toggle);
    assert.equal(renderedTheme(container), 'dark', 'a light DOM class toggles back to dark');
    assert.equal(document.documentElement.classList.contains('dark'), true);
    assert.equal(window.localStorage.getItem('theme'), 'dark');
    assert.equal(themeMeta()?.getAttribute('content'), '#0b1117');
  });

  await test('7: default ThemeToggle has both action states and clicks through the full contract', async () => {
    const meta = addThemeColorMeta();
    const container = await mount(providerWithProbe(<ThemeToggle />));
    const button = container.querySelector('button[aria-label="Switch to dark mode"]');
    assert.ok(button);
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('aria-label'), 'Switch to dark mode');
    assert.equal(button.getAttribute('title'), 'Switch to dark mode');
    assert.equal(button.getAttribute('aria-pressed'), 'false');

    await click(button);
    const darkButton = container.querySelector('button[aria-label="Switch to light mode"]');
    assert.ok(darkButton);
    assert.equal(darkButton.getAttribute('type'), 'button');
    assert.equal(darkButton.getAttribute('aria-label'), 'Switch to light mode');
    assert.equal(darkButton.getAttribute('title'), 'Switch to light mode');
    assert.equal(darkButton.getAttribute('aria-pressed'), 'true');
    assert.equal(renderedTheme(container), 'dark');
    assert.equal(document.documentElement.classList.contains('dark'), true);
    assert.equal(window.localStorage.getItem('theme'), 'dark');
    assert.equal(meta.getAttribute('content'), '#0b1117');
  });

  await test('8: labeled ThemeToggle exposes exact text, icon size, and supplied className', async () => {
    const container = await mount(providerWithProbe(<ThemeToggle withLabel size={23} className="theme-control" />));
    const button = container.querySelector('button.theme-control');
    assert.ok(button);
    assert.equal(button.getAttribute('class'), 'theme-control', 'supplied class replaces the default class string');
    assert.equal(button.textContent, 'Dark mode');
    const icon = button.querySelector('svg');
    assert.ok(icon);
    assert.equal(icon.getAttribute('width'), '23');
    assert.equal(icon.getAttribute('height'), '23');

    await click(button);
    assert.equal(button.textContent, 'Light mode');
    assert.equal(button.querySelector('svg')?.getAttribute('width'), '23');
    assert.equal(button.querySelector('svg')?.getAttribute('height'), '23');
  });

  await test('9: useTheme outside ThemeProvider throws the exact provider guard without noisy output', async () => {
    const originalConsoleError = console.error;
    const expectedReactNoise: unknown[][] = [];
    console.error = (...args: unknown[]) => { expectedReactNoise.push(args); };

    function UnguardedProbe() {
      useTheme();
      return null;
    }

    try {
      let thrown: unknown;
      try {
        await mount(<UnguardedProbe />);
      } catch (error) {
        thrown = error;
      }
      assert.ok(thrown instanceof Error);
      assert.equal(thrown.message, 'useTheme must be used within a ThemeProvider');
      assert.ok(expectedReactNoise.length > 0, 'expected React render error was captured locally');
    } finally {
      console.error = originalConsoleError;
    }
  });
}

void main()
  .catch((error) => {
    state.failures += 1;
    console.error(error instanceof Error ? error.stack : String(error));
  })
  .finally(() => {
    (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
  });
