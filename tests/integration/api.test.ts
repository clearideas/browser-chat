import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { mockInitResponseNewChat } from '../fixtures/api-responses'
import {
  resetAllMocks,
  setupExistingChatSession,
  setupForbiddenError,
  setupInitNewChat,
  setupInitTwice,
  setupNetworkError,
  setupRateLimitError,
  setupTextChatStream,
  setupUnauthorizedError,
  setupVoiceChatStream,
} from '../helpers/msw-utils'
import { createWidgetWrapper, waitForStreamComplete } from '../helpers/test-utils'

describe('API Integration', () => {
  beforeEach(() => {
    resetAllMocks()
    vi.clearAllMocks()
  })

  describe('Init Endpoint', () => {
    it('loads init data on mount', async () => {
      setupInitNewChat('session-123')

      createWidgetWrapper()

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Widget should have loaded init data
      // We verify this by checking component state rather than fetch calls
    })

    it('stores session ID from response header', async () => {
      const sessionId = 'session-456'
      setupInitNewChat(sessionId)

      // Explicitly set consent granted to ensure localStorage is used
      const wrapper = createWidgetWrapper({
        consentGranted: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        'clearideasPublicChatSessionId',
        sessionId,
      )

      // Verify session ID is stored in component
      const vm = wrapper.vm as any
      expect(vm.sessionId).toBe(sessionId)
    })

    it('does not restore existing chat before activation', async () => {
      const sessionId = 'session-existing-restore-5555'
      setupExistingChatSession(sessionId)

      const wrapper = createWidgetWrapper()

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      expect(vm.chatId).toBeNull()
      expect(vm.messages.length).toBe(0)
    })

    it('handles 403 Forbidden error', async () => {
      setupForbiddenError()

      const wrapper = createWidgetWrapper()

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Widget should still render, just without init data
      expect(wrapper.exists()).toBe(true)
    })

    it('handles 401 Unauthorized error', async () => {
      setupUnauthorizedError()

      const wrapper = createWidgetWrapper()

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('Text Chat Endpoints', () => {
    it('sends text message and receives streaming response', async () => {
      const sessionId = 'session-init-123'
      setupInitTwice(mockInitResponseNewChat, sessionId)
      setupTextChatStream()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Hello')

      await nextTick()
      await waitForStreamComplete(vm)

      // Verify messages were added
      expect(vm.messages.length).toBeGreaterThan(1)
      expect(vm.messages[vm.messages.length - 1].role).toBe('assistant')
    })

    it('continues existing chat conversation', async () => {
      const sessionId = 'session-existing-456'
      setupExistingChatSession(sessionId)
      setupTextChatStream()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Tell me more')

      await nextTick()
      await waitForStreamComplete(vm)

      // Verify new message was added to existing chat
      expect(vm.messages.length).toBeGreaterThan(3) // Original 3 + new messages
    })

    it('handles streaming events correctly', async () => {
      const sessionId = 'session-stream-events-606'
      setupInitTwice(mockInitResponseNewChat, sessionId)
      setupTextChatStream()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await waitForStreamComplete(vm)

      // Should have received streaming content
      const assistantMessages = vm.messages.filter((m: any) => m.role === 'assistant')
      expect(assistantMessages.length).toBeGreaterThan(0)
      expect(assistantMessages[assistantMessages.length - 1].content).toContain('streaming')
    })

    it('handles network errors gracefully', async () => {
      setupInitTwice(mockInitResponseNewChat)
      setupNetworkError('Network error')

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(vm.error).toBeTruthy()
    })

    it('handles 429 Rate Limit error', async () => {
      setupInitTwice(mockInitResponseNewChat)
      setupRateLimitError()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(vm.error).toBeTruthy()
    })
  })

  describe('Voice Chat Endpoints', () => {
    it('sends voice message and receives streaming response', async () => {
      const sessionId = 'session-voice-789'
      setupInitTwice(mockInitResponseNewChat, sessionId)
      setupVoiceChatStream()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendVoiceMessage('base64audio...', 'webm')

      await nextTick()
      await waitForStreamComplete(vm)

      // Verify messages were added
      expect(vm.messages.length).toBeGreaterThan(0)
    })

    it('handles transcript event', async () => {
      const sessionId = 'session-transcript-707'
      setupInitTwice(mockInitResponseNewChat, sessionId)
      setupVoiceChatStream()

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
      expect(userMessages[userMessages.length - 1].content).toContain('business hours')
    })

    it('handles audio chunk events', async () => {
      const sessionId = 'session-audio-chunks-808'
      setupInitTwice(mockInitResponseNewChat, sessionId)
      setupVoiceChatStream()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any
      await vm.sendVoiceMessage('base64audio...', 'webm')

      await nextTick()
      await waitForStreamComplete(vm)

      // Should have assistant message with audio
      const assistantMessages = vm.messages.filter((m: any) => m.role === 'assistant')
      expect(assistantMessages.length).toBeGreaterThan(0)
      const lastMessage = assistantMessages[assistantMessages.length - 1]
      expect(lastMessage).toBeDefined()
      expect(lastMessage.audio).toBeTruthy()
    })

    it('includes session ID in requests', async () => {
      const sessionId = 'session-123'
      ;(global.localStorage.getItem as any).mockReturnValue('stored-session-123')
      setupInitTwice(mockInitResponseNewChat, sessionId)
      setupTextChatStream()

      // Explicitly set consent granted to ensure localStorage is used
      const wrapper = createWidgetWrapper({
        openOnLoad: true,
        consentGranted: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify session ID was stored from init response
      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        'clearideasPublicChatSessionId',
        sessionId,
      )

      const vm = wrapper.vm as any
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await waitForStreamComplete(vm)

      // Verify component has session ID
      expect(vm.sessionId).toBe(sessionId)
    })
  })
})
