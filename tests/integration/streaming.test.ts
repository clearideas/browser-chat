import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { StreamEvent } from '@/types'

import { mockInitResponseNewChat } from '../fixtures/api-responses'
import {
  resetAllMocks,
  setupInitTwice,
  setupTextChatStream,
  setupVoiceChatStream,
} from '../helpers/msw-utils'
import { createWidgetWrapper, waitForStreamComplete } from '../helpers/test-utils'

describe('Streaming', () => {
  beforeEach(() => {
    resetAllMocks()
    vi.clearAllMocks()
  })

  describe('Text Chat Streaming', () => {
    it('handles multiple content chunks', async () => {
      const sessionId = 'session-stream-123'
      // Component calls loadInitData twice: once on mount, once in openWidget
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const chunks: Array<{ type: StreamEvent['type']; [key: string]: any }> = [
        { type: 'info', id: 'chat-123', isNewChat: true },
        { type: 'content', content: 'Hello' },
        { type: 'content', content: ' world' },
        { type: 'content', content: '!' },
        {
          type: 'message_finalized',
          message: { role: 'assistant', content: 'Hello world!' },
        },
        {
          type: 'done',
          chatId: 'chat-123',
          message: { role: 'assistant', content: 'Hello world!' },
        },
      ]

      setupTextChatStream(chunks)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Hi')

      await nextTick()
      await waitForStreamComplete(vm)

      // Should accumulate content chunks
      const assistantMessages = vm.messages.filter((m: any) => m.role === 'assistant')
      expect(assistantMessages.length).toBeGreaterThan(0)
      expect(assistantMessages[assistantMessages.length - 1].content).toBe('Hello world!')
    })

    it('handles tool call events', async () => {
      const sessionId = 'session-tool-456'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const chunks: Array<{ type: StreamEvent['type']; [key: string]: any }> = [
        { type: 'info', id: 'chat-123', isNewChat: true },
        {
          type: 'toolCall',
          toolCall: {
            id: 'call-1',
            function: {
              name: 'retrieve_context',
              arguments: '{"query":"test"}',
            },
          },
        },
        { type: 'toolCallComplete' },
        { type: 'content', content: 'Response after tool call' },
        {
          type: 'message_finalized',
          message: { role: 'assistant', content: 'Response after tool call' },
        },
        {
          type: 'done',
          chatId: 'chat-123',
          message: { role: 'assistant', content: 'Response after tool call' },
        },
      ]

      setupTextChatStream(chunks)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await waitForStreamComplete(vm)

      // Tool calls should be filtered out, only content should remain
      const assistantMessages = vm.messages.filter((m: any) => m.role === 'assistant')
      expect(assistantMessages.length).toBeGreaterThan(0)
      expect(assistantMessages[assistantMessages.length - 1].content).toBe(
        'Response after tool call',
      )
    })

    it('handles error event in stream', async () => {
      const sessionId = 'session-error-789'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const chunks: Array<{ type: StreamEvent['type']; [key: string]: any }> = [
        { type: 'info', id: 'chat-123', isNewChat: true },
        { type: 'content', content: 'Partial' },
        { type: 'error', error: 'Stream error occurred', statusCode: 500 },
      ]

      setupTextChatStream(chunks)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await waitForStreamComplete(vm)

      expect(vm.error).toBeTruthy()
      expect(vm.error).toContain('Stream error occurred')
    })

    it('updates chatId from info event', async () => {
      const sessionId = 'session-info-101'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const chunks: Array<{ type: StreamEvent['type']; [key: string]: any }> = [
        { type: 'info', id: 'new-chat-id-456', isNewChat: true },
        { type: 'content', content: 'Test' },
        {
          type: 'done',
          chatId: 'new-chat-id-456',
          message: { role: 'assistant', content: 'Test' },
        },
      ]

      setupTextChatStream(chunks)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await waitForStreamComplete(vm)

      expect(vm.chatId).toBe('new-chat-id-456')
    })
  })

  describe('Voice Chat Streaming', () => {
    it('handles transcript event before content', async () => {
      const sessionId = 'session-voice-transcript-202'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const chunks: Array<{ type: StreamEvent['type']; [key: string]: any }> = [
        { type: 'info', id: 'voice-chat-123', isNewChat: true, chatName: 'Test Bot' },
        { type: 'transcript', transcript: 'What is the weather?' },
        { type: 'content', content: 'The weather' },
        { type: 'content', content: ' is sunny.' },
        {
          type: 'message_finalized',
          message: { role: 'assistant', content: 'The weather is sunny.' },
        },
        {
          type: 'audio',
          audio: 'UklGRgAAAABXQVZF',
        },
        {
          type: 'done',
          chatId: 'voice-chat-123',
          chatName: 'Test Bot',
          transcript: 'What is the weather?',
          response: 'The weather is sunny.',
          audio: 'UklGRgAAAABXQVZF',
        },
      ]

      setupVoiceChatStream(chunks)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendVoiceMessage('base64audio...', 'webm')

      await nextTick()
      await waitForStreamComplete(vm)

      // Should have user message with transcript
      const userMessages = vm.messages.filter((m: any) => m.role === 'user')
      expect(userMessages.length).toBeGreaterThan(0)
      expect(userMessages[userMessages.length - 1].content).toBe('What is the weather?')

      // Should have assistant message with audio
      const assistantMessages = vm.messages.filter((m: any) => m.role === 'assistant')
      const lastMessage = assistantMessages[assistantMessages.length - 1]
      expect(lastMessage.audio).toBeTruthy()
    })

    it('handles audio chunk events with init segment', async () => {
      const sessionId = 'session-voice-chunks-303'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const chunks: Array<{ type: StreamEvent['type']; [key: string]: any }> = [
        { type: 'info', id: 'voice-chat-123', isNewChat: true },
        { type: 'transcript', transcript: 'Test' },
        { type: 'content', content: 'Response' },
        {
          type: 'audioChunk',
          audioChunk: 'init-segment',
          audioChunkIndex: 0,
          isInitSegment: true,
        },
        {
          type: 'audioChunk',
          audioChunk: 'chunk-1',
          audioChunkIndex: 1,
          isInitSegment: false,
        },
        {
          type: 'audioChunk',
          audioChunk: 'chunk-2',
          audioChunkIndex: 2,
          isInitSegment: false,
        },
        {
          type: 'audio',
          audio: 'complete-audio',
        },
        {
          type: 'done',
          chatId: 'voice-chat-123',
          transcript: 'Test',
          response: 'Response',
          audio: 'complete-audio',
        },
      ]

      setupVoiceChatStream(chunks)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendVoiceMessage('base64audio...', 'webm')

      await nextTick()
      await waitForStreamComplete(vm)

      // Should have audio chunks stored
      const assistantMessages = vm.messages.filter((m: any) => m.role === 'assistant')
      const lastMessage = assistantMessages[assistantMessages.length - 1]
      expect(lastMessage.audio).toBeTruthy()
    })

    it('handles stream interruption and cleanup', async () => {
      const sessionId = 'session-interrupt-404'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const chunks: Array<{ type: StreamEvent['type']; [key: string]: any }> = [
        { type: 'info', id: 'chat-123', isNewChat: true },
        { type: 'content', content: 'Partial' },
        // Stream interrupted - no done event
      ]

      setupTextChatStream(chunks)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Create abort controller
      const abortController = new AbortController()
      vm.abortController = abortController

      // Start sending
      vm.sendPublicChatMessage('Test')

      // Abort before completion
      setTimeout(() => {
        abortController.abort()
      }, 50)

      await nextTick()
      await waitForStreamComplete(vm)

      // Should handle abort gracefully
      expect(vm.loading).toBe(false)
    })
  })

  describe('Event Ordering', () => {
    it('processes events in correct order', async () => {
      const sessionId = 'session-order-505'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const chunks: Array<{ type: StreamEvent['type']; [key: string]: any }> = [
        { type: 'info', id: 'chat-123', isNewChat: true },
        { type: 'content', content: 'First' },
        { type: 'content', content: 'Second' },
        { type: 'content', content: 'Third' },
        {
          type: 'message_finalized',
          message: { role: 'assistant', content: 'FirstSecondThird' },
        },
        {
          type: 'done',
          chatId: 'chat-123',
          message: { role: 'assistant', content: 'FirstSecondThird' },
        },
      ]

      setupTextChatStream(chunks)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await waitForStreamComplete(vm)

      // Content should be accumulated in order
      const assistantMessages = vm.messages.filter((m: any) => m.role === 'assistant')
      expect(assistantMessages[assistantMessages.length - 1].content).toBe('FirstSecondThird')
    })
  })
})
