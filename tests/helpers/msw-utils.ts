import type { StreamEvent } from '@/types'

import {
  mockErrorResponses,
  mockInitResponseNewChat,
  mockSessionActivationExistingChat,
  mockTextChatStreamEvents,
  mockVoiceChatStreamEvents,
} from '../fixtures/api-responses'
import {
  getCurrentSessionId,
  resetHandlers,
  setErrorResponse,
  setInitResponse,
  setNetworkError,
  setSessionActivationDelay,
  setSessionActivationResponse,
  setStreamEvents,
} from './handlers'

/**
 * Setup init endpoint with new chat response
 */
export function setupInitNewChat(sessionId?: string): void {
  setInitResponse(mockInitResponseNewChat, sessionId)
  setSessionActivationResponse({}, sessionId)
}

/**
 * Setup activation endpoint with existing chat response
 */
export function setupExistingChatSession(sessionId?: string): void {
  setInitResponse(mockInitResponseNewChat, sessionId)
  setSessionActivationResponse(mockSessionActivationExistingChat, sessionId)
}

export function setupSessionActivationDelay(delayMs: number): void {
  setSessionActivationDelay(delayMs)
}

/**
 * Setup init endpoint to be called twice (component calls it on mount and openWidget)
 */
export function setupInitTwice(response: typeof mockInitResponseNewChat, sessionId?: string): void {
  setInitResponse(response, sessionId)
  setSessionActivationResponse({}, sessionId)
}

/**
 * Setup text chat stream response
 */
export function setupTextChatStream(
  events?: Array<{ type: StreamEvent['type']; [key: string]: any }>,
): void {
  setStreamEvents(events || mockTextChatStreamEvents)
}

/**
 * Setup voice chat stream response
 */
export function setupVoiceChatStream(
  events?: Array<{ type: StreamEvent['type']; [key: string]: any }>,
): void {
  setStreamEvents(events || mockVoiceChatStreamEvents)
}

/**
 * Setup error response
 */
export function setupErrorResponse(status: number, body?: any): void {
  const errorBody = body ||
    (mockErrorResponses[status as unknown as keyof typeof mockErrorResponses] as any) || {
      message: 'Error',
    }
  setErrorResponse(status, errorBody)
}

/**
 * Setup network error
 */
export function setupNetworkError(message: string = 'Network error'): void {
  setNetworkError(new Error(message))
}

/**
 * Setup 401 Unauthorized error
 */
export function setupUnauthorizedError(): void {
  setupErrorResponse(401, mockErrorResponses.unauthorized)
}

/**
 * Setup 403 Forbidden error
 */
export function setupForbiddenError(): void {
  setupErrorResponse(403, mockErrorResponses.forbidden)
}

/**
 * Setup 429 Rate Limit error
 */
export function setupRateLimitError(): void {
  setupErrorResponse(429, mockErrorResponses.rateLimit)
}

/**
 * Reset all mocks
 */
export function resetAllMocks(): void {
  resetHandlers()
}

/**
 * Get current session ID
 */
export function getSessionId(): string | null {
  return getCurrentSessionId()
}
