// Starts the test server from the command line:
//
//   node server/cli.ts [--port 8787] [--host 127.0.0.1] [--origins http://localhost,https://example.com]
//                      [--chunk-delay 30] [--messages-per-minute 30] [--secure-cookies] [--quiet]
//
// Environment variables PORT, HOST, ALLOWED_ORIGINS, CHUNK_DELAY_MS and MESSAGES_PER_MINUTE work too.

import { parseArgs } from 'node:util'

import { FixtureProvider } from './fixture-provider.ts'
import { createChatServer, DEFAULT_RATE_LIMITS } from './index.ts'
import { createDefaultSites, DEFAULT_DEV_ORIGINS } from './sites.ts'

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: process.env.PORT ?? '8787' },
    host: { type: 'string', default: process.env.HOST ?? '127.0.0.1' },
    origins: { type: 'string', default: process.env.ALLOWED_ORIGINS ?? '' },
    'chunk-delay': { type: 'string', default: process.env.CHUNK_DELAY_MS ?? '30' },
    'messages-per-minute': {
      type: 'string',
      default: process.env.MESSAGES_PER_MINUTE ?? String(DEFAULT_RATE_LIMITS.messagesPerWindow),
    },
    'secure-cookies': { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
  },
})

const origins = values.origins
  ? values.origins
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  : DEFAULT_DEV_ORIGINS

const sites = createDefaultSites(origins)
const server = createChatServer({
  sites,
  provider: new FixtureProvider({ chunkDelayMs: Number(values['chunk-delay']) }),
  voiceDelayMs: Number(values['chunk-delay']) * 2,
  secureCookies: values['secure-cookies'],
  rateLimits: { windowMs: 60_000, messagesPerWindow: Number(values['messages-per-minute']) },
  log: values.quiet ? undefined : line => console.log(line),
})

let url: string
try {
  url = await server.listen(Number(values.port), values.host)
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  console.error(
    code === 'EADDRINUSE'
      ? `Port ${values.port} is in use. Start the test server on another port: --port 8788`
      : code === 'EACCES'
        ? `Port ${values.port} cannot be used (on Windows it may be reserved: netsh interface ipv4 show excludedportrange protocol=tcp). Try --port 8788`
        : `Could not listen on ${values.host}:${values.port}: ${(error as Error).message}`,
  )
  process.exit(1)
}
console.log(`Public chat test server (protocol v1) listening on ${url}`)
console.log(`Allowed origins: ${origins.join(', ')}`)
console.log('Access keys:')
for (const site of sites) {
  const note = !site.enabled
    ? ' (chat disabled)'
    : site.id === 'site-adversarial'
      ? ' (hostile config)'
      : site.voice?.realtime
        ? ' (realtime and recorded voice)'
        : site.voice?.recorded
          ? ' (recorded voice only)'
          : ''
  console.log(`  ${site.accessKey}${note}`)
}
console.log('Send "/fixture help" in the widget to list reply scenarios.')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0))
  })
}
// Started by scripts/dev.mjs (with an IPC channel): exit when it does, even if it was killed,
// since Windows does not end child processes with their parent.
if (process.send) process.on('disconnect', () => process.exit(0))
