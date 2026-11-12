import { http, HttpResponse } from 'msw/http'

import type { InitResponse, SessionActivationResponse, StreamEvent } from '@/types'

import { mockInitResponseNewChat, mockTextChatStreamEvents } from '../fixtures/api-responses'

// Store for dynamic handler state
let currentInitResponse: InitResponse = mockInitResponseNewChat
let currentInitSessionId: string | null = null
let currentSessionActivationResponse: SessionActivationResponse = {}
let currentActivationSessionId: string | null = null
let currentActivationDelayMs = 0
let currentStreamEvents: Array<{ type: StreamEvent['type']; [key: string]: any }> =
  mockTextChatStreamEvents
let currentErrorResponse: { status: number; body: any } | null = null
let currentNetworkError: Error | null = null

/**
 * Set the init response to return
 */
export function setInitResponse(response: InitResponse, sessionId?: string): void {
  currentInitResponse = response
  currentInitSessionId = sessionId || null
}

export function setSessionActivationResponse(
  response: SessionActivationResponse,
  sessionId?: string,
): void {
  currentSessionActivationResponse = response
  currentActivationSessionId = sessionId ?? currentInitSessionId
}

export function setSessionActivationDelay(delayMs: number): void {
  currentActivationDelayMs = delayMs
}

/**
 * Set the stream events to return for chat endpoints
 */
export function setStreamEvents(
  events: Array<{ type: StreamEvent['type']; [key: string]: any }>,
): void {
  currentStreamEvents = events
}

/**
 * Set an error response to return
 */
export function setErrorResponse(status: number, body: any): void {
  currentErrorResponse = { status, body }
  currentNetworkError = null
}

/**
 * Set a network error to throw
 */
export function setNetworkError(error: Error): void {
  currentNetworkError = error
  currentErrorResponse = null
}

/**
 * Reset all handler state
 */
export function resetHandlers(): void {
  currentInitResponse = mockInitResponseNewChat
  currentInitSessionId = null
  currentSessionActivationResponse = {}
  currentActivationSessionId = null
  currentActivationDelayMs = 0
  currentStreamEvents = mockTextChatStreamEvents
  currentErrorResponse = null
  currentNetworkError = null
}

/**
 * Get current session ID (for testing)
 */
export function getCurrentSessionId(): string | null {
  return currentInitSessionId
}

/**
 * Create SSE stream from events
 * Creates a new stream each time to avoid "stream is locked" errors
 */
function createSSEStream(
  events: Array<{ type: StreamEvent['type']; [key: string]: any }>,
): ReadableStream {
  const encoder = new TextEncoder()
  // Create a deep copy of events array to avoid any sharing issues
  const eventsCopy = JSON.parse(JSON.stringify(events))

  // Combine all events into a single SSE message
  const sseData = eventsCopy
    .map(
      (event: { type: StreamEvent['type']; [key: string]: any }) =>
        `data: ${JSON.stringify(event)}\n\n`,
    )
    .join('')
  const encodedData = encoder.encode(sseData)

  // Create stream - enqueue and close synchronously
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encodedData)
      controller.close()
    },
  })
}

/**
 * Create a Response with a body that creates a fresh stream on each getReader() call
 * This prevents MSW from locking the stream when it inspects/clones the response
 */
function createStreamingResponse(
  events: Array<{ type: StreamEvent['type']; [key: string]: any }>,
): Response {
  const eventsCopy = JSON.parse(JSON.stringify(events))

  // Create a base stream
  const baseStream = createSSEStream(eventsCopy)

  // Wrap the stream in a Proxy that creates a fresh stream for each getReader() call
  const proxiedStream = new Proxy(baseStream, {
    get(target, prop) {
      if (prop === 'getReader') {
        // Return a function that creates a fresh stream and gets its reader
        return () => {
          const freshStream = createSSEStream(eventsCopy)
          return freshStream.getReader()
        }
      }
      // For all other properties, use the base stream
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

  return new Response(proxiedStream, {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'text/event-stream',
    },
  })
}

/**
 * MSW handlers for API endpoints
 */
export const handlers = [
  // GET /public/chat/init
  http.get('https://api.clearideas.local/public/chat/init', async () => {
    // Check for network error
    if (currentNetworkError) {
      // A network-level failure: fetch rejects with a TypeError, as when the server is
      // unreachable or CORS blocks the response. (Throwing here would make MSW answer 500.)
      return HttpResponse.error()
    }

    // Check for error response
    if (currentErrorResponse) {
      return HttpResponse.json(currentErrorResponse.body, {
        status: currentErrorResponse.status,
        headers: currentInitSessionId
          ? {
              'x-clearideas-public-chat-session-id': currentInitSessionId,
            }
          : {},
      })
    }

    // Return init response
    return HttpResponse.json(currentInitResponse, {
      headers: currentInitSessionId
        ? {
            'x-clearideas-public-chat-session-id': currentInitSessionId,
          }
        : {},
    })
  }),

  // POST /public/chat/session
  http.post('https://api.clearideas.local/public/chat/session', async () => {
    if (currentNetworkError) {
      // A network-level failure: fetch rejects with a TypeError, as when the server is
      // unreachable or CORS blocks the response. (Throwing here would make MSW answer 500.)
      return HttpResponse.error()
    }

    if (currentActivationDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, currentActivationDelayMs))
    }

    if (currentErrorResponse) {
      return HttpResponse.json(currentErrorResponse.body, {
        status: currentErrorResponse.status,
        headers: currentActivationSessionId
          ? {
              'x-clearideas-public-chat-session-id': currentActivationSessionId,
            }
          : {},
      })
    }

    return HttpResponse.json(currentSessionActivationResponse, {
      headers: currentActivationSessionId
        ? {
            'x-clearideas-public-chat-session-id': currentActivationSessionId,
          }
        : {},
    })
  }),

  // POST /public/chat/stream
  http.post('https://api.clearideas.local/public/chat/stream', async () => {
    // Check for network error
    if (currentNetworkError) {
      // A network-level failure: fetch rejects with a TypeError, as when the server is
      // unreachable or CORS blocks the response. (Throwing here would make MSW answer 500.)
      return HttpResponse.error()
    }

    // Check for error response
    if (currentErrorResponse) {
      return HttpResponse.json(currentErrorResponse.body, {
        status: currentErrorResponse.status,
      })
    }

    // Create a Response with a body that creates fresh streams on each access
    // This prevents MSW from locking the stream when it inspects/clones the response
    return createStreamingResponse(currentStreamEvents)
  }),

  // POST /public/chat/:chatId/stream
  http.post('https://api.clearideas.local/public/chat/:chatId/stream', async () => {
    // Check for network error
    if (currentNetworkError) {
      // A network-level failure: fetch rejects with a TypeError, as when the server is
      // unreachable or CORS blocks the response. (Throwing here would make MSW answer 500.)
      return HttpResponse.error()
    }

    // Check for error response
    if (currentErrorResponse) {
      return HttpResponse.json(currentErrorResponse.body, {
        status: currentErrorResponse.status,
      })
    }

    // Create a Response with a body that creates fresh streams on each access
    // This prevents MSW from locking the stream when it inspects/clones the response
    return createStreamingResponse(currentStreamEvents)
  }),

  // POST /public/chat/voice/stream
  http.post('https://api.clearideas.local/public/chat/voice/stream', async () => {
    // Check for network error
    if (currentNetworkError) {
      // A network-level failure: fetch rejects with a TypeError, as when the server is
      // unreachable or CORS blocks the response. (Throwing here would make MSW answer 500.)
      return HttpResponse.error()
    }

    // Check for error response
    if (currentErrorResponse) {
      return HttpResponse.json(currentErrorResponse.body, {
        status: currentErrorResponse.status,
      })
    }

    // Create a Response with a body that creates fresh streams on each access
    // This prevents MSW from locking the stream when it inspects/clones the response
    return createStreamingResponse(currentStreamEvents)
  }),

  // POST /public/chat/voice/:chatId/stream
  http.post('https://api.clearideas.local/public/chat/voice/:chatId/stream', async () => {
    // Check for network error
    if (currentNetworkError) {
      // A network-level failure: fetch rejects with a TypeError, as when the server is
      // unreachable or CORS blocks the response. (Throwing here would make MSW answer 500.)
      return HttpResponse.error()
    }

    // Check for error response
    if (currentErrorResponse) {
      return HttpResponse.json(currentErrorResponse.body, {
        status: currentErrorResponse.status,
      })
    }

    // Create a Response with a body that creates fresh streams on each access
    // This prevents MSW from locking the stream when it inspects/clones the response
    return createStreamingResponse(currentStreamEvents)
  }),
]
