// Where the browser tests run their servers: their own ports, so they never collide with
// `npm run dev` (8000 and 8787). Override with E2E_PAGES_PORT and E2E_API_PORT.
// Shared by playwright.config.ts and the tests.

export const PAGES_PORT = Number(process.env.E2E_PAGES_PORT ?? 8100)
export const API_PORT = Number(process.env.E2E_API_PORT ?? 8797)
export const PAGES_URL = `http://127.0.0.1:${PAGES_PORT}`
/** The test server, as the pages reach it (from /dev-config.js). */
export const API_URL = `http://127.0.0.1:${API_PORT}`
