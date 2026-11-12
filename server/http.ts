// Small HTTP helpers built on node:http. No framework, so every protocol rule is visible here.

import type { IncomingMessage, ServerResponse } from 'node:http'

export const SESSION_REQUEST_HEADER = 'x-clearideas-public-chat-session'
export const SESSION_RESPONSE_HEADER = 'x-clearideas-public-chat-session-id'
export const CONSENT_HEADER = 'x-clearideas-public-chat-consent-status'
/** The site's ID for a signed-in visitor, percent-encoded (protocol README §5.5). Unverified. */
export const USER_ID_HEADER = 'x-clearideas-public-chat-user-id'
export const MAX_USER_ID_LENGTH = 256

const ALLOWED_REQUEST_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Accept-Language',
  SESSION_REQUEST_HEADER,
  CONSENT_HEADER,
  USER_ID_HEADER,
].join(', ')

const EXPOSED_RESPONSE_HEADERS = [
  SESSION_RESPONSE_HEADER,
  'Retry-After',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
].join(', ')

/**
 * The user ID a request carries, decoded, or null without one. A malformed or over-long value is a
 * 400: silently ignoring it would merge that user's chats with anonymous ones.
 */
export function requestUserId(req: IncomingMessage): string | null {
  const raw = getHeader(req, USER_ID_HEADER)
  if (raw === undefined || raw.trim() === '') return null
  let userId: string
  try {
    userId = decodeURIComponent(raw.trim())
  } catch {
    throw new HttpError(400, 'Invalid user ID', {
      details: `${USER_ID_HEADER} is not percent-encoded UTF-8`,
    })
  }
  if (userId.length > MAX_USER_ID_LENGTH) {
    throw new HttpError(400, 'Invalid user ID', {
      details: `${USER_ID_HEADER} must be at most ${MAX_USER_ID_LENGTH} characters`,
    })
  }
  return userId
}

/** An error that maps to an HTTP status and a visitor-safe message (protocol README §8). */
export class HttpError extends Error {
  status: number
  details?: unknown
  headers?: Record<string, string>

  constructor(
    status: number,
    message: string,
    options: { details?: unknown; headers?: Record<string, string> } = {},
  ) {
    super(message)
    this.status = status
    this.details = options.details
    this.headers = options.headers
  }
}

/** Headers every response carries (protocol README §3.2). */
export function setBaseHeaders(res: ServerResponse): void {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

/**
 * CORS headers for an allowed origin (protocol README §3.3). The request origin is echoed because
 * the widget sends credentials, which rules out `*`.
 */
export function setCorsHeaders(res: ServerResponse, origin: string | undefined): void {
  res.setHeader('Vary', 'Origin')
  if (!origin) return
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Expose-Headers', EXPOSED_RESPONSE_HEADERS)
}

export function sendPreflight(res: ServerResponse, origin: string | undefined): void {
  setCorsHeaders(res, origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_REQUEST_HEADERS)
  res.setHeader('Access-Control-Max-Age', '600')
  res.writeHead(204)
  res.end()
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

export function sendError(res: ServerResponse, error: HttpError): void {
  const body: { message: string; details?: unknown } = { message: error.message }
  if (error.details !== undefined) body.details = error.details
  sendJson(res, error.status, body, error.headers)
}

/** Reads and parses a JSON body, rejecting bodies larger than `maxBytes` with 413. */
export async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, 'Request body too large')
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maxBytes) throw new HttpError(413, 'Request body too large')
    chunks.push(buffer)
  }

  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

export function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match ? match[1] : null
}

export function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const result: Record<string, string> = {}
  const header = req.headers.cookie
  if (!header) return result
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    try {
      result[name] = decodeURIComponent(value)
    } catch {
      result[name] = value
    }
  }
  return result
}

export interface CookieOptions {
  maxAgeSeconds: number
  secure: boolean
}

/** Identity cookie attributes required by protocol README §5.2. */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${options.maxAgeSeconds}`,
    'HttpOnly',
  ]
  if (options.secure) parts.push('SameSite=None', 'Secure', 'Partitioned')
  else parts.push('SameSite=Lax')
  return parts.join('; ')
}

export function clientIp(req: IncomingMessage): string {
  // Behind a reverse proxy, derive this from a trusted X-Forwarded-For hop instead.
  return req.socket.remoteAddress ?? 'unknown'
}
