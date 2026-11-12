// Protocol v1 request handling (docs/protocol/README.md). Core text-chat profile plus the optional
// non-streaming endpoints. Voice and realtime endpoints answer 403 because this server does not
// advertise them (README §2).

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

import { FixtureProvider } from './fixture-provider.ts'
import {
  clientIp,
  CONSENT_HEADER,
  getBearerToken,
  getHeader,
  HttpError,
  parseCookies,
  readJsonBody,
  requestUserId,
  sendError,
  sendJson,
  sendPreflight,
  serializeCookie,
  SESSION_REQUEST_HEADER,
  SESSION_RESPONSE_HEADER,
  setBaseHeaders,
  setCorsHeaders,
} from './http.ts'
import { pick, requestLanguage, serverMessage } from './i18n.ts'
import type { ChatProvider, ProviderEvent, SseFormat } from './provider.ts'
import { ProviderError } from './provider.ts'
import { FixedWindowRateLimiter, rateLimitHeaders } from './rate-limit.ts'
import { REALTIME_PROTOCOL, REALTIME_SAMPLE_RATE, RelayGrants, runRelay } from './realtime.ts'
import type { SiteConfig } from './sites.ts'
import { createDefaultSites, isOriginAllowed } from './sites.ts'
import type { Chat, StoredMessage, StoreLimits } from './store.ts'
import { MemoryStore } from './store.ts'
import { recordedReplyAudio } from './voice-audio.ts'
import { acceptWebSocket, rejectUpgrade } from './websocket.ts'

export const PROTOCOL_VERSION = 1
export const VISITOR_COOKIE = 'ci_public_chat_user_id'
const PREFIX = '/public/chat'
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

export interface RequestLimits {
  /** Maximum JSON request body size. */
  maxBodyBytes: number
  /** Maximum visitor message length in characters. */
  maxMessageLength: number
  /** Messages of history passed to the provider (bounds AI cost per turn). */
  maxHistoryMessages: number
  /** Maximum recorded-voice request body (base64 audio) size. */
  maxVoiceBodyBytes: number
  /** Maximum size of one realtime relay WebSocket message. */
  maxRelayMessageBytes: number
}

export interface RateLimitOptions {
  windowMs: number
  /** Message requests per site and client IP per window. */
  messagesPerWindow: number
  /** Requests with a missing or invalid access key per client IP per window. */
  authFailuresPerWindow: number
}

export interface ChatAppOptions {
  sites?: SiteConfig[]
  provider?: ChatProvider
  /** Accept requests without an Origin header (non-browser clients). Default true. */
  allowRequestsWithoutOrigin?: boolean
  /**
   * Send the identity cookie with `Secure; SameSite=None; Partitioned` (README §5.2). Required for
   * HTTPS deployments; leave false for plain-HTTP local testing, where `SameSite=Lax` is used.
   */
  secureCookies?: boolean
  limits?: Partial<RequestLimits>
  rateLimits?: Partial<RateLimitOptions>
  storeLimits?: Partial<StoreLimits>
  /** Receives one line per request. Never logs message content. */
  log?: (line: string) => void
  /** Pause between voice reply events, so widget states are visible by eye. Default 0. */
  voiceDelayMs?: number
}

export const DEFAULT_LIMITS: RequestLimits = {
  maxBodyBytes: 32 * 1024,
  maxMessageLength: 4000,
  maxHistoryMessages: 20,
  maxVoiceBodyBytes: 8 * 1024 * 1024,
  maxRelayMessageBytes: 256 * 1024,
}

export const DEFAULT_RATE_LIMITS: RateLimitOptions = {
  windowMs: 60_000,
  messagesPerWindow: 30,
  authFailuresPerWindow: 20,
}

type Route =
  | { name: 'init' }
  | { name: 'session' }
  | { name: 'stream'; chatId: string | null }
  | { name: 'send'; chatId: string | null }
  | { name: 'voice'; chatId: string | null; streaming: boolean }
  | { name: 'realtime' }

/** Maps a method and path to a route. Voice and realtime paths are matched before `/{chatId}`. */
export function matchRoute(method: string, pathname: string): Route | null {
  if (!pathname.startsWith(PREFIX)) return null
  const rest = pathname.slice(PREFIX.length)
  if (rest !== '' && !rest.startsWith('/')) return null
  const segments = rest.split('/').filter(Boolean)

  let decoded: string[]
  try {
    decoded = segments.map(segment => decodeURIComponent(segment))
  } catch {
    return null
  }

  if (method === 'GET')
    return decoded.length === 1 && decoded[0] === 'init' ? { name: 'init' } : null
  if (method !== 'POST') return null

  const [first, second, third] = decoded
  if (decoded.length === 0) return { name: 'send', chatId: null }
  if (first === 'session' && decoded.length === 1) return { name: 'session' }
  if (first === 'realtime')
    return decoded.length === 2 && second === 'session' ? { name: 'realtime' } : null
  if (first === 'voice') {
    // /voice, /voice/stream, /voice/{chatId}, /voice/{chatId}/stream
    if (decoded.length === 1) return { name: 'voice', chatId: null, streaming: false }
    if (decoded.length === 2 && second === 'stream')
      return { name: 'voice', chatId: null, streaming: true }
    if (decoded.length === 2) return { name: 'voice', chatId: second, streaming: false }
    if (decoded.length === 3 && third === 'stream')
      return { name: 'voice', chatId: second, streaming: true }
    return null
  }
  if (first === 'stream' && decoded.length === 1) return { name: 'stream', chatId: null }
  if (decoded.length === 1) return { name: 'send', chatId: first }
  if (decoded.length === 2 && second === 'stream') return { name: 'stream', chatId: first }
  return null
}

export interface ChatApp {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>
  /** Handles HTTP upgrade requests (the realtime voice relay). */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void
  store: MemoryStore
  sites: SiteConfig[]
}

export function createChatApp(options: ChatAppOptions = {}): ChatApp {
  const sites = options.sites ?? createDefaultSites()
  const sitesByKey = new Map(sites.map(site => [site.accessKey, site]))
  const provider = options.provider ?? new FixtureProvider()
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const rateLimits = { ...DEFAULT_RATE_LIMITS, ...options.rateLimits }
  const allowRequestsWithoutOrigin = options.allowRequestsWithoutOrigin ?? true
  const secureCookies = options.secureCookies ?? false
  const log = options.log ?? (() => {})
  const store = new MemoryStore(options.storeLimits)
  const relayGrants = new RelayGrants()
  const voiceDelayMs = options.voiceDelayMs ?? 0
  const messageLimiter = new FixedWindowRateLimiter(
    rateLimits.messagesPerWindow,
    rateLimits.windowMs,
  )
  const authFailureLimiter = new FixedWindowRateLimiter(
    rateLimits.authFailuresPerWindow,
    rateLimits.windowMs,
  )

  const anySiteAllows = (origin: string) => sites.some(site => isOriginAllowed(site, origin))

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now()
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://localhost')
    res.on('close', () => {
      log(`${method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`)
    })

    try {
      setBaseHeaders(res)
      if (url.pathname === '/healthz' && method === 'GET') {
        // Public and credential-free, so any page may read it (the dev index page checks it).
        res.setHeader('Access-Control-Allow-Origin', '*')
        sendJson(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION })
        return
      }

      const origin = getHeader(req, 'origin')

      // Preflight carries no Authorization header, so the site is unknown here (README §3.3).
      if (method === 'OPTIONS' && url.pathname.startsWith(PREFIX)) {
        if (origin && !anySiteAllows(origin)) {
          res.writeHead(403)
          res.end()
          return
        }
        sendPreflight(res, origin)
        return
      }

      // Let the browser read errors (for example 401) for origins some site allows.
      setCorsHeaders(res, origin && anySiteAllows(origin) ? origin : undefined)

      const route = matchRoute(method, url.pathname)
      if (!route) throw new HttpError(404, 'Not found')

      const site = authenticate(req)

      if (origin) {
        if (!isOriginAllowed(site, origin)) {
          clearCorsHeaders(res)
          throw new HttpError(403, 'Origin not allowed')
        }
      } else if (!allowRequestsWithoutOrigin) {
        throw new HttpError(403, 'Origin not allowed')
      }

      if (!site.enabled) throw new HttpError(403, 'Public chat disabled for site')

      switch (route.name) {
        case 'init':
          return handleInit(req, res, site)
        case 'session':
          return await handleSession(req, res, site)
        case 'stream':
          return await handleMessage(req, res, site, route.chatId, true)
        case 'send':
          return await handleMessage(req, res, site, route.chatId, false)
        case 'voice':
          return await handleVoice(req, res, site, route.chatId, route.streaming)
        case 'realtime':
          return await handleRealtimeSession(req, res, site)
      }
    } catch (error) {
      const httpError = toHttpError(error, log)
      if (res.headersSent) {
        res.end()
        return
      }
      sendError(res, httpError)
    }
  }

  function authenticate(req: IncomingMessage): SiteConfig {
    const ip = clientIp(req)
    const failures = authFailureLimiter.peek(ip)
    if (!failures.allowed) {
      throw new HttpError(429, 'Too many requests', { headers: rateLimitHeaders(failures) })
    }
    const token = getBearerToken(req)
    const site = token ? sitesByKey.get(token) : undefined
    if (!site) {
      authFailureLimiter.hit(ip)
      throw new HttpError(401, 'Unauthorized')
    }
    return site
  }

  /**
   * Identifies the visitor: cookie first, then session header (README §5). With `issueSession`
   * (init and session endpoints) it also returns a session ID and sets the cookie when consent
   * allows it.
   */
  function resolveVisitor(
    req: IncomingMessage,
    res: ServerResponse,
    issueSession: boolean,
  ): { visitorId: string; sessionId: string | null } {
    const cookieVisitor = parseCookies(req)[VISITOR_COOKIE]
    let visitorId = cookieVisitor && store.hasVisitor(cookieVisitor) ? cookieVisitor : null
    let sessionId: string | null = null

    const requestedSession = getHeader(req, SESSION_REQUEST_HEADER)
    if (requestedSession) {
      const sessionVisitor = store.getSessionVisitor(requestedSession)
      if (sessionVisitor && (!visitorId || sessionVisitor === visitorId)) {
        visitorId = sessionVisitor
        sessionId = requestedSession
      }
    }

    visitorId ??= store.createVisitor()
    if (!issueSession) return { visitorId, sessionId }

    sessionId ??= store.createSession(visitorId)
    res.setHeader(SESSION_RESPONSE_HEADER, sessionId)

    const consent = getHeader(req, CONSENT_HEADER) ?? 'not-required'
    if (consent !== 'pending' && cookieVisitor !== visitorId) {
      res.setHeader(
        'Set-Cookie',
        serializeCookie(VISITOR_COOKIE, visitorId, {
          maxAgeSeconds: ONE_YEAR_SECONDS,
          secure: secureCookies,
        }),
      )
    }
    return { visitorId, sessionId }
  }

  function handleInit(req: IncomingMessage, res: ServerResponse, site: SiteConfig): void {
    requestUserId(req) // a malformed user ID is reported on the first request
    resolveVisitor(req, res, true)
    sendJson(res, 200, buildInitResponse(site, requestLanguage(req)))
  }

  async function handleSession(
    req: IncomingMessage,
    res: ServerResponse,
    site: SiteConfig,
  ): Promise<void> {
    await readJsonBody(req, limits.maxBodyBytes) // no body expected; enforce the size limit anyway
    const userId = requestUserId(req)
    const { visitorId } = resolveVisitor(req, res, true)
    const chat = store.getLatestChat(site.id, visitorId, userId)
    sendJson(
      res,
      200,
      chat
        ? {
            existingChat: {
              chatId: chat.id,
              messages: chat.messages.map(message => ({
                role: message.role,
                content: message.content,
                createdAt: message.createdAt.toISOString(),
              })),
            },
          }
        : {},
    )
  }

  async function handleMessage(
    req: IncomingMessage,
    res: ServerResponse,
    site: SiteConfig,
    chatId: string | null,
    streaming: boolean,
  ): Promise<void> {
    const language = requestLanguage(req)
    const userId = requestUserId(req)
    const rate = messageLimiter.hit(`${site.id}:${clientIp(req)}`)
    const rateHeaders = rateLimitHeaders(rate)
    if (!rate.allowed) {
      throw new HttpError(429, serverMessage('rateLimited', language), { headers: rateHeaders })
    }
    for (const [name, value] of Object.entries(rateHeaders)) res.setHeader(name, value)

    const content = parseChatRequest(
      await readJsonBody(req, limits.maxBodyBytes),
      limits.maxMessageLength,
      language,
    )
    const chatName = pick(site.chatName, language)
    const { visitorId } = resolveVisitor(req, res, false)

    let chat: Chat
    let greeting: StoredMessage | null = null
    if (chatId) {
      const owned = store.getOwnedChat(chatId, site.id, visitorId, userId)
      if (!owned) throw new HttpError(404, serverMessage('chatNotFound', language))
      chat = owned
    } else {
      chat = store.createChat(site.id, visitorId, renderGreeting(site, language), userId)
      greeting = chat.messages[0] ?? null
    }
    const isNewChat = chatId === null
    const userMessage = store.appendMessage(chat, 'user', content)
    const rollback = () => {
      if (isNewChat) store.deleteChat(chat)
      else store.removeLastMessage(chat, userMessage)
    }

    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) controller.abort()
    })

    const events = provider
      .reply({
        site,
        chatId: chat.id,
        history: chat.messages.slice(-limits.maxHistoryMessages),
        language,
        userId,
        signal: controller.signal,
      })
      [Symbol.asyncIterator]()

    // Wait for the first event so failures before any output become HTTP errors (README §6.4).
    let next: IteratorResult<ProviderEvent>
    try {
      next = await events.next()
    } catch (error) {
      rollback()
      throw error
    }
    // The visitor left (or stopped the reply) before any output: there is no one to answer. The
    // message stays in the chat, as the widget still shows it.
    if (controller.signal.aborted) return

    if (!streaming) {
      let text = ''
      let finalText: string | null = null
      try {
        while (!next.done) {
          const event = next.value
          if (event.type === 'content') text += event.content
          if (event.type === 'final') finalText = event.content
          next = await events.next()
        }
      } catch (error) {
        rollback()
        throw error
      }
      const reply = store.appendMessage(chat, 'assistant', finalText ?? text)
      const replies = greeting ? [greeting, reply] : [reply]
      sendJson(res, 200, {
        chatId: chat.id,
        chatName,
        messages: replies.map(message => ({ role: message.role, content: message.content })),
      })
      return
    }

    const stream = new EventStreamWriter(res)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    await stream.send({
      type: 'info',
      chatId: chat.id,
      id: chat.id,
      isNewChat,
      chatName,
    })

    let text = ''
    let finalText: string | null = null
    try {
      while (!next.done) {
        if (controller.signal.aborted) return
        const event = next.value
        switch (event.type) {
          case 'content':
            text += event.content
            await stream.send({ type: 'content', content: event.content })
            break
          case 'thinking':
            await stream.send({ type: 'thinking', thinking: event.thinking })
            break
          case 'toolCall':
            await stream.send({
              type: 'toolCall',
              toolCall: {
                id: event.id,
                function: { name: event.name, arguments: event.arguments },
              },
            })
            break
          case 'toolCallComplete':
            await stream.send({ type: 'toolCallComplete' })
            break
          case 'final':
            finalText = event.content
            break
          case 'test:comment':
            await stream.comment(event.comment)
            break
          case 'test:split-frames':
            stream.splitFrames = true
            break
          case 'test:sse-format':
            stream.format = event.format
            break
          case 'test:end':
            res.end()
            return
          case 'test:disconnect':
            // Flush what was sent, then close the connection without terminating the body,
            // which the client sees as a network drop mid-stream.
            // Yield an I/O turn so the client observes the preceding frames before FIN.
            await new Promise<void>(resolve => setImmediate(resolve))
            await new Promise<void>(resolve => {
              if (res.socket) res.socket.end(resolve)
              else resolve()
            })
            return
        }
        next = await events.next()
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const httpError = toHttpError(error, log)
      await stream.send({ type: 'error', error: httpError.message, statusCode: httpError.status })
      res.end()
      return
    }
    if (controller.signal.aborted) return

    const message = { role: 'assistant' as const, content: finalText ?? text }
    store.appendMessage(chat, 'assistant', message.content)
    await stream.send({ type: 'message_finalized', message })
    await stream.send({ type: 'done', chatId: chat.id, chatName, message })
    res.end()
  }

  /**
   * Recorded voice (protocol README §6.3): the visitor's audio in, a transcript and a spoken reply
   * out. This server does not recognize speech; the transcript names the recording's size and the
   * reply is canned, with the fixture audio (voice-audio.ts).
   */
  async function handleVoice(
    req: IncomingMessage,
    res: ServerResponse,
    site: SiteConfig,
    chatId: string | null,
    streaming: boolean,
  ): Promise<void> {
    if (!site.voice?.recorded) throw new HttpError(403, 'Voice chat disabled for site')
    const language = requestLanguage(req)
    const userId = requestUserId(req)
    const rate = messageLimiter.hit(`${site.id}:${clientIp(req)}`)
    const rateHeaders = rateLimitHeaders(rate)
    if (!rate.allowed) {
      throw new HttpError(429, serverMessage('rateLimited', language), { headers: rateHeaders })
    }
    for (const [name, value] of Object.entries(rateHeaders)) res.setHeader(name, value)

    const audioBytes = parseVoiceRequest(await readJsonBody(req, limits.maxVoiceBodyBytes))
    const { visitorId } = resolveVisitor(req, res, false)
    const chatName = pick(site.chatName, language)

    let chat: Chat
    if (chatId) {
      const owned = store.getOwnedChat(chatId, site.id, visitorId, userId)
      if (!owned) throw new HttpError(404, serverMessage('chatNotFound', language))
      chat = owned
    } else {
      chat = store.createChat(site.id, visitorId, renderGreeting(site, language), userId)
    }
    const isNewChat = chatId === null
    const transcript = serverMessage('voiceTranscript', language, {
      size: new Intl.NumberFormat(language).format(Math.max(1, Math.round(audioBytes / 1024))),
    })
    const response = serverMessage('voiceReply', language)
    const { audio, chunks } = recordedReplyAudio()
    store.appendMessage(chat, 'user', transcript)

    if (!streaming) {
      store.appendMessage(chat, 'assistant', response)
      sendJson(res, 200, { chatId: chat.id, transcript, response, audio })
      return
    }

    let aborted = false
    res.on('close', () => {
      if (!res.writableFinished) aborted = true
    })
    const pause = () =>
      voiceDelayMs > 0 ? new Promise(resolve => setTimeout(resolve, voiceDelayMs)) : null
    const stream = new EventStreamWriter(res)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    await stream.send({ type: 'info', chatId: chat.id, id: chat.id, isNewChat, chatName })
    await stream.send({ type: 'transcript', transcript })
    for (const word of response.split(/(?<=\s)/)) {
      if (aborted) return
      await stream.send({ type: 'content', content: word })
      await pause()
    }
    const message = { role: 'assistant' as const, content: response }
    await stream.send({ type: 'message_finalized', message })
    for (const [index, chunk] of chunks.entries()) {
      if (aborted) return
      await stream.send({
        type: 'audioChunk',
        audioChunk: chunk,
        audioChunkIndex: index,
        isInitSegment: index === 0,
      })
      await pause()
    }
    await stream.send({ type: 'audio', audio })
    store.appendMessage(chat, 'assistant', response)
    await stream.send({ type: 'done', chatId: chat.id, chatName, transcript, response, audio })
    res.end()
  }

  /** Realtime voice (README §12.1): a one-time token for the WebSocket relay (realtime.ts). */
  async function handleRealtimeSession(
    req: IncomingMessage,
    res: ServerResponse,
    site: SiteConfig,
  ): Promise<void> {
    if (!site.voice?.realtime) {
      throw new HttpError(403, 'Realtime voice disabled for site')
    }
    const language = requestLanguage(req)
    const userId = requestUserId(req)
    const rate = messageLimiter.hit(`${site.id}:${clientIp(req)}`)
    if (!rate.allowed) {
      throw new HttpError(429, serverMessage('rateLimited', language), {
        headers: rateLimitHeaders(rate),
      })
    }
    const body = (await readJsonBody(req, limits.maxBodyBytes)) as { chatId?: unknown } | undefined
    const { visitorId } = resolveVisitor(req, res, false)
    let chatId: string | null = null
    if (typeof body?.chatId === 'string' && body.chatId) {
      if (!store.getOwnedChat(body.chatId, site.id, visitorId, userId)) {
        throw new HttpError(404, serverMessage('chatNotFound', language))
      }
      chatId = body.chatId
    }
    const greeting = chatId ? null : renderGreeting(site, language)
    const { token, grant } = relayGrants.issue({
      siteId: site.id,
      visitorId,
      userId,
      chatId,
      language,
      greeting,
    })
    sendJson(res, 200, {
      provider: 'xai',
      transport: 'websocket',
      realtimeSessionId: grant.realtimeSessionId,
      websocketPath: `${PREFIX}/realtime/relay/${token}`,
      websocketProtocol: REALTIME_PROTOCOL,
      sampleRate: REALTIME_SAMPLE_RATE,
      ...(chatId ? { chatId } : {}),
      ...(greeting ? { initialGreeting: greeting } : {}),
    })
  }

  /** WebSocket upgrades: only the realtime relay, with a token from handleRealtimeSession. */
  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const match = /^\/public\/chat\/realtime\/relay\/([0-9a-f]{48})$/.exec(url.pathname)
    if (!match) return rejectUpgrade(socket, 404, 'Not found')
    const grant = relayGrants.redeem(match[1])
    if (!grant) return rejectUpgrade(socket, 403, 'Invalid or expired relay token')
    const site = sites.find(candidate => candidate.id === grant.siteId)
    const origin = getHeader(req, 'origin')
    if (!site || (origin ? !isOriginAllowed(site, origin) : !allowRequestsWithoutOrigin)) {
      return rejectUpgrade(socket, 403, 'Origin not allowed')
    }
    const connection = acceptWebSocket(req, socket, head, REALTIME_PROTOCOL, {
      maxMessageBytes: limits.maxRelayMessageBytes,
    })
    if (!connection) return
    log(`WS ${url.pathname.replace(match[1], '…')} open`)
    connection.onClose(() => log(`WS ${url.pathname.replace(match[1], '…')} closed`))
    runRelay({ connection, grant, store, delayMs: voiceDelayMs })
  }

  return { handle, handleUpgrade, store, sites }
}

/** Writes protocol stream events: one `data: <json>` line per event (README §6.1). */
export class EventStreamWriter {
  splitFrames = false
  format: SseFormat = 'standard'
  private eventId = 0
  private res: Pick<ServerResponse, 'write' | 'destroyed'>

  constructor(res: Pick<ServerResponse, 'write' | 'destroyed'>) {
    this.res = res
  }

  async send(event: Record<string, unknown>): Promise<void> {
    await this.write(this.frame(JSON.stringify(event), event))
  }

  private frame(json: string, event: Record<string, unknown>): string {
    switch (this.format) {
      case 'compact':
        return `data:${json}\n\n`
      case 'multiline':
        return (
          JSON.stringify(event, null, 2)
            .split('\n')
            .map(line => `data: ${line}`)
            .join('\n') + '\n\n'
        )
      case 'crlf':
        return `data: ${json}\r\n\r\n`
      case 'fields':
        this.eventId += 1
        return `event: message\nid: ${this.eventId}\nretry: 3000\ndata: ${json}\n\n`
      case 'no-blank-lines':
        return `data: ${json}\n`
      default:
        return `data: ${json}\n\n`
    }
  }

  async comment(text: string): Promise<void> {
    await this.write(`: ${text.replace(/[\r\n]/g, ' ')}\n\n`)
  }

  private async write(frame: string): Promise<void> {
    if (this.res.destroyed) return
    if (!this.splitFrames) {
      this.res.write(frame)
      return
    }
    // Test mode: send the frame as three byte ranges, which can split a multi-byte character.
    const bytes = Buffer.from(frame, 'utf8')
    const cuts = [0, Math.floor(bytes.length / 3), Math.floor((bytes.length * 2) / 3), bytes.length]
    for (let index = 0; index < 3; index += 1) {
      if (this.res.destroyed) return
      this.res.write(bytes.subarray(cuts[index], cuts[index + 1]))
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
}

function clearCorsHeaders(res: ServerResponse): void {
  for (const name of [
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials',
    'Access-Control-Expose-Headers',
  ]) {
    res.removeHeader(name)
  }
}

function toHttpError(error: unknown, log: (line: string) => void): HttpError {
  if (error instanceof HttpError) return error
  if (error instanceof ProviderError) {
    return new HttpError(error.status, error.message, {
      headers:
        error.retryAfterSeconds !== undefined
          ? { 'Retry-After': String(error.retryAfterSeconds) }
          : undefined,
    })
  }
  // Unexpected failures: log details server-side, show the visitor a generic message (README §8).
  log(
    `Unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  )
  return new HttpError(500, 'Internal server error')
}

/** Checks a recorded-voice body and returns the audio size in bytes (README §6.3, VoiceRequest). */
function parseVoiceRequest(body: unknown): number {
  const { audio, format } = (body ?? {}) as { audio?: unknown; format?: unknown }
  if (typeof audio !== 'string' || !audio) {
    throw new HttpError(400, 'Validation error', { details: 'audio is required' })
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
    throw new HttpError(400, 'Validation error', { details: 'audio must be base64' })
  }
  if (format !== undefined && !['webm', 'mp3', 'wav', 'm4a', 'ogg'].includes(String(format))) {
    throw new HttpError(400, 'Validation error', { details: 'unsupported audio format' })
  }
  return Buffer.byteLength(audio, 'base64')
}

function parseChatRequest(body: unknown, maxLength: number, language: string): string {
  const message = (body as { message?: unknown } | undefined)?.message
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new HttpError(400, 'Validation error', { details: 'message.content is required' })
  }
  if (content.length > maxLength) {
    // The message is shown to the visitor; details are for developers.
    throw new HttpError(
      400,
      serverMessage('messageTooLong', language, {
        max: new Intl.NumberFormat(language).format(maxLength),
      }),
      { details: `message.content must be at most ${maxLength} characters` },
    )
  }
  // message.aiModel is deliberately ignored: the server chooses the model (README §10).
  return content.trim()
}

function renderGreeting(site: SiteConfig, language: string): string {
  return pick(site.initialMessage, language).replaceAll(
    '{{chatName}}',
    pick(site.chatName, language),
  )
}

/** The init response in the visitor's language (README §5.1). */
export function buildInitResponse(site: SiteConfig, language: string): Record<string, unknown> {
  const response: Record<string, unknown> = {
    protocolVersion: PROTOCOL_VERSION,
    initialMessage: renderGreeting(site, language),
    chatName: pick(site.chatName, language),
  }
  const optional = {
    chatTagline: pick(site.chatTagline, language),
    heroGreeting: pick(site.heroGreeting, language),
    iconUrl: site.iconUrl,
    style: site.style,
    links: site.links?.map(link => ({
      title: pick(link.title, language),
      ...(link.description === undefined ? {} : { description: pick(link.description, language) }),
      url: link.url,
    })),
    helloBubbleEnabled: site.helloBubbleEnabled,
    helloBubbleText: pick(site.helloBubbleText, language),
    helloBubbleDelay: site.helloBubbleDelay,
    disclaimerText: pick(site.disclaimerText, language),
    disclaimerDialogEnabled: site.disclaimerDialogEnabled,
    disclaimerDialogText: pick(site.disclaimerDialogText, language),
    voiceEnabled: site.voice?.recorded || site.voice?.realtime ? true : undefined,
  }
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) response[key] = value
  }
  return response
}
