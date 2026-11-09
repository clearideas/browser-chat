import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/types'
import { upsertRealtimeTranscriptMessage } from '@/utils/realtimeTranscript'

describe('upsertRealtimeTranscriptMessage', () => {
  it('replaces cumulative revisions for the same provider item', () => {
    const messages: ChatMessage[] = []
    const trackedMessages = new Map<string, ChatMessage>()

    for (const content of [
      'What were the',
      'What were the Q1 earnings?',
      'What were the Q1 earnings for Shopify?',
      'What were the Q1 earnings for Shopify?',
    ]) {
      upsertRealtimeTranscriptMessage(
        messages,
        trackedMessages,
        { itemId: 'user-item-1' },
        {
          role: 'user',
          content,
        },
      )
    }

    expect(messages).toEqual([{ role: 'user', content: 'What were the Q1 earnings for Shopify?' }])
  })

  it('keeps identical words when they belong to separate spoken turns', () => {
    const messages: ChatMessage[] = []
    const trackedMessages = new Map<string, ChatMessage>()
    const message = { role: 'user' as const, content: 'Could you repeat that?' }

    upsertRealtimeTranscriptMessage(messages, trackedMessages, { itemId: 'user-item-1' }, message)
    upsertRealtimeTranscriptMessage(
      messages,
      trackedMessages,
      { itemId: 'user-item-2' },
      {
        ...message,
      },
    )

    expect(messages).toHaveLength(2)
  })
})
