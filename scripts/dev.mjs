#!/usr/bin/env node
// Local development in one command (npm run dev):
//   - rebuilds the browser bundle into dist/ whenever the source changes (Vite in watch mode, in
//     this process; only the IIFE format and unminified, for speed: `npm run build` makes the rest)
//   - serves the repository's pages (index.html, dev.html and the built dist/)
//   - runs the test chat server (server/README.md)
//
//   npm run dev
//   npm run dev --pages-port=8100 --api-port=8788       (any shell, including PowerShell)
//   npm run dev -- --pages-port 8100 --api-port 8788
//   node scripts/dev.mjs --pages-port 8100 --api-port 8788
//
// Ports default to 8000 (pages) and 8787 (test server); DEV_PAGES_PORT and DEV_API_PORT work too.
// Without `--`, npm keeps the options and passes them as npm_config_* environment variables, which
// this script reads; that form needs `=`. A default port that is taken (or reserved by Windows) is
// replaced by the next free one; a port you choose must be free. The pages learn the test server's
// address from /dev-config.js. Ctrl+C stops everything.

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const HOST = '127.0.0.1'
const root = fileURLToPath(new URL('..', import.meta.url))

const { values, positionals } = parseArgs({
  options: {
    'pages-port': { type: 'string' },
    'api-port': { type: 'string' },
  },
  allowPositionals: true,
})
if (positionals.length) {
  console.warn(
    `Ignored: ${positionals.join(' ')}. Through npm without \`--\`, write --api-port=8788 (with =).`,
  )
}

/** A requested port and where it came from, or undefined for the default. */
function requestedPort(name) {
  const npmName = `npm_config_${name.replace('-', '_')}`
  const envName = `DEV_${name.replace('-', '_').toUpperCase()}`
  const sources = [
    [values[name], `--${name}`],
    [process.env[npmName], `npm run dev --${name}=…`],
    [process.env[envName], envName],
  ]
  for (const [value, source] of sources) {
    // npm sets "true" when the option was given without `=` (its number became a separate word).
    if (value === undefined || value === '' || value === 'true') continue
    return { value, source }
  }
  return undefined
}

/** Resolves to null when the port can be used, otherwise the error code (EADDRINUSE, EACCES, …). */
function bindError(port) {
  return new Promise(resolve => {
    const probe = createServer()
    probe.once('error', error => resolve(error.code ?? 'ERROR'))
    probe.listen(port, HOST, () => probe.close(() => resolve(null)))
  })
}

/** Whether the program on a port is this repository's test server (an earlier run, probably). */
async function isTestServer(port) {
  try {
    const response = await fetch(`http://${HOST}:${port}/healthz`, {
      signal: AbortSignal.timeout(1000),
    })
    return typeof (await response.json()).protocolVersion === 'number'
  } catch {
    return false
  }
}

/**
 * The port to use: the one asked for (which must be usable), or the default, or the next usable
 * port after it.
 */
async function choosePort(label, option, fallback) {
  const requested = requestedPort(option)
  if (requested) {
    const port = Number(requested.value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid ${label} port "${requested.value}" (from ${requested.source}).`)
    }
    const error = await bindError(port)
    if (error) throw new Error(await unusableMessage(label, port, error))
    console.log(`The ${label} uses port ${port} (from ${requested.source}).`)
    return port
  }
  for (let port = fallback; port < fallback + 50; port += 1) {
    const error = await bindError(port)
    if (!error) {
      if (port !== fallback) console.log(`Using port ${port} for the ${label} instead.`)
      return port
    }
    if (port === fallback) console.log(await unusableMessage(label, port, error))
  }
  throw new Error(`No usable port for the ${label} between ${fallback} and ${fallback + 49}.`)
}

async function unusableMessage(label, port, code) {
  if (code === 'EACCES') {
    return (
      `Port ${port} for the ${label} cannot be used: the system does not allow it. On Windows, ` +
      'Hyper-V, WSL or Docker may have reserved it: `netsh interface ipv4 show excludedportrange protocol=tcp` lists reserved ports.'
    )
  }
  const holder = (await isTestServer(port))
    ? 'A test server is already running there (an earlier `npm run dev`, `npm run server` or browser test run?).'
    : 'Another program is using it. To see which: `netstat -ano | findstr :' +
      port +
      '` on Windows, `lsof -i :' +
      port +
      '` elsewhere.'
  return `Port ${port} for the ${label} is in use (${code}). ${holder}`
}

let pagesPort
let apiPort
try {
  apiPort = await choosePort('test server', 'api-port', 8787)
  pagesPort = await choosePort('page server', 'pages-port', 8000)
} catch (error) {
  console.error(error.message)
  console.error('Choose other ports: npm run dev --pages-port=8100 --api-port=8788')
  process.exit(1)
}
const apiUrl = `http://${HOST}:${apiPort}`

// The servers run as child processes with an IPC channel: they exit when this process does, even
// if it is killed (Windows does not end child processes with their parent).
const processes = [
  {
    name: 'pages',
    args: ['scripts/serve-static.mjs', '--port', String(pagesPort), '--api-url', apiUrl],
  },
  { name: 'api', args: ['server/cli.ts', '--port', String(apiPort)] },
]

const children = []
let stopping = false
/** The Vite build watcher, once started. */
let watcher = null

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  void watcher?.close()
  setTimeout(() => process.exit(code), 500)
}

for (const { name, args } of processes) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const prefix = `[${name}]`.padEnd(8)
  for (const stream of [child.stdout, child.stderr]) {
    let pending = ''
    stream.on('data', chunk => {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        console.log(`${prefix}${line}`)
      }
    })
  }
  child.on('exit', code => {
    if (!stopping) {
      console.error(`${prefix}exited with code ${code}; stopping`)
      stop(code || 1)
    }
  })
  children.push(child)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
// Never leave the servers running if this process ends another way.
process.on('exit', () => {
  for (const child of children) if (child.exitCode === null) child.kill()
})

// The widget build runs in this process (Vite's JavaScript API), so it stops with it. Only the
// browser bundle, unminified (vite.config.ts, CLEARIDEAS_DEV_BUILD): ready in seconds.
console.log(`Building the widget for http://${HOST}:${pagesPort}/ ...`)
process.env.CLEARIDEAS_DEV_BUILD = '1'
const { build } = await import('vite')
let builds = 0
watcher = await build({ root, logLevel: 'warn', build: { watch: {} } })
watcher.on('event', event => {
  if (event.code === 'ERROR') {
    console.error(`[build] ${event.error?.message ?? event.error}`)
  } else if (event.code === 'END') {
    builds += 1
    console.log(
      builds === 1
        ? `Ready: open http://${HOST}:${pagesPort}/ (test server: ${apiUrl}). Ctrl+C to stop.`
        : '[build] Rebuilt: reload the page.',
    )
  }
  if ('result' in event) event.result?.close?.()
})
