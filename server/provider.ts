// The seam between the protocol server and whatever produces assistant replies.
//
// This test server ships only FixtureProvider (fixture-provider.ts), which returns canned replies
// and never calls an AI service. A real server implements ChatProvider by calling an AI API from
// here, on the server, with a key the browser never sees. See the example at the end of this file.

import type { SiteConfig } from './sites.ts'
import type { StoredMessage } from './store.ts'

export interface ProviderRequest {
  site: SiteConfig
  chatId: string
  /**
   * Conversation so far, oldest first, ending with the visitor's new message. Already truncated to
   * the server's history limit. Treat every message as untrusted input (README §10).
   */
  history: StoredMessage[]
  /** Visitor language: the best match for Accept-Language among the server's languages (`fr`, `zh-Hant`, …). */
  language: string
  /**
   * The site's ID for the signed-in user, or null. Set by the page, so unverified: use it to
   * attribute usage, never to grant access.
   */
  userId: string | null
  /** Aborted when the visitor disconnects. Stop generating (and paying for tokens) when it fires. */
  signal: AbortSignal
}

/** What a provider yields. The server turns these into protocol stream events (README §6). */
export type ProviderEvent =
  | { type: 'content'; content: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolCall'; id: string; name: string; arguments: string }
  | { type: 'toolCallComplete' }
  /** Replaces the concatenated content as the final message (for example with citations fixed up). */
  | { type: 'final'; content: string }
  /**
   * Test-only transport faults used by FixtureProvider to exercise client edge cases.
   * A real provider never yields these.
   */
  | { type: 'test:disconnect' }
  /** End the response cleanly without `done` or `error`. */
  | { type: 'test:end' }
  | { type: 'test:comment'; comment: string }
  /** From now on, write each event in several byte-level pieces (tests client buffering). */
  | { type: 'test:split-frames' }
  /** From now on, frame events in another valid Server-Sent Events form (tests client parsing). */
  | { type: 'test:sse-format'; format: SseFormat }

/**
 * Server-Sent Events framings the test server can produce:
 * - standard: `data: <json>` and a blank line (what servers SHOULD send, README §6.1)
 * - compact: `data:<json>` without the optional space
 * - multiline: the JSON pretty-printed over several `data:` lines
 * - crlf: CRLF line endings
 * - fields: `event:`, `id:` and `retry:` fields before the data
 * - no-blank-lines: consecutive `data:` lines without blank lines (accepted by widget 0.1.x)
 */
export type SseFormat = 'standard' | 'compact' | 'multiline' | 'crlf' | 'fields' | 'no-blank-lines'

export interface ChatProvider {
  /**
   * Produce the assistant reply for `request`, yielding events as they become available.
   *
   * Throw ProviderError for failures the visitor should see. If nothing has been yielded yet, the
   * server answers with that HTTP status; afterwards it sends a stream `error` event.
   */
  reply(request: ProviderRequest): AsyncIterable<ProviderEvent>
}

/** A failure with a status and a visitor-safe message. Never put provider error text in `message`. */
export class ProviderError extends Error {
  status: number
  retryAfterSeconds?: number

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message)
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/*
 * ---------------------------------------------------------------------------------------------
 * Where a real server calls an AI API
 * ---------------------------------------------------------------------------------------------
 *
 * Implement ChatProvider and pass it to createChatServer({ provider }). A sketch for an
 * OpenAI-compatible chat completions endpoint (OpenAI, Azure OpenAI, Ollama, vLLM, OpenRouter, ...):
 *
 *   export class OpenAICompatibleProvider implements ChatProvider {
 *     async *reply({ site, history, language, signal }: ProviderRequest) {
 *       const response = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
 *         method: 'POST',
 *         signal, // stops generation when the visitor disconnects
 *         headers: {
 *           // The provider key lives in the server environment. It is never sent to the browser
 *           // and never appears in the widget configuration.
 *           Authorization: `Bearer ${process.env.AI_API_KEY}`,
 *           'Content-Type': 'application/json',
 *         },
 *         body: JSON.stringify({
 *           model: process.env.AI_MODEL, // chosen by the server; ignore message.aiModel from clients
 *           stream: true,
 *           max_tokens: 800, // bound cost per reply
 *           messages: [
 *             // The system prompt is server-owned; visitors cannot change it.
 *             { role: 'system', content: buildSystemPrompt(site, language) },
 *             ...history.map(m => ({ role: m.role, content: m.content })),
 *           ],
 *         }),
 *       })
 *       if (!response.ok || !response.body) {
 *         // Log the provider's error server-side; show the visitor a generic message.
 *         throw new ProviderError(502, 'The assistant is temporarily unavailable.')
 *       }
 *       for await (const delta of parseProviderStream(response.body)) {
 *         yield { type: 'content', content: delta }
 *       }
 *     }
 *   }
 *
 * Also consider, before going to production:
 * - retrieval over the site's content to ground answers (and treat retrieved text as untrusted:
 *   it can contain prompt injection);
 * - moderation of input and output;
 * - server-side tools (lead capture, etc.) whose arguments you validate like any user input;
 * - per-site spending limits in addition to the request rate limits in app.ts.
 */
