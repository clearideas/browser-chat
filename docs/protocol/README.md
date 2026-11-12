# Public Chat Protocol — Version 1

This directory is the contract between the browser widget and any chat server. A server that
implements it can be used with the widget, whether it is the Clear Ideas API or your own backend.

| File                                                     | Purpose                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `README.md` (this file)                                  | Normative rules: transport, identity, streaming, content, errors, security. |
| [`openapi.yaml`](openapi.yaml)                           | Machine-readable HTTP endpoint definitions (OpenAPI 3.1).                   |
| [`stream-events.schema.json`](stream-events.schema.json) | JSON Schema for every Server-Sent Event payload.                            |

A minimal server implementing this contract with canned responses lives in [`/server`](../../server/README.md).
The conformance tests in `tests/conformance` can run against that server or against any other
implementation.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as described in
RFC 2119.

## 1. Versioning

- This document describes **protocol version 1**. It records the wire format used by the Clear Ideas
  API and widget `0.1.x`, including its quirks (see [§11](#11-known-v1-quirks)).
- Servers SHOULD return `"protocolVersion": 1` in the `GET /public/chat/init` response. Clients MUST
  treat a missing `protocolVersion` as `1`.
- Within version 1, changes are additive only: new optional response fields, new optional request
  fields, new endpoints, and new stream event types. Clients MUST ignore unknown response fields and
  unknown stream event types. Servers MUST ignore unknown request fields.
- Any change that would break a version 1 client or server requires protocol version 2.

## 2. Conformance profiles

A server declares what it supports through the `/init` response. Only the **core** profile is required.

| Profile            | Endpoints                                                                                                                                                     | Required | Advertised by                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| Core text chat     | `GET /public/chat/init`, `POST /public/chat/session`, `POST /public/chat/stream`, `POST /public/chat/{chatId}/stream`                                         | Yes      | Always                                                |
| Non-streaming text | `POST /public/chat`, `POST /public/chat/{chatId}`                                                                                                             | No       | Not advertised (the widget does not use them)         |
| Recorded voice     | `POST /public/chat/voice/stream`, `POST /public/chat/voice/{chatId}/stream` (and non-streaming `POST /public/chat/voice`, `POST /public/chat/voice/{chatId}`) | No       | `voiceEnabled: true`                                  |
| Realtime voice     | `POST /public/chat/realtime/session` plus a WebRTC or WebSocket media session                                                                                 | No       | `voiceEnabled: true` (see [§11](#11-known-v1-quirks)) |

A server that does not implement an optional profile MUST NOT advertise it and SHOULD answer its
endpoints with `403` and an [error body](#8-errors) (for example `{"message":"Voice chat disabled for site"}`).

## 3. Transport

- All paths are relative to the **API base URL** configured in the widget (`apiBaseUrl`, for example
  `https://api.example.com`). Clients remove trailing slashes from the base URL before appending paths.
- Production servers MUST use HTTPS.
- Request and response bodies are JSON (`application/json; charset=utf-8`) except streaming responses,
  which are `text/event-stream` ([§6](#6-streaming)).
- `chatId` values are opaque strings chosen by the server. Servers SHOULD use URL-safe characters.
  Clients SHOULD percent-encode them when building paths.

### 3.1 Request headers

| Header                                    | Sent on                                         | Value                                                                                                |
| ----------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Authorization`                           | every request                                   | `Bearer <accessKey>` ([§4](#4-site-identification))                                                  |
| `Accept-Language`                         | init, session, stream, voice, realtime          | The widget's language as one BCP 47 tag, for example `fr`, `pt` or `zh-Hant` ([§3.4](#34-language)). |
| `x-clearideas-public-chat-consent-status` | init, session                                   | `granted`, `not-required` or `pending` ([§5.3](#53-consent))                                         |
| `x-clearideas-public-chat-session`        | every request, when the client has a session ID | Session ID previously issued by the server ([§5](#5-visitor-identity-and-sessions))                  |
| `x-clearideas-public-chat-user-id`        | every request, when the site set a user ID      | The site's ID for the signed-in user, percent-encoded UTF-8 ([§5.5](#55-signed-in-users))            |
| `Content-Type`                            | requests with a body                            | `application/json`                                                                                   |
| `Accept`                                  | streaming requests                              | `text/event-stream`                                                                                  |

### 3.2 Response headers

| Header                                                                     | Sent on                  | Meaning                                                                                 |
| -------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `x-clearideas-public-chat-session-id`                                      | init, session            | Session ID the client MUST store and send back ([§5](#5-visitor-identity-and-sessions)) |
| `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | any, SHOULD on `429`     | Rate limiting ([§9](#9-rate-limiting))                                                  |
| `Cache-Control: no-store`                                                  | SHOULD on every response | Responses are visitor-specific                                                          |

### 3.3 CORS

The widget runs on third-party pages and calls the API cross-origin, usually with
`credentials: 'include'`. A server MUST therefore:

1. Answer `OPTIONS` preflight requests with `204` and:
   - `Access-Control-Allow-Origin: <the request Origin>`. The wildcard `*` MUST NOT be used because
     requests carry credentials.
   - `Access-Control-Allow-Credentials: true`
   - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
   - `Access-Control-Allow-Headers` including at least `Authorization, Content-Type, Accept,
Accept-Language, x-clearideas-public-chat-session, x-clearideas-public-chat-consent-status,
x-clearideas-public-chat-user-id`
   - `Vary: Origin`
   - `Access-Control-Max-Age` SHOULD be set (for example `600`).
2. Include `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true` and `Vary: Origin`
   on every actual response, including error and streaming responses, for allowed origins.
3. Include `Access-Control-Expose-Headers: x-clearideas-public-chat-session-id, Retry-After,
RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset`. Without it, the browser hides the session
   ID from the widget.
4. Enforce the site's origin allowlist on actual requests (after the access key identifies the site).
   Preflight requests carry no `Authorization` header, so servers MAY answer preflight for any origin
   that appears in any site's allowlist (or any origin) and MUST enforce the per-site allowlist on the
   actual request. A disallowed origin gets `403` without CORS headers.

Origin checks stop other websites from using a site's access key in browsers. They are not
authentication: non-browser clients can send any `Origin`. Requests without an `Origin` header come
from non-browser clients; servers MAY accept or reject them.

### 3.4 Language

The widget sends its language in `Accept-Language`: one of its built-in locales (`en`, `fr`, `es`,
`de`, `it`, `pt`, `nl`, `pl`, `ja`, `ko`, `zh-Hans`, `zh-Hant`, `ar`) or a locale the site added
with custom strings. Servers MAY localize everything a visitor reads: the init configuration
(`initialMessage`, `chatName`, `chatTagline`, `heroGreeting`, link titles and descriptions,
disclaimers, `helloBubbleText`), replies, and error `message`s ([§8](#8-errors)). A server that
localizes SHOULD match the header as the widget does: by language, falling back from a regional tag
to its language (`fr-CA` to `fr`) and to a default language. `zh-TW`, `zh-HK` and `zh-MO` are
Traditional Chinese.

The widget caches the init response per language. When its language changes it requests the init
response again and starts a new conversation with a new session.

## 4. Site identification

- Every request carries `Authorization: Bearer <accessKey>`.
- The access key is a **public site identifier**. It is embedded in web pages and visible to every
  visitor. It MUST NOT grant anything beyond this public chat API for its site, and it MUST NOT be an
  AI provider key or an administrative credential.
- Servers MUST reject a missing or unknown key with `401`, and a key whose site has chat disabled with
  `403`.
- AI provider keys stay on the server. The browser never talks to an AI provider with a secret.

## 5. Visitor identity and sessions

Visitors are anonymous. A server identifies a returning visitor by, in order of precedence:

1. A first-party **cookie** set by the server (for example `ci_public_chat_user_id`). The cookie name is
   the server's choice; clients never read it.
2. The **session header** `x-clearideas-public-chat-session`, used when cookies are blocked or consent
   has not been granted.

### 5.1 Session IDs

- `GET /public/chat/init` and `POST /public/chat/session` MAY return a session ID in the
  `x-clearideas-public-chat-session-id` response header. Servers SHOULD return one from `/init`
  whenever the request did not carry a valid session ID.
- Clients MUST store the most recently received session ID and send it in
  `x-clearideas-public-chat-session` on every later request, including the next page load.
- Session IDs MUST be unguessable (at least 122 bits of randomness, for example a random UUID) because
  they grant access to the visitor's chat history.
- An unknown or expired session ID in a request MUST NOT cause an error. The server treats the visitor
  as new and SHOULD issue a new session ID on `/init` or `/session`.

### 5.2 Cookies

- Cookies MUST be `HttpOnly`, `Secure` and `SameSite=None` (the API is a third party to the host
  page). They SHOULD also be `Partitioned` so they keep working where third-party cookies are blocked.
- A server MUST NOT set a persistent identity cookie when the request's consent status is `pending`.

### 5.3 Consent

The widget reports the host page's consent state in `x-clearideas-public-chat-consent-status`:

| Value          | Widget behavior                                                | Server expectation                                                                   |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `not-required` | Sends credentials; stores session ID in `localStorage`.        | Cookies allowed.                                                                     |
| `granted`      | Sends credentials; stores session ID in `localStorage`.        | Cookies allowed.                                                                     |
| `pending`      | Omits credentials; stores session ID in `sessionStorage` only. | MUST NOT set persistent cookies. SHOULD keep only what is needed to run the session. |

### 5.4 Chats

- A chat belongs to one site and one visitor. A server MUST return `404` for a `chatId` that does not
  exist **or** belongs to another site or visitor. It MUST NOT reveal which of the two applies.
- `POST /public/chat/session` returns the visitor's most recent chat as `existingChat`, if any, so the
  widget can restore it.

### 5.5 Signed-in users

A site where visitors sign in can give the widget its own ID for the user (the widget's `userId`).
The client then sends it on every request in `x-clearideas-public-chat-user-id`, percent-encoded
as UTF-8 (header values must be ASCII), at most 256 characters before encoding.

- Servers MUST allow the header in CORS (§3.3) and MAY record it, for example to attribute usage
  to users.
- The ID is **not verified**: the page's script sets it, and anyone can send any value. Servers
  MUST NOT grant access or reveal data based on it.
- A chat belongs to the user ID it was started with: servers MUST NOT return a chat started with
  one user ID (or none) to a request with a different user ID (or none), also within one session
  or visitor cookie. People sharing a browser then do not see each other's conversations; the
  client likewise keeps sessions per user ID.
- Servers SHOULD reject a value that is not valid percent-encoded UTF-8 or is too long with `400`,
  rather than ignore it.

## 6. Streaming

Streaming endpoints answer `200` with `Content-Type: text/event-stream` and send JSON events defined
in [`stream-events.schema.json`](stream-events.schema.json).

### 6.1 Framing

Streams follow the Server-Sent Events format (WHATWG HTML, "Server-sent events").

Servers SHOULD send each event as **one line**, `data: ` followed by single-line JSON, then a blank
line: `data: {"type":"content","content":"Hi"}\n\n`. Servers SHOULD flush each event and disable
proxy buffering (for example `X-Accel-Buffering: no`). Comment lines (starting with `:`) MAY be sent
as keep-alives.

A client cannot tell a slow reply from a stalled one, so it MAY give up after a period without any
data. The reference widget gives up after 120 seconds without a response or stream data (its
`replyTimeoutMs` option). Servers SHOULD therefore send a comment line at least every 30 seconds
while the model has produced nothing yet or is running tools, and SHOULD start the stream (send the
response headers) within 30 seconds, even if that means reporting a later failure as an `error`
event ([§6.4](#64-errors-before-the-stream-starts)) instead of an HTTP status.

Clients MUST parse the stream per the SSE standard:

- `data:` with or without the single optional space after the colon;
- multi-line data: consecutive `data:` lines of one event are joined with `\n`;
- LF, CRLF or CR line endings;
- comments, and the `event:`, `id:` and `retry:` fields (this protocol does not use them; they MUST
  NOT change how the data is handled).

Each event's data is a JSON object defined in `stream-events.schema.json`.

Widget `0.1.x` accepted only the one-line `data: ` form, so servers that must support it should send
exactly that. That widget also treated consecutive `data:` lines without blank lines between them as
separate events; later widgets still accept this (each line is parsed separately when the joined
data is not JSON), but it is not valid SSE for separate events and servers SHOULD NOT rely on it.

### 6.2 Text chat event sequence

```
info → (content | thinking | toolCall | toolCallComplete)* → message_finalized → done
```

- `info` SHOULD be the first event. It carries the chat ID (`chatId`, or `id` in older servers) and
  whether the chat is new.
- `content` events carry text deltas. The client concatenates them in order.
- `message_finalized` carries the complete assistant message. The client replaces the streamed text
  with it, so the server can send a cleaned-up final version (for example with citations resolved).
- `done` MUST be the last event of a successful stream and MUST include `chatId`.
- On failure after the stream has started, the server sends an `error` event and closes the stream.
  The client discards the partial assistant message and shows `error`.
- If the stream ends cleanly without `done` or `error`, the client keeps the text received so far.
  If the connection fails mid-stream (network error), the client discards the partial message and
  shows an error.
- When the client disconnects (for example the visitor stops the reply or starts a new chat), the
  server SHOULD stop generating and SHOULD NOT bill further tokens. The visitor's message stays in
  the chat; a reply cut short SHOULD NOT be stored as complete.
- A visitor can stop a reply: the client disconnects, keeps the text received so far and shows no
  error. If the client gives up because no data arrived (§6.1), it discards the partial message,
  keeps the visitor's message (the server may have stored it) and shows an error.

### 6.3 Voice event sequence (optional profile)

```
info → transcript → (content | thinking | toolCall | toolCallComplete)* → message_finalized
     → audioChunk* → audio → done
```

`transcript` carries the recognized user speech. `audioChunk` events carry WebM/Opus fragments; the
first has `isInitSegment: true`. `audio` carries the complete audio. `done` carries `transcript`,
`response` and `audio`.

### 6.4 Errors before the stream starts

Validation, authentication, rate-limit and upstream failures detected before the first event MUST be
reported with a non-2xx status and an [error body](#8-errors), not as a `200` stream.

## 7. Message content

Assistant message content (`content` deltas, `message_finalized`, `done.message`,
`existingChat.messages`, `initialMessage`) is **Markdown**. Version 1 recognizes these extensions:

| Syntax                                              | Meaning                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `[label](https://…){data-original-url="https://…"}` | Source citation. The attribute block after the link carries the original source URL. |
| `<WebSource data-url="https://…">Title</WebSource>` | Web search citation; the widget converts it to a link.                               |
| `<chunkId>…</chunkId>`                              | Internal retrieval marker; the widget removes it and its contents.                   |
| Links to `…/site/{siteId}/file/{fileId}`            | Clear Ideas file citation, shown as a source chip.                                   |

### 7.1 Content is untrusted

Model output can be influenced by prompt injection (from visitor input or retrieved documents), so:

- Clients MUST treat every server-supplied string (messages, `chatName`, `initialMessage`, `links`,
  `iconUrl`, `style.color`, disclaimers, bubble text, error messages) as **untrusted**. Strings are
  rendered as text; Markdown is rendered to a restricted, sanitized subset; URLs are opened only when
  their scheme is `http:` or `https:`.
- Servers SHOULD NOT emit raw HTML in message content. Clients MAY render raw HTML as text.
- Servers SHOULD validate configuration values before returning them: `links[].url` and `iconUrl` are
  absolute `https:` (or `http:`) URLs, and `style.color` is a CSS hex (`#rgb`/`#rrggbb`) or `rgb()` color.

### 7.2 How the reference widget renders content

Other clients need not copy this, but servers can rely on it when formatting replies:

- Markdown is rendered to elements directly (never through an HTML string). Supported: paragraphs,
  headings, emphasis, strikethrough, code spans and fenced code, blockquotes, nested lists, tables,
  thematic breaks, links, autolinks, and `<br>` as a line break.
- Raw HTML is shown as text. Images are shown as links and never loaded.
- Links become clickable only for absolute `http:`, `https:` and `mailto:` URLs, and open in a new
  tab with `rel="noopener noreferrer"`. Other links (including relative URLs) are shown as text.
- Citations (`data-original-url`) link to the original URL when it is http(s), otherwise to the
  link destination, otherwise they are shown as text.
- Visitor messages are shown as plain text.
- Configuration values that fail the checks above are ignored (the widget falls back to defaults).

## 8. Errors

Non-2xx responses SHOULD have this JSON body:

```json
{ "message": "Human-readable summary", "details": "optional extra information" }
```

The widget shows `message` to the visitor, so it MUST NOT contain secrets, stack traces, or provider
error text. It SHOULD be in the request's language ([§3.4](#34-language)). When a response has no
`message`, the widget shows its own localized message instead of HTTP details.

| Status      | Use                                                                        |
| ----------- | -------------------------------------------------------------------------- |
| `400`       | Invalid JSON or validation failure (for example empty or overlong message) |
| `401`       | Missing or invalid access key                                              |
| `403`       | Site disabled, origin not allowed, or optional profile not enabled         |
| `404`       | Unknown route, or chat not found for this site and visitor                 |
| `413`       | Request body too large                                                     |
| `429`       | Rate limited ([§9](#9-rate-limiting))                                      |
| `500`       | Unexpected server error                                                    |
| `502`/`503` | Upstream AI provider failure or overload                                   |

## 9. Rate limiting

Public chat endpoints are anonymous and each message costs money, so servers SHOULD rate limit
message-sending endpoints (for example per site and client IP), and SHOULD separately limit repeated
authentication failures per IP. Limited requests get `429` with `Retry-After` (seconds). Servers
SHOULD also send `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.

## 10. Server security requirements

In addition to the rules above, a production server:

- MUST keep AI provider keys, system prompts and tool definitions server-side. The widget never
  chooses them.
- MUST ignore, or check against an allowlist, the optional client-supplied `message.aiModel`.
- MUST cap request body size, message length, and the conversation history sent to the model.
- MUST bound model output (maximum tokens) and request duration.
- MUST treat tool calls requested by the model as untrusted input.
- For realtime voice: the browser holds a direct media/event channel. The server MUST enforce
  instructions, tools and session duration server-side (for example through a provider sideband
  connection), because the browser can send arbitrary provider events on that channel.

## 11. Known v1 quirks

These behaviors are part of version 1 and are kept for compatibility. They are candidates for a
future version.

1. Header names carry a `x-clearideas-` prefix even on non-Clear-Ideas servers.
2. There is no separate capability flag for realtime voice. With `voiceEnabled: true`, the widget tries
   realtime voice first when the browser supports it. A server with recorded voice only SHOULD answer
   `POST /public/chat/realtime/session` with `403`: the widget then records instead. After other
   realtime failures the widget offers recorded voice.
3. The consent status header is sent only to `/init` and `/session`.
4. Widget `0.1.x` sent `format: "webm"` for recorded voice even when the browser recorded MP4
   (Safari). Later widgets send `"m4a"` in that case; servers should accept both.
5. `/init` responses from some servers include `existingChat`. Version 1 clients ignore it and use
   `POST /public/chat/session`.
6. The non-streaming `POST /public/chat` response lists the greeting and the assistant reply, but not
   the visitor's message.
7. `info` and `done` events may carry the chat ID as `id` instead of `chatId`. Clients accept both.
8. The widget caches the `/init` response for up to 5 minutes in browser storage, so configuration
   changes can take that long to appear.

## 12. Endpoint summary

Details, request bodies and response schemas are in [`openapi.yaml`](openapi.yaml).

| Method | Path                                 | Profile        | Purpose                                          |
| ------ | ------------------------------------ | -------------- | ------------------------------------------------ |
| `GET`  | `/public/chat/init`                  | Core           | Widget configuration; issues session ID          |
| `POST` | `/public/chat/session`               | Core           | Activates the session; returns the existing chat |
| `POST` | `/public/chat/stream`                | Core           | New chat, streamed reply                         |
| `POST` | `/public/chat/{chatId}/stream`       | Core           | Continue chat, streamed reply                    |
| `POST` | `/public/chat`                       | Non-streaming  | New chat, complete reply                         |
| `POST` | `/public/chat/{chatId}`              | Non-streaming  | Continue chat, complete reply                    |
| `POST` | `/public/chat/voice/stream`          | Recorded voice | New voice chat, streamed                         |
| `POST` | `/public/chat/voice/{chatId}/stream` | Recorded voice | Continue voice chat, streamed                    |
| `POST` | `/public/chat/voice`                 | Recorded voice | New voice chat, complete                         |
| `POST` | `/public/chat/voice/{chatId}`        | Recorded voice | Continue voice chat, complete                    |
| `POST` | `/public/chat/realtime/session`      | Realtime voice | Creates a realtime media session                 |

### 12.1 Realtime voice session (optional)

`POST /public/chat/realtime/session` receives `{ sdp?, chatId?, locale }` and returns one of:

- **WebRTC** (`transport: "webrtc"`): the server negotiates with the provider using the browser's SDP
  offer and returns the SDP answer. Media and provider events then flow directly between the browser
  and the provider over a data channel named `oai-events`.
- **WebSocket relay** (`transport: "websocket"`): the browser opens
  `<apiBaseUrl with http→ws><websocketPath>` with subprotocol `websocketProtocol` and exchanges
  provider-format JSON events and base64 PCM16 audio at `sampleRate` through the server.
  Browsers cannot send `Authorization` on a WebSocket, so `websocketPath` SHOULD carry an
  unguessable, single-use token that expires within minutes and identifies the site, visitor,
  user ID and chat. Servers MUST check the `Origin` of the upgrade against the site's allowlist,
  and MUST keep the provider key on the server. The client sends `input_audio_buffer.append`
  (`{ "audio": "<base64 PCM16 mono at sampleRate>" }`); the server sends the events below. When a
  new chat starts the server may speak the greeting (`initialGreeting` in the session response);
  the widget keeps that response's transcript out of the conversation.

The widget consumes OpenAI-Realtime-style events (`conversation.item.input_audio_transcription.*`,
`response.*audio_transcript.*`, `response.*audio.delta`, `input_audio_buffer.speech_started`,
`response.created`, `response.done`, `error`) plus one protocol event, `clearideas.chat.updated`
(`{ "chatId": "…" }`), which tells the widget which chat the transcript is saved to.
