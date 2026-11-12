// Chooses the server under test.
//
// By default the conformance suite starts the in-process test server (server/index.ts). To check
// another implementation, point it at a running server:
//
//   CHAT_SERVER_URL=https://api.example.com \
//   CHAT_ACCESS_KEY=<public widget key for a site with chat enabled> \
//   CHAT_ORIGIN=https://www.example.com \        # an origin in that site's allowlist
//   npm run test:conformance
//
// Tests that depend on canned fixture replies run only against the in-process server.

import {
  type ChatAppOptions,
  type ChatServer,
  createChatServer,
  SESSION_REQUEST_HEADER,
  SESSION_RESPONSE_HEADER,
} from '../../../server/index.ts'
import { type ParsedStream, readEventStream } from './sse.ts'

export const EXTERNAL_SERVER_URL = process.env.CHAT_SERVER_URL?.replace(/\/+$/, '')
export const IS_EXTERNAL = Boolean(EXTERNAL_SERVER_URL)

export interface Target {
  baseUrl: string
  accessKey: string
  /** An origin the site allows. */
  origin: string
  /** An origin no site should allow. */
  disallowedOrigin: string
  /** The in-process server, when not testing an external one. */
  server: ChatServer | null
  close(): Promise<void>
}

export const DEFAULT_TEST_ORIGIN = 'http://localhost:8000'

export async function startTarget(options: ChatAppOptions = {}): Promise<Target> {
  const disallowedOrigin = 'https://conformance-disallowed.invalid'
  if (EXTERNAL_SERVER_URL) {
    const accessKey = process.env.CHAT_ACCESS_KEY
    const origin = process.env.CHAT_ORIGIN
    if (!accessKey || !origin) {
      throw new Error('CHAT_SERVER_URL also needs CHAT_ACCESS_KEY and CHAT_ORIGIN')
    }
    return {
      baseUrl: EXTERNAL_SERVER_URL,
      accessKey,
      origin,
      disallowedOrigin,
      server: null,
      close: async () => {},
    }
  }

  const server = createChatServer({
    // Generous limits so the suite itself is not rate limited.
    rateLimits: { messagesPerWindow: 10_000, authFailuresPerWindow: 10_000 },
    ...options,
  })
  const baseUrl = await server.listen(0)
  return {
    baseUrl,
    accessKey: 'demo-public-key',
    origin: DEFAULT_TEST_ORIGIN,
    disallowedOrigin,
    server,
    close: () => server.close(),
  }
}

export interface VisitorOptions {
  consent?: 'granted' | 'not-required' | 'pending'
  language?: string
  accessKey?: string
  origin?: string | null
  /** Signed-in user ID, sent percent-encoded in x-clearideas-public-chat-user-id (§5.5). */
  userId?: string
}

/** Behaves like one browser visitor: remembers the session ID issued by the server. */
export class Visitor {
  sessionId: string | null = null
  private target: Target
  private options: VisitorOptions

  constructor(target: Target, options: VisitorOptions = {}) {
    this.target = target
    this.options = options
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.accessKey ?? this.target.accessKey}`,
      'Accept-Language': this.options.language ?? 'en',
      ...extra,
    }
    const origin = this.options.origin === undefined ? this.target.origin : this.options.origin
    if (origin) headers.Origin = origin
    if (this.sessionId) headers[SESSION_REQUEST_HEADER] = this.sessionId
    if (this.options.userId) {
      headers['x-clearideas-public-chat-user-id'] = encodeURIComponent(this.options.userId)
    }
    return headers
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.target.baseUrl}${path}`, {
      ...init,
      headers: this.headers((init.headers as Record<string, string>) ?? {}),
    })
  }

  private remember(response: Response): void {
    const issued = response.headers.get(SESSION_RESPONSE_HEADER)
    if (issued) this.sessionId = issued
  }

  async init(): Promise<Response> {
    const response = await this.request('/public/chat/init', {
      headers: this.consentHeader(),
    })
    this.remember(response)
    return response
  }

  async activate(): Promise<Response> {
    const response = await this.request('/public/chat/session', {
      method: 'POST',
      headers: this.consentHeader(),
    })
    this.remember(response)
    return response
  }

  /** Sends a message to a streaming endpoint. Reads the stream when the response is 200. */
  async stream(
    content: string,
    chatId: string | null = null,
  ): Promise<{ response: Response; stream: ParsedStream | null }> {
    const path = chatId
      ? `/public/chat/${encodeURIComponent(chatId)}/stream`
      : '/public/chat/stream'
    const response = await this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: { content } }),
    })
    const stream = response.status === 200 ? await readEventStream(response) : null
    return { response, stream }
  }

  private consentHeader(): Record<string, string> {
    return this.options.consent
      ? { 'x-clearideas-public-chat-consent-status': this.options.consent }
      : {}
  }
}

/** Error bodies must be JSON objects with a string `message` (README §8). */
export async function expectErrorBody(response: Response): Promise<{ message: string }> {
  const body = await response.json()
  if (!body || typeof body.message !== 'string' || !body.message) {
    throw new Error(`Error body must have a string "message": ${JSON.stringify(body)}`)
  }
  return body
}
