// Test server internals and behaviors not covered by the generic conformance suite.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { EventStreamWriter } from '../../server/app.ts'
import {
  type ChatProvider,
  matchRoute,
  MemoryStore,
  originMatches,
  parseFixtureCommand,
  type ProviderRequest,
  VISITOR_COOKIE,
} from '../../server/index.ts'
import { FixedWindowRateLimiter } from '../../server/rate-limit.ts'
import { readEventStream } from '../conformance/helpers/sse.ts'
import { startTarget, type Target, Visitor } from '../conformance/helpers/target.ts'

let target: Target | null = null

afterEach(async () => {
  await target?.close()
  target = null
})

describe('originMatches', () => {
  it.each([
    ['https://www.example.com', 'https://www.example.com', true],
    ['https://www.example.com', 'http://www.example.com', false],
    ['https://www.example.com:8443', 'https://www.example.com', false],
    ['https://app.example.com', 'https://*.example.com', true],
    ['https://a.b.example.com', 'https://*.example.com', true],
    ['https://example.com', 'https://*.example.com', false],
    ['https://evilexample.com', 'https://*.example.com', false],
    ['https://example.com.evil.test', 'https://*.example.com', false],
    ['http://localhost:8000', 'http://localhost', true],
    ['http://127.0.0.1:5173', 'http://127.0.0.1', true],
    ['http://localhost:8000', 'http://localhost:3000', false],
    ['https://anything.test', '*', true],
    ['null', 'https://www.example.com', false],
  ])('%s against %s → %s', (origin, pattern, expected) => {
    expect(originMatches(origin, pattern)).toBe(expected)
  })
})

describe('matchRoute', () => {
  it.each([
    ['GET', '/public/chat/init', { name: 'init' }],
    ['POST', '/public/chat/session', { name: 'session' }],
    ['POST', '/public/chat/stream', { name: 'stream', chatId: null }],
    ['POST', '/public/chat/abc123/stream', { name: 'stream', chatId: 'abc123' }],
    ['POST', '/public/chat', { name: 'send', chatId: null }],
    ['POST', '/public/chat/abc123', { name: 'send', chatId: 'abc123' }],
    ['POST', '/public/chat/voice', { name: 'voice', chatId: null, streaming: false }],
    ['POST', '/public/chat/voice/stream', { name: 'voice', chatId: null, streaming: true }],
    ['POST', '/public/chat/voice/abc123', { name: 'voice', chatId: 'abc123', streaming: false }],
    [
      'POST',
      '/public/chat/voice/abc123/stream',
      { name: 'voice', chatId: 'abc123', streaming: true },
    ],
    ['POST', '/public/chat/realtime/session', { name: 'realtime' }],
    ['POST', '/public/chat/a%20b/stream', { name: 'stream', chatId: 'a b' }],
  ])('%s %s', (method, path, expected) => {
    expect(matchRoute(method, path)).toEqual(expected)
  })

  it.each([
    ['GET', '/public/chat/stream'],
    ['POST', '/public/chat/init/extra'],
    ['POST', '/public/chatty'],
    ['POST', '/public/chat/a/b/c'],
    ['POST', '/public/chat/%E0%A4%A/stream'],
    ['DELETE', '/public/chat/abc'],
  ])('rejects %s %s', (method, path) => {
    expect(matchRoute(method, path)).toBeNull()
  })
})

describe('parseFixtureCommand', () => {
  it('parses names and arguments', () => {
    expect(parseFixtureCommand('/fixture echo hi there')).toEqual({
      name: 'echo',
      argument: 'hi there',
    })
    expect(parseFixtureCommand('  /fixture  ')).toEqual({ name: 'help', argument: '' })
    expect(parseFixtureCommand('please /fixture echo')).toBeNull()
    expect(parseFixtureCommand('/fixtures')).toBeNull()
  })
})

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit per window, then resets', () => {
    const limiter = new FixedWindowRateLimiter(2, 1000)
    expect(limiter.hit('k', 0).allowed).toBe(true)
    expect(limiter.hit('k', 10).allowed).toBe(true)
    const blocked = limiter.hit('k', 20)
    expect(blocked).toMatchObject({ allowed: false, remaining: 0, resetSeconds: 1 })
    expect(limiter.hit('other', 20).allowed).toBe(true)
    expect(limiter.hit('k', 1001).allowed).toBe(true)
  })

  it('peeks without counting', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000)
    expect(limiter.peek('k', 0).allowed).toBe(true)
    expect(limiter.peek('k', 0).allowed).toBe(true)
    limiter.hit('k', 0)
    expect(limiter.peek('k', 0).allowed).toBe(false)
  })
})

describe('MemoryStore', () => {
  it('evicts the oldest chats past the limit', () => {
    const store = new MemoryStore({ maxChats: 2 })
    const visitor = store.createVisitor()
    const first = store.createChat('site', visitor, null)
    store.createChat('site', visitor, null)
    store.createChat('site', visitor, null)
    expect(store.stats().chats).toBe(2)
    expect(store.getOwnedChat(first.id, 'site', visitor)).toBeNull()
  })

  it('keeps only the newest messages per chat', () => {
    const store = new MemoryStore({ maxMessagesPerChat: 3 })
    const visitor = store.createVisitor()
    const chat = store.createChat('site', visitor, 'greeting')
    for (const text of ['a', 'b', 'c']) store.appendMessage(chat, 'user', text)
    expect(chat.messages.map(message => message.content)).toEqual(['a', 'b', 'c'])
  })

  it('scopes chats to site and visitor', () => {
    const store = new MemoryStore()
    const visitor = store.createVisitor()
    const chat = store.createChat('site-a', visitor, null)
    expect(store.getOwnedChat(chat.id, 'site-a', visitor)).toBe(chat)
    expect(store.getOwnedChat(chat.id, 'site-b', visitor)).toBeNull()
    expect(store.getOwnedChat(chat.id, 'site-a', store.createVisitor())).toBeNull()
  })
})

describe('EventStreamWriter', () => {
  function capture() {
    const writes: Buffer[] = []
    const res = {
      destroyed: false,
      write(chunk: string | Uint8Array) {
        writes.push(Buffer.from(chunk))
        return true
      },
    }
    return { writes, writer: new EventStreamWriter(res as any) }
  }

  it('writes each event as one data line followed by a blank line', async () => {
    const { writes, writer } = capture()
    await writer.send({ type: 'content', content: 'line one\nline two' })
    await writer.comment('keep\nalive')
    expect(writes.map(buffer => buffer.toString())).toEqual([
      'data: {"type":"content","content":"line one\\nline two"}\n\n',
      ': keep alive\n\n',
    ])
  })

  it('splits frames into three byte ranges in split mode, even inside a character', async () => {
    const { writes, writer } = capture()
    writer.splitFrames = true
    // 11 two-byte characters put the second cut (byte 40 of 61) inside an "é".
    await writer.send({ type: 'content', content: 'é'.repeat(11) })
    expect(writes).toHaveLength(3)
    const whole = Buffer.concat(writes)
    expect(whole.toString()).toBe(`data: {"type":"content","content":"${'é'.repeat(11)}"}\n\n`)
    const splitsInsideCharacter = writes
      .slice(0, -1)
      .some(piece => piece.toString('utf8').endsWith('\uFFFD'))
    expect(splitsInsideCharacter).toBe(true)
  })
})

describe('health check', () => {
  it('is readable from any origin, without credentials', async () => {
    target = await startTarget()
    const response = await fetch(`${target.baseUrl}/healthz`, {
      headers: { Origin: 'https://unlisted.example' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    expect(await response.json()).toEqual({ ok: true, protocolVersion: 1 })
  })
})

describe('rate limiting over HTTP', () => {
  it('limits messages per site and IP with 429 and rate limit headers', async () => {
    target = await startTarget({ rateLimits: { messagesPerWindow: 2 } })
    const visitor = new Visitor(target)
    await visitor.init()
    expect((await visitor.stream('one')).response.status).toBe(200)
    const second = await visitor.stream('two')
    expect(second.response.headers.get('ratelimit-remaining')).toBe('0')
    const third = await visitor.stream('three')
    expect(third.response.status).toBe(429)
    expect(Number(third.response.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(third.response.headers.get('ratelimit-limit')).toBe('2')
  })

  it('limits repeated authentication failures per IP', async () => {
    target = await startTarget({ rateLimits: { authFailuresPerWindow: 2 } })
    const intruder = new Visitor(target, { accessKey: 'guess' })
    expect((await intruder.init()).status).toBe(401)
    expect((await intruder.init()).status).toBe(401)
    expect((await intruder.init()).status).toBe(429)
    // Even a valid key is refused from that IP until the window resets.
    expect((await new Visitor(target).init()).status).toBe(429)
  })
})

describe('request limits', () => {
  it('rejects overlong messages with 400', async () => {
    target = await startTarget({ limits: { maxMessageLength: 10 } })
    const visitor = new Visitor(target)
    await visitor.init()
    expect((await visitor.stream('short')).response.status).toBe(200)
    expect((await visitor.stream('this is far too long')).response.status).toBe(400)
  })

  it('passes at most maxHistoryMessages to the provider', async () => {
    const seen: number[] = []
    const provider: ChatProvider = {
      async *reply(request: ProviderRequest) {
        seen.push(request.history.length)
        yield { type: 'content', content: 'ok' }
      },
    }
    target = await startTarget({ provider, limits: { maxHistoryMessages: 3 } })
    const visitor = new Visitor(target)
    await visitor.init()
    const { stream } = await visitor.stream('first')
    const chatId = stream!.events.at(-1)!.chatId
    for (const text of ['second', 'third', 'fourth']) await visitor.stream(text, chatId)
    expect(seen).toEqual([2, 3, 3, 3])
  })

  it('ignores a client-supplied aiModel', async () => {
    const seen: ProviderRequest[] = []
    const provider: ChatProvider = {
      async *reply(request) {
        seen.push(request)
        yield { type: 'content', content: 'ok' }
      },
    }
    target = await startTarget({ provider })
    const visitor = new Visitor(target)
    await visitor.init()
    const response = await visitor.request('/public/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { content: 'hi', aiModel: 'expensive-model' } }),
    })
    await readEventStream(response)
    expect(response.status).toBe(200)
    expect(JSON.stringify(seen[0].history)).not.toContain('expensive-model')
  })
})

describe('provider cancellation', () => {
  it('aborts the provider when the visitor disconnects', async () => {
    let signal: AbortSignal | null = null
    const provider: ChatProvider = {
      async *reply(request) {
        signal = request.signal
        yield { type: 'content', content: 'start ' }
        await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      },
    }
    target = await startTarget({ provider })
    const visitor = new Visitor(target)
    await visitor.init()

    const controller = new AbortController()
    const response = await visitor.request('/public/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { content: 'hi' } }),
      signal: controller.signal,
    })
    const reader = response.body!.getReader()
    await reader.read()
    controller.abort()

    await expect.poll(() => (signal as AbortSignal | null)?.aborted, { timeout: 5000 }).toBe(true)
  })

  it('handles a visitor leaving before any output', async () => {
    const logs: string[] = []
    target = await startTarget({ log: line => logs.push(line) })
    const visitor = new Visitor(target)
    await visitor.init()

    const controller = new AbortController()
    const pending = visitor
      .request('/public/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { content: '/fixture stall' } }),
        signal: controller.signal,
      })
      .catch(error => error)
    await new Promise(resolve => setTimeout(resolve, 100))
    controller.abort()
    expect((await pending).name).toBe('AbortError')

    // No error response is logged and the server keeps answering.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect((await visitor.stream('still there?')).response.status).toBe(200)
    expect(logs.filter(line => / 5\d\d /.test(line))).toEqual([])
  })

  it('rolls back a new chat when the provider fails before output', async () => {
    const provider: ChatProvider = {
      async *reply() {
        throw new Error('provider exploded with secret details')
      },
    }
    const lines: string[] = []
    target = await startTarget({ provider, log: line => lines.push(line) })
    const visitor = new Visitor(target)
    await visitor.init()
    const { response } = await visitor.stream('hi')
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ message: 'Internal server error' })
    expect(lines.join('\n')).toContain('provider exploded')
    expect(target.server!.store.stats().chats).toBe(0)
  })
})

describe('visitor identity', () => {
  it('recognizes a visitor by cookie when there is no session header', async () => {
    target = await startTarget()
    const visitor = new Visitor(target)
    const init = await visitor.init()
    const cookie = init.headers.getSetCookie()[0].split(';')[0]
    expect(cookie.startsWith(`${VISITOR_COOKIE}=`)).toBe(true)

    const { stream } = await visitor.stream('remember me')
    const chatId = stream!.events.at(-1)!.chatId

    // Same browser with cookies but no stored session ID (for example cleared localStorage).
    const activation = await fetch(`${target.baseUrl}/public/chat/session`, {
      method: 'POST',
      headers: { Authorization: 'Bearer demo-public-key', Cookie: cookie },
    })
    expect((await activation.json()).existingChat.chatId).toBe(chatId)
  })

  it('ignores cookies naming unknown visitors', async () => {
    target = await startTarget()
    const response = await fetch(`${target.baseUrl}/public/chat/session`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer demo-public-key',
        Cookie: `${VISITOR_COOKIE}=attacker-chosen-id`,
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()[0]).not.toContain('attacker-chosen-id')
  })

  it('uses Secure, SameSite=None and Partitioned cookies when configured for HTTPS', async () => {
    target = await startTarget({ secureCookies: true })
    const init = await new Visitor(target).init()
    expect(init.headers.getSetCookie()[0]).toMatch(/HttpOnly; SameSite=None; Secure; Partitioned$/)
  })
})

describe('command line', () => {
  // Spawns a separate Node.js process, which can be slow to start on a busy machine.
  it(
    'starts with plain node (type stripping) and serves the health check',
    { timeout: 20_000 },
    async () => {
      const cli = fileURLToPath(new URL('../../server/cli.ts', import.meta.url))
      const child = spawn(process.execPath, [cli, '--port', '0', '--quiet'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      try {
        const url = await new Promise<string>((resolve, reject) => {
          let output = ''
          child.stdout.on('data', chunk => {
            output += chunk
            const match = /listening on (http:\/\/\S+)/.exec(output)
            if (match) resolve(match[1])
          })
          child.stderr.on('data', chunk => (output += chunk))
          child.on('exit', code => reject(new Error(`CLI exited (${code}): ${output}`)))
        })
        const health = await fetch(`${url}/healthz`)
        expect(await health.json()).toEqual({ ok: true, protocolVersion: 1 })
      } finally {
        child.kill('SIGTERM')
      }
    },
  )
})
