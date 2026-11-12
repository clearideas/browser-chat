// Setup for live tests: a jsdom browser environment with real fetch and real Web Storage.
// Unlike tests/setup.ts, HTTP is not mocked; requests go to the in-process test server.

import { afterEach, beforeEach, vi } from 'vitest'

import { installConsoleGuard } from '../helpers/console-guard'

installConsoleGuard()

// jsdom lacks these layout/media APIs; the widget only needs inert stand-ins.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as typeof matchMedia

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
