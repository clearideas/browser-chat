// Fixture scenarios of the test server, over real HTTP. These are what client tests rely on, so
// each scenario's wire behavior is pinned here.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DEFAULT_LIMITS,
  FIXTURE_SCENARIOS,
  HOSTILE_CONTENT,
  SERVER_LANGUAGES,
} from '../../server/index.ts'
import { loadProtocolSchema, validate } from '../conformance/helpers/schema.ts'
import type { ParsedStream } from '../conformance/helpers/sse.ts'
import {
  expectErrorBody,
  startTarget,
  type Target,
  Visitor,
} from '../conformance/helpers/target.ts'

const eventSchema = loadProtocolSchema('stream-events.schema.json')
let target: Target

beforeAll(async () => {
  target = await startTarget()
})

afterAll(async () => {
  await target.close()
})

async function run(content: string): Promise<{ response: Response; stream: ParsedStream | null }> {
  const visitor = new Visitor(target)
  await visitor.init()
  return visitor.stream(content)
}

function contentOf(stream: ParsedStream): string {
  return stream.events
    .filter(event => event.type === 'content')
    .map(event => event.content)
    .join('')
}

function types(stream: ParsedStream): string[] {
  return stream.events.map(event => event.type)
}

function expectSchemaValid(stream: ParsedStream): void {
  for (const event of stream.events) {
    expect(validate(eventSchema, event), JSON.stringify(event)).toEqual([])
  }
}

describe('fixture scenarios', () => {
  it('echoes ordinary messages', async () => {
    const { stream } = await run('Hello *world*')
    expect(contentOf(stream!)).toBe('You said: Hello *world*')
    expect(types(stream!)).toEqual([
      'info',
      ...Array(4).fill('content'),
      'message_finalized',
      'done',
    ])
  })

  it('lists every scenario for /fixture help', async () => {
    const { stream } = await run('/fixture help')
    for (const name of FIXTURE_SCENARIOS) expect(contentOf(stream!)).toContain(`/fixture ${name}`)
  })

  it('reports unknown scenarios instead of failing', async () => {
    const { response, stream } = await run('/fixture no-such-thing')
    expect(response.status).toBe(200)
    expect(contentOf(stream!)).toContain('Unknown fixture "no-such-thing"')
  })

  it('emits thinking and tool call events before content', async () => {
    const { stream } = await run('/fixture thinking-tools pricing')
    expectSchemaValid(stream!)
    expect(types(stream!).slice(0, 4)).toEqual(['info', 'thinking', 'toolCall', 'toolCallComplete'])
    const toolCall = stream!.events.find(event => event.type === 'toolCall')!
    expect(JSON.parse(toolCall.toolCall.function.arguments)).toEqual({ query: 'pricing' })
  })

  it('finalizes with text that differs from the streamed deltas', async () => {
    const { stream } = await run('/fixture final-rewrite')
    expect(contentOf(stream!)).toBe('Draft text that will be replaced.')
    const done = stream!.events.at(-1)!
    expect(done.message.content).toBe('Final text from message_finalized.')
  })

  it('sends keep-alive comments between events', async () => {
    const { stream } = await run('/fixture keepalive')
    expect(stream!.violations).toEqual([])
    expect(stream!.comments.length).toBeGreaterThan(0)
    expect(contentOf(stream!)).toBe('Reply with keep-alive comments in between.')
  })

  it('reassembles frames that arrive split across network chunks', async () => {
    // How the pieces are grouped into network reads depends on timing; the writer's splitting
    // itself is checked deterministically in server.test.ts (EventStreamWriter).
    const { stream } = await run('/fixture split-frames')
    expect(stream!.violations).toEqual([])
    expect(contentOf(stream!)).toBe(
      'Split frames with multi-byte text: café, 日本語, emoji 🎉 done.',
    )
  })

  it.each(['compact', 'multiline', 'crlf', 'fields'])(
    'frames events as valid "%s" Server-Sent Events',
    async format => {
      const { stream } = await run(`/fixture sse-${format}`)
      expect(stream!.violations).toEqual([])
      expectSchemaValid(stream!)
      expect(contentOf(stream!)).toBe(`Framed as ${format}: line one\nline two.`)
      expect(stream!.events.at(-1)!.type).toBe('done')
    },
  )

  it('sends consecutive data lines without blank lines for sse-no-blank-lines', async () => {
    const { stream } = await run('/fixture sse-no-blank-lines')
    // Not valid SSE for separate events; conformance flags it. (Widget 0.1.x accepted it.)
    expect(stream!.violations.length).toBeGreaterThan(0)
  })

  it('fails with 502 and an error body before streaming', async () => {
    const { response } = await run('/fixture error-before-stream')
    expect(response.status).toBe(502)
    expect((await expectErrorBody(response)).message).toBe(
      'The assistant is temporarily unavailable.',
    )
  })

  it('fails with 429 and Retry-After', async () => {
    const { response } = await run('/fixture rate-limited')
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('30')
    await expectErrorBody(response)
  })

  it('ends with an error event after partial content', async () => {
    const { stream } = await run('/fixture error-mid-stream')
    expectSchemaValid(stream!)
    const last = stream!.events.at(-1)!
    expect(last).toEqual({
      type: 'error',
      error: 'The assistant stopped unexpectedly.',
      statusCode: 502,
    })
    expect(types(stream!)).not.toContain('done')
  })

  it('ends cleanly without done or error', async () => {
    const { stream } = await run('/fixture end-without-done')
    expect(stream!.violations).toEqual([])
    expect(contentOf(stream!)).toBe('Partial answer, then a clean end of stream.')
    expect(types(stream!)).not.toContain('done')
  })

  it('drops the connection without done or error', async () => {
    const { stream } = await run('/fixture disconnect')
    expect(contentOf(stream!)).toBe('Partial answer before the connection drops.')
    expect(types(stream!)).not.toContain('done')
    expect(types(stream!)).not.toContain('error')
  })

  it('streams a long reply', async () => {
    const { stream } = await run('/fixture long')
    expect(stream!.events.filter(event => event.type === 'content').length).toBeGreaterThan(300)
  })

  it.each(Object.keys(HOSTILE_CONTENT))('delivers hostile content verbatim: %s', async name => {
    const { stream } = await run(`/fixture ${name}`)
    expect(contentOf(stream!)).toBe(HOSTILE_CONTENT[name as keyof typeof HOSTILE_CONTENT])
    expect(stream!.events.at(-1)!.message.content).toBe(
      HOSTILE_CONTENT[name as keyof typeof HOSTILE_CONTENT],
    )
  })

  it('combines every hostile payload in xss-all', async () => {
    const { stream } = await run('/fixture xss-all')
    for (const payload of Object.values(HOSTILE_CONTENT)) {
      expect(contentOf(stream!)).toContain(payload)
    }
  })
})

describe('fixture sites', () => {
  it('serves hostile configuration from the adversarial site', async () => {
    const response = await new Visitor(target, { accessKey: 'adversarial-public-key' }).init()
    expect(response.status).toBe(200)
    const init = await response.json()
    expect(init.iconUrl).toContain("onerror='window.__ciXss")
    expect(init.links[0].url).toMatch(/^javascript:/)
    expect(init.chatName).toContain('<img')
    expect(init.style.color).toContain('url(')
  })

  it('refuses every request for a disabled site with 403', async () => {
    const visitor = new Visitor(target, { accessKey: 'disabled-public-key' })
    const init = await visitor.init()
    expect(init.status).toBe(403)
    expect((await expectErrorBody(init)).message).toBe('Public chat disabled for site')
  })
})

describe('localization', () => {
  const initIn = async (language: string) => (await new Visitor(target, { language }).init()).json()

  // Visitor-facing init fields of the demo site.
  const visibleText = (init: any) => [
    init.initialMessage,
    init.chatTagline,
    init.heroGreeting,
    init.disclaimerText,
    init.links[0].title,
    init.links[0].description,
  ]

  it.each(SERVER_LANGUAGES.filter(language => language !== 'en'))(
    'translates every visitor-facing init field into %s',
    async language => {
      const english = visibleText(await initIn('en'))
      const translated = visibleText(await initIn(language))
      translated.forEach((text, index) => {
        expect(typeof text).toBe('string')
        expect(text, `field ${index}`).not.toBe(english[index])
      })
    },
  )

  it.each([
    ['fr-CA', 'fr'],
    ['zh-TW', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['sv, de;q=0.8', 'de'],
    ['de;q=0.1, fr;q=0.9', 'fr'],
    ['sv', 'en'],
    ['*', 'en'],
    ['', 'en'],
  ])('matches Accept-Language %j to %s', async (header, expected) => {
    const init = await initIn(header)
    expect(init.chatTagline).toBe((await initIn(expected)).chatTagline)
  })

  it('greets and echoes in the visitor language', async () => {
    expect((await initIn('fr-CA')).initialMessage).toMatch(/^Bonjour, je suis Ada/)
    expect((await initIn('sv')).initialMessage).toMatch(/^Hi, I'm Ada/)

    const visitor = new Visitor(target, { language: 'de' })
    await visitor.init()
    const { stream } = await visitor.stream('Hallo')
    expect(contentOf(stream!)).toBe('Sie sagten: Hallo')
  })

  it('sends visitor-facing errors in the visitor language', async () => {
    const visitor = new Visitor(target, { language: 'es' })
    await visitor.init()
    const before = await visitor.stream('/fixture error-before-stream')
    expect((await expectErrorBody(before.response)).message).toBe(
      'El asistente no está disponible temporalmente.',
    )
    const mid = await visitor.stream('/fixture error-mid-stream')
    expect(mid.stream!.events.at(-1)).toMatchObject({
      type: 'error',
      error: 'El asistente se detuvo inesperadamente.',
    })
    const tooLong = await visitor.stream('x'.repeat(DEFAULT_LIMITS.maxMessageLength + 1))
    expect(tooLong.response.status).toBe(400)
    expect((await expectErrorBody(tooLong.response)).message).toMatch(
      /^Tu mensaje es demasiado largo\. El límite es de [\d.,\s]+ caracteres\.$/,
    )
  })
})

describe('user IDs', () => {
  it('gives the decoded user ID to the provider (whoami fixture)', async () => {
    const visitor = new Visitor(target, { userId: 'zoë@example.com' })
    await visitor.init()
    const { stream } = await visitor.stream('/fixture whoami')
    expect(contentOf(stream!)).toBe('User ID: `zoë@example.com` (unverified)')

    const anonymous = new Visitor(target)
    await anonymous.init()
    expect(contentOf((await anonymous.stream('/fixture whoami')).stream!)).toBe(
      'No user ID was sent.',
    )
  })

  it.each([
    ['malformed percent-encoding', '%E0%A4%A'],
    ['more than 256 characters', 'x'.repeat(257)],
  ])('rejects a user ID with %s', async (_, value) => {
    const visitor = new Visitor(target)
    const response = await visitor.request('/public/chat/init', {
      headers: { 'x-clearideas-public-chat-user-id': value },
    })
    expect(response.status).toBe(400)
    expect((await expectErrorBody(response)).message).toBe('Invalid user ID')
  })
})
