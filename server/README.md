# Test server

A small implementation of the [Public Chat Protocol v1](../docs/protocol/README.md) for tests and
local development. It returns **canned replies** and never calls an AI service, so it needs no API
keys and works offline.

It is also a readable reference for building a real server: every protocol rule (CORS, sessions,
consent, chat ownership, streaming framing, errors, rate limits) is implemented in plain Node.js
with no dependencies. [`provider.ts`](provider.ts) marks where a real server calls an AI API.

> **Not for production.** Storage is in memory, rate limits are per process, and replies are
> fixtures. See [Building a real server](#building-a-real-server).

## Running it

Requires Node.js 22.18+ (runs TypeScript directly).

```sh
npm run dev      # rebuilds the widget, serves the pages and runs this server
npm run server   # only this server, on http://127.0.0.1:8787
```

With `npm run dev`, open <http://127.0.0.1:8000/> (or the address it prints, if a port was taken)
and follow the links, or go straight to
<http://127.0.0.1:8000/dev.html>. That page loads the built widget and points it at the test
server. Query parameters: `key` (access key), `api` (server URL), `lang` (`en` or `fr`).

Options (flags or environment variables):

| Flag                    | Environment           | Default                             | Meaning                                                            |
| ----------------------- | --------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `--port`                | `PORT`                | `8787`                              | Port (0 picks a free port)                                         |
| `--host`                | `HOST`                | `127.0.0.1`                         | Interface to bind                                                  |
| `--origins`             | `ALLOWED_ORIGINS`     | `http://localhost,http://127.0.0.1` | Comma-separated origin allowlist (loopback entries match any port) |
| `--chunk-delay`         | `CHUNK_DELAY_MS`      | `30`                                | Milliseconds between streamed chunks                               |
| `--messages-per-minute` | `MESSAGES_PER_MINUTE` | `30`                                | Messages allowed per site and IP address each minute               |
| `--secure-cookies`      |                       | off                                 | `Secure; SameSite=None; Partitioned` cookies (needs HTTPS)         |
| `--quiet`               |                       | off                                 | No request log                                                     |

`GET /healthz` returns `{"ok": true, "protocolVersion": 1}` and may be read from any origin (it
carries no credentials); the index page uses it to show whether the server is running.

## Sites and access keys

| Access key                  | Site                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo-public-key`           | Normal site. Its assistant is called Ada, and its visitor-facing text is translated into every built-in widget language.                                               |
| `adversarial-public-key`    | Hostile configuration: script in `chatName`, `iconUrl`, links, colors, disclaimers and the greeting. Tests use it to prove the widget treats server data as untrusted. |
| `disabled-public-key`       | Chat disabled; every request gets `403`.                                                                                                                               |
| `voice-public-key`          | The demo site with voice: realtime voice over the WebSocket relay, and recorded voice.                                                                                 |
| `recorded-voice-public-key` | The demo site with recorded voice only: realtime voice answers `403`, so the widget records instead.                                                                   |

## Languages

The server answers in the visitor's language, taken from `Accept-Language` and matched like the
widget matches it (protocol README §3.4): the demo site's configuration (greeting, tagline,
headline, link, disclaimer), the echo (`You said: …`) and the error messages visitors can see
(rate limited, assistant unavailable or stopped, message too long, conversation not found). Site
fields accept a string or strings by language (`Localized` in [`i18n.ts`](i18n.ts)); a reply
provider receives the matched language as `request.language`.

The fixture list, sample replies (`markdown`, `citations`, …) and the adversarial site are
developer tools and stay in English.

## Signed-in users

The server reads `x-clearideas-public-chat-user-id` (protocol README §5.5), answers `400` for a
malformed or over-long value, stores it with each chat and passes it to reply providers as
`request.userId`. Chats are scoped to it: a chat started by one user ID is not restored or
continued for another, or for no user ID, even in the same browser session. `/fixture whoami`
shows what arrived.

## Voice

The server does not recognize or synthesize speech; voice replies are canned, so the widget's
voice code can be tested without an AI service.

- **Recorded voice** (`POST /public/chat/voice/stream` and the other voice endpoints, protocol
  README §6.3): the transcript is "Voice message (N KB)" and the reply is a fixed sentence, both
  in the visitor's language. The reply audio is [`fixtures/voice-reply.webm`](fixtures/voice-reply.webm),
  a 1.4-second WebM/Opus tone, streamed as an initialization segment and one `audioChunk` per
  cluster ([`webm.ts`](webm.ts)), then as `audio` and in `done`. Regenerate it with
  `node scripts/generate-voice-fixture.mjs`.
- **Realtime voice** (`POST /public/chat/realtime/session`, §12.1): returns the WebSocket relay
  transport with a one-time token in `websocketPath` (valid for a minute, checked against the
  site's origins). The relay ([`realtime.ts`](realtime.ts)) speaks the greeting in a new chat, then
  treats every 2 seconds of microphone audio as one spoken message: it sends the transcript
  "Spoken message N", a spoken reply (transcript deltas and a PCM16 tone) and
  `clearideas.chat.updated`, and saves both to the chat, which text chat can then continue.
  WebRTC is not implemented.

`--chunk-delay` also paces voice replies. Voice uploads may be up to 8 MB (`maxVoiceBodyBytes`).

## Reply fixtures

Any message is echoed back (`You said: …`, in the visitor's language). A message of the form
`/fixture <name>` selects a scenario instead; `/fixture help` lists them.

| Fixture                                                          | Behavior                                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `echo <text>`                                                    | Echo (the default)                                                                                 |
| `markdown`                                                       | Headings, lists, code, quote, table                                                                |
| `citations`                                                      | Citation links, a `<WebSource>`, a `<chunkId>` marker, a file citation                             |
| `long`                                                           | About 400 chunks                                                                                   |
| `slow`                                                           | Ten chunks, 300 ms apart                                                                           |
| `thinking-tools`                                                 | `thinking`, `toolCall` and `toolCallComplete` events before the answer                             |
| `final-rewrite`                                                  | `message_finalized` differs from the streamed text                                                 |
| `keepalive`                                                      | SSE comment lines between events                                                                   |
| `split-frames`                                                   | Each event split across network chunks, including inside multi-byte characters                     |
| `error-before-stream`                                            | `502` with an error body                                                                           |
| `rate-limited`                                                   | `429` with `Retry-After: 30`                                                                       |
| `error-mid-stream`                                               | Partial text, then an `error` event                                                                |
| `end-without-done`                                               | Partial text, then a clean end of stream without `done`                                            |
| `disconnect`                                                     | Partial text, then the connection drops                                                            |
| `whoami`                                                         | Replies with the user ID the widget sent (`userId`), or that none was sent                         |
| `stall`                                                          | Accepts the message, then sends nothing (no headers, no keep-alives) until the visitor disconnects |
| `stall-mid-stream`                                               | Partial text, then silence until the visitor disconnects                                           |
| `xss-tooltip`, `xss-links`, `xss-html`, `exfil-image`, `xss-all` | Hostile Markdown/HTML (see below)                                                                  |

### Hostile content

The `xss-*` fixtures and the adversarial site carry payloads that try to run script, open
`javascript:`/`data:` URLs, inject forms and overlays, or load tracking images. Each script payload
tries to set `window.__ciXss` to a label naming the injection point, so a test can assert that
`window.__ciXss` stays `undefined`. `dev.html` shows a red banner if any payload runs.

These payloads are sent verbatim on purpose: the protocol treats server content as untrusted
(protocol README §7.1), and the widget must render all of it inertly.

## Using it from code

```ts
import { createChatServer, FixtureProvider } from './server/index.ts'

const server = createChatServer({
  provider: new FixtureProvider({ chunkDelayMs: 0 }),
  rateLimits: { messagesPerWindow: 100 },
})
const url = await server.listen(0) // random free port
// ... point the widget or fetch at `url` ...
await server.close()
```

Options: `sites`, `provider`, `limits` (`maxBodyBytes`, `maxMessageLength`,
`maxHistoryMessages`), `rateLimits` (`windowMs`, `messagesPerWindow`, `authFailuresPerWindow`),
`storeLimits`, `secureCookies`, `allowRequestsWithoutOrigin`, and `log`.

## Tests

| Command                    | What it runs                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `npm run test:server`      | Conformance suite plus this server's own tests (`tests/conformance`, `tests/server`) |
| `npm run test:conformance` | Only the conformance suite                                                           |
| `npm run test:live`        | The real widget component against this server in jsdom (`tests/live`)                |
| `npm run test:e2e`         | The built widget in a real browser against this server (`tests/e2e`)                 |

The conformance suite can check any server:

```sh
CHAT_SERVER_URL=https://api.example.com \
CHAT_ACCESS_KEY=<public widget key> \
CHAT_ORIGIN=https://www.example.com \
npm run test:conformance
```

## Files

| File                  | Contents                                                    |
| --------------------- | ----------------------------------------------------------- |
| `index.ts`            | `createChatServer()` and exports                            |
| `cli.ts`              | Command-line entry point                                    |
| `app.ts`              | Routing, authentication, origin checks, sessions, streaming |
| `http.ts`             | CORS, cookies, body limits, error responses                 |
| `store.ts`            | In-memory visitors, sessions and chats                      |
| `rate-limit.ts`       | Fixed-window rate limiter                                   |
| `provider.ts`         | `ChatProvider` interface and where real AI calls go         |
| `fixture-provider.ts` | Canned reply scenarios                                      |
| `sites.ts`            | Site configuration and origin matching                      |
| `i18n.ts`             | Language matching and visitor-facing messages               |
| `realtime.ts`         | Realtime voice relay: tokens and the canned conversation    |
| `websocket.ts`        | Minimal WebSocket server connection (RFC 6455)              |
| `voice-audio.ts`      | Reply audio: the WebM fixture and a PCM16 tone              |
| `webm.ts`             | Splits WebM into an initialization segment and clusters     |
| `fixtures/`           | `voice-reply.webm`, the recorded-voice reply audio          |

## Building a real server

Keep the protocol behavior and replace the parts that are test-only:

1. **Replies:** implement `ChatProvider` (see the example in [`provider.ts`](provider.ts)). The AI
   provider key stays in the server environment; the browser only ever has the public widget key.
   The server owns the model choice, system prompt, tools and output limits.
2. **Storage:** replace `MemoryStore` with a database. Keep session IDs unguessable and keep chats
   scoped to site and visitor.
3. **Rate limits and spending:** move rate limiting to a shared store if you run several
   instances, and add per-site spending limits.
4. **Deployment:** serve over HTTPS, enable `secureCookies`, and derive the client IP from a trusted
   proxy header if you sit behind a load balancer (`clientIp()` in `http.ts`).
5. **Site configuration:** validate URLs (`http:`/`https:` only) and colors before returning them
   from `/init`.
6. **Logging:** log request metadata, not message content, unless your privacy policy covers it.
7. **Slow replies:** models can take a while to produce their first words. Send keep-alive
   comments (`: keep-alive`) at least every 30 seconds until they do, and start the stream within
   30 seconds, or clients give up (protocol README §6.1). This server does neither, because its
   canned replies start at once; it waits for the first reply event so early failures become HTTP
   errors.
8. **Voice:** for recorded voice, transcribe the upload and synthesize the reply as WebM/Opus
   (stream it as an initialization segment and clusters). For realtime voice, either return
   the provider's WebRTC answer, or relay a WebSocket: issue an unguessable one-time token in
   `websocketPath` (browsers cannot send `Authorization` on WebSockets), check the `Origin` on
   the upgrade, keep the provider key on the server, and save completed transcripts to the chat.
   Replace `websocket.ts` with a maintained WebSocket library.
9. **Languages:** return configuration and error messages in the request's language, and pass
   the language to your model (for example in the system prompt) so replies match the widget.

Then run the conformance suite against your server.
