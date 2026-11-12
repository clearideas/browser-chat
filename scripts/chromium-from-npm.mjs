#!/usr/bin/env node
// Fetches a Chromium build from the npm registry for environments where Playwright's own browser
// download host is blocked but registry.npmjs.org is reachable.
//
//   node scripts/chromium-from-npm.mjs
//   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<printed path> npm run test:e2e
//
// Uses @sparticuz/chromium (a self-contained Linux x64 Chromium). It is installed into a cache
// directory outside this project, so it is not a project dependency. Playwright launches it with
// Playwright's own flags; the package's serverless flags (which disable web security) are not used,
// so CORS is enforced as in a normal browser.

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PACKAGE = '@sparticuz/chromium@153'

if (process.platform !== 'linux' || process.arch !== 'x64') {
  console.error('This fallback supports Linux x64 only. Use `npx playwright install chromium`.')
  process.exit(1)
}

const cacheDir =
  process.env.CHROMIUM_NPM_CACHE_DIR ?? join(homedir(), '.cache', 'browser-chat-chromium')
mkdirSync(cacheDir, { recursive: true })

console.error(`Installing ${PACKAGE} into ${cacheDir} ...`)
execFileSync(
  'npm',
  ['install', '--prefix', cacheDir, '--no-save', '--no-audit', '--no-fund', PACKAGE],
  { stdio: ['ignore', 'ignore', 'inherit'] },
)

const entry = join(cacheDir, 'node_modules', '@sparticuz', 'chromium', 'build', 'index.js')
const { default: chromium } = await import(pathToFileURL(entry).href)
const executablePath = await chromium.executablePath()

console.error(`Chromium extracted to ${executablePath}`)
console.error('Run browser tests with:')
console.error(`  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=${executablePath} npm run test:e2e`)
console.log(executablePath)
