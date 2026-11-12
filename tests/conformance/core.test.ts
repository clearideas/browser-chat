// Protocol v1 conformance: core text-chat profile (docs/protocol/README.md).
// These tests make no assumptions about reply content, so they run against any server.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadProtocolSchema, validate } from './helpers/schema.ts'
import type { ParsedStream } from './helpers/sse.ts'
import { expectErrorBody, startTarget, type Target, Visitor } from './helpers/target.ts'

const eventSchema = loadProtocolSchema('stream-events.schema.json')
const REQUIRED_ALLOW_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'accept-language',
  'x-clearideas-public-chat-session',
  'x-clearideas-public-chat-consent-status',
  'x-clearideas-public-chat-user-id',
]

let target: Target

beforeAll(async () => {
  target = await startTarget()
})

afterAll(async () => {
  await target.close()
})

function listHeader(response: Response, name: string): string[] {
  return (response.headers.get(name) ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

/** Framing (§6.1), schema validity, and the text-chat event order (§6.2). */
function expectValidTextStream(stream: ParsedStream): {
  chatId: string
  finalContent: string
  streamedContent: string
} {
  expect(stream.violations).toEqual([])
  expect(stream.events.length).toBeGreaterThan(0)
  for (const event of stream.events) {
    expect(validate(eventSchema, event), JSON.stringify(event)).toEqual([])
  }

  const first = stream.events[0]
  const last = stream.events[stream.events.length - 1]
  expect(first.type).toBe('info')
  expect(last.type).toBe('done')
  expect(stream.events.filter(event => event.type === 'done')).toHaveLength(1)

  const chatId = last.chatId ?? last.id
  expect(typeof chatId).toBe('string')
  expect(first.chatId ?? first.id).toBe(chatId)

  const streamedContent = stream.events
    .filter(event => event.type === 'content')
    .map(event => event.content)
    .join('')
  const finalized = stream.events.find(event => event.type === 'message_finalized')
  const finalContent = last.message?.content ?? finalized?.message.content ?? streamedContent
  if (finalized) expect(finalized.message.content).toBe(finalContent)
  expect(finalContent.length).toBeGreaterThan(0)
  return { chatId, finalContent, streamedContent }
}

describe('GET /public/chat/init', () => {
  it('returns the widget configuration', async () => {
    const response = await new Visitor(target).init()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^application\/json/)

    const body = await response.json()
    expect(typeof body.initialMessage).toBe('string')
    expect(typeof body.chatName).toBe('string')
    if (body.protocolVersion !== undefined) {
      expect(Number.isInteger(body.protocolVersion)).toBe(true)
      expect(body.protocolVersion).toBeGreaterThanOrEqual(1)
    }
    if (body.style?.mode !== undefined)
      expect(['light', 'dark', 'system']).toContain(body.style.mode)
    if (body.links !== undefined) {
      expect(Array.isArray(body.links)).toBe(true)
      expect(body.links.length).toBeLessThanOrEqual(4)
      for (const link of body.links) {
        expect(typeof link.title).toBe('string')
        expect(typeof link.url).toBe('string')
      }
    }
  })

  it('issues a session ID to a new visitor (§5.1)', async () => {
    const visitor = new Visitor(target)
    await visitor.init()
    expect(visitor.sessionId).toBeTruthy()
  })

  it('treats an unknown session ID as a new visitor instead of failing (§5.1)', async () => {
    const visitor = new Visitor(target)
    visitor.sessionId = 'unknown-session-id-from-an-old-deployment'
    const response = await visitor.init()
    expect(response.status).toBe(200)
    expect(visitor.sessionId).toBeTruthy()
    expect(visitor.sessionId).not.toBe('unknown-session-id-from-an-old-deployment')
  })

  it('rejects a missing access key with 401 (§4)', async () => {
    const response = await fetch(`${target.baseUrl}/public/chat/init`, {
      headers: { Origin: target.origin },
    })
    expect(response.status).toBe(401)
    await expectErrorBody(response)
  })

  it('rejects an unknown access key with 401 (§4)', async () => {
    const response = await new Visitor(target, { accessKey: 'not-a-real-key' }).init()
    expect(response.status).toBe(401)
    await expectErrorBody(response)
  })
})

describe('CORS (§3.3)', () => {
  it('answers preflight with the exact origin and the required headers', async () => {
    const response = await fetch(`${target.baseUrl}/public/chat/stream`, {
      method: 'OPTIONS',
      headers: {
        Origin: target.origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': REQUIRED_ALLOW_HEADERS.join(','),
      },
    })
    expect([200, 204]).toContain(response.status)
    expect(response.headers.get('access-control-allow-origin')).toBe(target.origin)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(listHeader(response, 'access-control-allow-methods')).toEqual(
      expect.arrayContaining(['get', 'post']),
    )
    const allowed = listHeader(response, 'access-control-allow-headers')
    if (!allowed.includes('*'))
      expect(allowed).toEqual(expect.arrayContaining(REQUIRED_ALLOW_HEADERS))
  })

  it('echoes the origin and exposes the session header on actual responses', async () => {
    const response = await new Visitor(target).init()
    expect(response.headers.get('access-control-allow-origin')).toBe(target.origin)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(listHeader(response, 'access-control-expose-headers')).toContain(
      'x-clearideas-public-chat-session-id',
    )
    expect(listHeader(response, 'vary')).toContain('origin')
  })

  it('refuses an origin outside the site allowlist without CORS headers', async () => {
    const response = await new Visitor(target, { origin: target.disallowedOrigin }).init()
    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('Visitor cookies (§5.2, §5.3)', () => {
  it('does not set a persistent cookie while consent is pending', async () => {
    const response = await new Visitor(target, { consent: 'pending' }).init()
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('marks identity cookies HttpOnly, and Secure with SameSite=None over HTTPS', async () => {
    const response = await new Visitor(target, { consent: 'granted' }).init()
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toMatch(/;\s*HttpOnly/i)
      if (target.baseUrl.startsWith('https:')) {
        expect(cookie).toMatch(/;\s*Secure/i)
        expect(cookie).toMatch(/;\s*SameSite=None/i)
      }
    }
  })
})

describe('Chat lifecycle (§5.4, §6)', () => {
  it('streams a new chat, continues it, and restores it on activation', async () => {
    const visitor = new Visitor(target)
    await visitor.init()

    const activation = await visitor.activate()
    expect(activation.status).toBe(200)
    expect((await activation.json()).existingChat).toBeUndefined()

    const first = await visitor.stream('Hello from the conformance suite')
    expect(first.response.status).toBe(200)
    expect(first.response.headers.get('content-type')).toMatch(/^text\/event-stream/)
    const firstTurn = expectValidTextStream(first.stream!)
    expect(first.stream!.events[0].isNewChat ?? true).toBe(true)

    const second = await visitor.stream('A follow-up question', firstTurn.chatId)
    expect(second.response.status).toBe(200)
    const secondTurn = expectValidTextStream(second.stream!)
    expect(secondTurn.chatId).toBe(firstTurn.chatId)
    expect(second.stream!.events[0].isNewChat ?? false).toBe(false)

    const restored = await visitor.activate()
    expect(restored.status).toBe(200)
    const { existingChat } = await restored.json()
    expect(existingChat.chatId).toBe(firstTurn.chatId)
    const messages: Array<{ role: string; content: string; createdAt?: string }> =
      existingChat.messages
    for (const message of messages) {
      expect(['user', 'assistant']).toContain(message.role)
      expect(typeof message.content).toBe('string')
      if (message.createdAt !== undefined)
        expect(Number.isNaN(Date.parse(message.createdAt))).toBe(false)
    }
    const contents = messages.map(message => message.content)
    expect(contents).toContain('Hello from the conformance suite')
    expect(contents).toContain('A follow-up question')
    expect(contents).toContain(firstTurn.finalContent)
    expect(contents).toContain(secondTurn.finalContent)
  })

  it("returns 404 for another visitor's chat without revealing it exists", async () => {
    const owner = new Visitor(target)
    await owner.init()
    const { stream } = await owner.stream('Private question')
    const { chatId } = expectValidTextStream(stream!)

    const stranger = new Visitor(target)
    await stranger.init()
    const attempt = await stranger.stream('Let me in', chatId)
    expect(attempt.response.status).toBe(404)
    const missing = await stranger.stream('Let me in', 'chat-that-does-not-exist')
    expect(missing.response.status).toBe(404)
    expect((await expectErrorBody(attempt.response)).message).toBe(
      (await expectErrorBody(missing.response)).message,
    )
  })

  it('rejects an empty message with 400', async () => {
    const visitor = new Visitor(target)
    await visitor.init()
    const { response } = await visitor.stream('   ')
    expect(response.status).toBe(400)
    await expectErrorBody(response)
  })

  it('rejects invalid JSON with 400', async () => {
    const visitor = new Visitor(target)
    await visitor.init()
    const response = await visitor.request('/public/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"message":',
    })
    expect(response.status).toBe(400)
    await expectErrorBody(response)
  })
})

describe('Signed-in users (§5.5)', () => {
  it("keeps each user's chats to that user, also in one browser session", async () => {
    const alice = new Visitor(target, { userId: 'alice-1' })
    await alice.init()
    const { stream } = await alice.stream('Question from Alice')
    const { chatId } = expectValidTextStream(stream!)

    // Bob signs in on the same browser: same session, different user ID.
    const bob = new Visitor(target, { userId: 'bob-2' })
    bob.sessionId = alice.sessionId
    expect((await (await bob.activate()).json()).existingChat).toBeUndefined()
    expect((await bob.stream('Show me', chatId)).response.status).toBe(404)

    // Signed out (no user ID): not Alice's chat either.
    const anonymous = new Visitor(target)
    anonymous.sessionId = alice.sessionId
    expect((await (await anonymous.activate()).json()).existingChat).toBeUndefined()
    expect((await anonymous.stream('Show me', chatId)).response.status).toBe(404)

    // Alice again: her chat is back.
    const restored = await (await alice.activate()).json()
    expect(restored.existingChat?.chatId).toBe(chatId)
  })

  it('accepts any Unicode user ID (percent-encoded)', async () => {
    const visitor = new Visitor(target, { userId: 'zoë@example.com' })
    expect((await visitor.init()).status).toBe(200)
    expect((await visitor.stream('Hello')).response.status).toBe(200)
  })
})

describe('Optional profiles (§2)', () => {
  it('does not accept voice requests unless voice is advertised', async () => {
    const visitor = new Visitor(target)
    const init = await (await visitor.init()).json()
    if (init.voiceEnabled || init.voice?.enabled) return

    for (const path of ['/public/chat/voice/stream', '/public/chat/realtime/session']) {
      const response = await visitor.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: '', format: 'webm', locale: 'en' }),
      })
      expect(response.status, path).toBeGreaterThanOrEqual(400)
      await expectErrorBody(response)
    }
  })

  it('answers non-streaming requests with the documented shape when supported', async () => {
    const visitor = new Visitor(target)
    await visitor.init()
    const response = await visitor.request('/public/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { content: 'Non-streaming hello' } }),
    })
    if (response.status === 404 || response.status === 403) return // optional profile

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(typeof body.chatId).toBe('string')
    expect(Array.isArray(body.messages)).toBe(true)
    expect(body.messages.length).toBeGreaterThan(0)
    expect(body.messages[body.messages.length - 1].role).toBe('assistant')
  })
})
