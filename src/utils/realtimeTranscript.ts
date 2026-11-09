import type { ChatMessage } from '../types'

export interface RealtimeTranscriptIdentity {
  itemId?: string
  responseId?: string
}

export const realtimeTranscriptKeys = (identity?: RealtimeTranscriptIdentity): string[] =>
  Array.from(
    new Set(
      [identity?.itemId, identity?.responseId].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      ),
    ),
  )

export const trackRealtimeTranscriptMessage = (
  trackedMessages: Map<string, ChatMessage>,
  identity: RealtimeTranscriptIdentity | undefined,
  message: ChatMessage,
): void => {
  for (const key of realtimeTranscriptKeys(identity)) trackedMessages.set(key, message)
}

/**
 * Realtime providers can revise a cumulative transcript for the same item.
 * Update that item's existing bubble while preserving identical text spoken as
 * a genuinely new item.
 */
export const upsertRealtimeTranscriptMessage = (
  messages: ChatMessage[],
  trackedMessages: Map<string, ChatMessage>,
  identity: RealtimeTranscriptIdentity | undefined,
  message: ChatMessage,
): number => {
  const existing = realtimeTranscriptKeys(identity)
    .map(key => trackedMessages.get(key))
    .find(candidate => candidate?.role === message.role && messages.includes(candidate))

  if (existing) {
    existing.content = message.content
    existing.createdAt ??= message.createdAt
    trackRealtimeTranscriptMessage(trackedMessages, identity, existing)
    return messages.indexOf(existing)
  }

  messages.push(message)
  trackRealtimeTranscriptMessage(trackedMessages, identity, message)
  return messages.length - 1
}
