import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { mockInitResponseNewChat } from '../fixtures/api-responses'
import {
  resetAllMocks,
  setupExistingChatSession,
  setupInitNewChat,
  setupInitTwice,
  setupSessionActivationDelay,
  setupTextChatStream,
  setupVoiceChatStream,
} from '../helpers/msw-utils'
import { createWidgetWrapper, waitForStreamComplete, widgetStorageKey } from '../helpers/test-utils'

describe('User Flows', () => {
  beforeEach(() => {
    resetAllMocks()
    vi.clearAllMocks()
  })

  describe('New User Flow', () => {
    it('completes full flow: Init → Send text → Receive response', async () => {
      const sessionId = 'session-new-user-123'
      setupInitTwice(mockInitResponseNewChat, sessionId)
      setupTextChatStream()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Verify init loaded and session ID stored
      expect(vm.initData).toBeTruthy()
      expect(vm.chatName).toBe('Test Bot')
      expect(vm.sessionId).toBe(sessionId)

      // Send message
      await vm.sendPublicChatMessage('What products do you offer?')

      await nextTick()
      await waitForStreamComplete(vm)

      // Verify message sent and response received
      expect(vm.messages.length).toBeGreaterThan(1)
      expect(vm.messages[0].role).toBe('user')
      expect(vm.messages[0].content).toBe('What products do you offer?')
      expect(vm.messages[vm.messages.length - 1].role).toBe('assistant')
      expect(vm.chatId).toBeTruthy()
    })
  })

  describe('Returning User Flow', () => {
    it('restores chat history and continues conversation', async () => {
      const sessionId = 'session-returning-456'
      setupExistingChatSession(sessionId)
      setupTextChatStream()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Verify existing chat restored on activation and session ID stored
      expect(vm.chatId).toBe('existing-chat-id-123')
      expect(vm.messages.length).toBe(3) // Existing messages
      expect(vm.sessionId).toBe(sessionId)

      // Continue conversation
      await vm.sendPublicChatMessage('Tell me more about pricing')

      await nextTick()
      await waitForStreamComplete(vm)

      // Verify new message added
      expect(vm.messages.length).toBeGreaterThan(3)
      expect(vm.messages[vm.messages.length - 1].role).toBe('assistant')
    })
  })

  describe('Voice Chat Flow', () => {
    it('completes voice flow: Start recording → Send → Receive audio → Play', async ({
      onTestFinished,
    }) => {
      // Exercise the recorded-audio fallback; realtime transports have their own suite.
      vi.stubGlobal('WebSocket', undefined)
      vi.stubGlobal('RTCPeerConnection', undefined)
      onTestFinished(() => {
        vi.unstubAllGlobals()
      })
      const sessionId = 'session-voice-flow-909'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const mockStream = {
        getTracks: vi.fn(() => [
          {
            stop: vi.fn(),
          },
        ]),
      }

      const mockBlob = new Blob(['audio data'], { type: 'audio/webm' })

      // Mock MediaRecorder to add chunks when stopped
      ;(global.MediaRecorder as any).mockImplementation(function (this: any, stream: any) {
        this.stream = stream
        this.state = 'inactive'
        this.ondataavailable = null
        this.onstop = null
        this.start = vi.fn(() => {
          this.state = 'recording'
        })
        this.stop = vi.fn(() => {
          this.state = 'inactive'
          // Trigger ondataavailable with mock blob
          if (this.ondataavailable) {
            this.ondataavailable({ data: mockBlob })
          }
          if (this.onstop) {
            this.onstop()
          }
        })
        return this
      })

      // Create a proper FileReader mock that captures callbacks
      global.FileReader = vi.fn(function (this: any) {
        this.result = ''
        this.onloadend = null
        this.onerror = null
        this.readAsDataURL = vi.fn(function (this: any, _blob: Blob) {
          // Simulate async FileReader behavior
          setTimeout(() => {
            this.result = 'data:audio/webm;base64,dGVzdA=='
            if (this.onloadend) {
              this.onloadend()
            }
          }, 0)
        })
        return this
      }) as any
      ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce(mockStream)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Start recording
      await vm.startRecording()

      await nextTick()
      expect(vm.isRecording).toBe(true)

      // Set up SSE mock AFTER component initialization, right before sending
      setupVoiceChatStream()

      // Stop and send - this triggers async processing
      vm.stopRecordingAndSend()

      // Wait for FileReader to process (setTimeout in stopRecordingAndSend + FileReader)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Wait for sendVoiceMessage to make fetch and process stream
      await new Promise(resolve => setTimeout(resolve, 500))

      await nextTick()

      // Verify voice message sent and response received
      expect(vm.messages.length).toBeGreaterThan(0)
      const assistantMessages = vm.messages.filter((m: any) => m.role === 'assistant')
      const lastMessage = assistantMessages[assistantMessages.length - 1]
      expect(lastMessage.audio).toBeTruthy()
    })
  })

  describe('Widget Interaction Flow', () => {
    it('opens and closes widget', async () => {
      const sessionId = 'session-widget-toggle-1111'
      // Component calls loadInitData on mount, and openWidget() calls it again if initData isn't loaded
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const wrapper = createWidgetWrapper()

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Initially closed
      expect(vm.isOpen).toBe(false)

      // Open widget
      await vm.openWidget()

      await nextTick()
      expect(vm.isOpen).toBe(true)

      // Close widget
      vm.closeWidget()

      await nextTick()
      expect(vm.isOpen).toBe(false)
    })

    it('toggles widget open/closed', async () => {
      const sessionId = 'session-widget-toggle-2222'
      // Component calls loadInitData on mount, and toggleWidget() -> openWidget() calls it again if initData isn't loaded
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const wrapper = createWidgetWrapper()

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Toggle open
      vm.toggleWidget()
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(vm.isOpen).toBe(true)

      // Toggle closed
      vm.toggleWidget()

      await nextTick()
      expect(vm.isOpen).toBe(false)
    })

    it('does not reopen after being closed while activation is still in flight', async () => {
      const sessionId = 'session-widget-race-2323'
      setupInitTwice(mockInitResponseNewChat, sessionId)
      setupSessionActivationDelay(150)

      const wrapper = createWidgetWrapper()

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      const openPromise = vm.openWidget()
      vm.closeWidget()

      await openPromise
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(vm.isOpen).toBe(false)
    })

    it('switches between home and chat views', async () => {
      const sessionId = 'session-views-3333'
      setupInitTwice(mockInitResponseNewChat, sessionId)

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Initially on home view
      expect(vm.currentView).toBe('home')

      // Start chat
      await vm.startChat()

      await nextTick()
      expect(vm.currentView).toBe('chat')

      // Go back to home
      vm.goToHome()

      await nextTick()
      expect(vm.currentView).toBe('home')
    })

    it('starts new chat', async () => {
      const sessionId = 'session-new-chat-4444'
      setupExistingChatSession(sessionId)
      setupTextChatStream()

      const wrapper = createWidgetWrapper({
        openOnLoad: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Verify existing chat
      expect(vm.chatId).toBe('existing-chat-id-123')
      expect(vm.messages.length).toBeGreaterThan(0)

      // Start new chat
      vm.startNewChat()

      await nextTick()
      expect(vm.chatId).toBeNull()
      expect(vm.messages.length).toBe(0)
    })
  })

  describe('Session Persistence Flow', () => {
    it('persists session across widget close/reopen', async () => {
      const storedSessionId = 'stored-session-123'
      const newSessionId = 'session-123'
      ;(global.localStorage.getItem as any).mockReturnValue(storedSessionId)
      setupInitNewChat(newSessionId)

      // Explicitly set consent granted to ensure localStorage is used
      const wrapper = createWidgetWrapper({
        consentGranted: true,
      })

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const vm = wrapper.vm as any

      // Verify session ID from localStorage was used initially
      expect(global.localStorage.getItem).toHaveBeenCalledWith(widgetStorageKey('session'))

      // Open the widget to trigger activation with the refreshed session ID
      setupInitNewChat(newSessionId)
      await vm.openWidget()
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify new session ID from init response was stored
      expect(vm.sessionId).toBe(newSessionId)
      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        widgetStorageKey('session'),
        newSessionId,
      )

      // Set up SSE mock for the chat message
      setupTextChatStream()
      await vm.sendPublicChatMessage('Test')

      await nextTick()
      await waitForStreamComplete(vm)

      // Verify component has session ID
      expect(vm.sessionId).toBe(newSessionId)

      // Close widget
      vm.closeWidget()

      await nextTick()

      // Reopen widget - should use stored session ID
      ;(global.localStorage.getItem as any).mockReturnValue(newSessionId)
      setupExistingChatSession(newSessionId)
      await vm.openWidget()

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Session should be maintained
      expect(vm.sessionId).toBe(newSessionId)
    })
  })
})
