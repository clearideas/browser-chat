// Public Chat Protocol v1 test server. Zero dependencies: Node.js built-ins only.
//
//   import { createChatServer } from './server/index.ts'
//   const server = createChatServer()
//   const url = await server.listen(8787)
//
// See server/README.md. This server returns canned replies; provider.ts shows where a real server
// calls an AI API.

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'

import { type ChatAppOptions, createChatApp } from './app.ts'
import type { SiteConfig } from './sites.ts'
import type { MemoryStore } from './store.ts'

export type { ChatAppOptions, RateLimitOptions, RequestLimits } from './app.ts'
export {
  buildInitResponse,
  createChatApp,
  DEFAULT_LIMITS,
  DEFAULT_RATE_LIMITS,
  matchRoute,
  PROTOCOL_VERSION,
  VISITOR_COOKIE,
} from './app.ts'
export type { FixtureProviderOptions } from './fixture-provider.ts'
export {
  FIXTURE_SCENARIOS,
  FixtureProvider,
  HOSTILE_CONTENT,
  parseFixtureCommand,
} from './fixture-provider.ts'
export {
  CONSENT_HEADER,
  SESSION_REQUEST_HEADER,
  SESSION_RESPONSE_HEADER,
  USER_ID_HEADER,
} from './http.ts'
export type { Localized, ServerMessage } from './i18n.ts'
export { pick, requestLanguage, SERVER_LANGUAGES, serverMessage } from './i18n.ts'
export type { ChatProvider, ProviderEvent, ProviderRequest } from './provider.ts'
export { ProviderError } from './provider.ts'
export { REALTIME_PROTOCOL, REALTIME_SAMPLE_RATE, TURN_SECONDS } from './realtime.ts'
export type { SiteConfig, SiteLink } from './sites.ts'
export {
  createAdversarialSite,
  createDefaultSites,
  createDemoSite,
  createDisabledSite,
  createRecordedVoiceSite,
  createVoiceSite,
  DEFAULT_DEV_ORIGINS,
  isOriginAllowed,
  originMatches,
  XSS_MARKER,
  xssProbe,
} from './sites.ts'
export type { Chat, StoredMessage, StoreLimits } from './store.ts'
export { MemoryStore } from './store.ts'
export { recordedReplyAudio } from './voice-audio.ts'
export { splitWebm } from './webm.ts'

export interface ChatServer {
  /** The underlying node:http server. */
  server: Server
  store: MemoryStore
  sites: SiteConfig[]
  /** Base URL once listening, for example `http://127.0.0.1:8787`. */
  readonly url: string
  /** Starts listening. Port 0 picks a free port. Resolves to the base URL. */
  listen(port?: number, host?: string): Promise<string>
  /** Stops the server, closing open streams. */
  close(): Promise<void>
}

export function createChatServer(options: ChatAppOptions = {}): ChatServer {
  const app = createChatApp(options)
  const server = createServer((req, res) => {
    void app.handle(req, res)
  })
  // Upgraded sockets (the realtime relay) leave the HTTP server's bookkeeping; close() ends them.
  const upgraded = new Set<Duplex>()
  server.on('upgrade', (req, socket, head) => {
    upgraded.add(socket)
    socket.on('close', () => upgraded.delete(socket))
    app.handleUpgrade(req, socket, head)
  })
  let url = ''

  return {
    server,
    store: app.store,
    sites: app.sites,
    get url() {
      return url
    },
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          const address = server.address() as AddressInfo
          const printableHost = address.family === 'IPv6' ? `[${address.address}]` : address.address
          url = `http://${printableHost}:${address.port}`
          resolve(url)
        })
      })
    },
    close() {
      return new Promise(resolve => {
        server.closeAllConnections()
        for (const socket of upgraded) socket.destroy()
        server.close(() => resolve())
      })
    },
  }
}
