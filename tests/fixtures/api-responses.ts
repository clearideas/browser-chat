import type { InitResponse, SessionActivationResponse, StreamEvent } from '@/types'

/**
 * Mock init response with new chat
 */
export const mockInitResponseNewChat: InitResponse = {
  initialMessage: "Hi! I'm Test Bot. How can I help you today?",
  style: {
    color: '#2866cf',
    mode: 'system',
  },
  links: [
    {
      title: 'Documentation',
      description: 'Browse our help center',
      url: 'https://example.com/docs',
    },
    {
      title: 'Contact Support',
      url: 'https://example.com/support',
    },
  ],
  chatName: 'Test Bot',
  chatTagline: 'Your friendly AI assistant',
  voiceEnabled: true,
}

/**
 * Mock activation response with existing chat
 */
export const mockSessionActivationExistingChat: SessionActivationResponse = {
  existingChat: {
    chatId: 'existing-chat-id-123',
    messages: [
      {
        role: 'assistant',
        content: "Hi! I'm Test Bot. How can I help you today?",
      },
      {
        role: 'user',
        content: 'What products do you offer?',
      },
      {
        role: 'assistant',
        content:
          'We offer a variety of products including... [example.com](https://example.com/products){data-original-url="https://example.com/products"}',
      },
    ],
  },
}

/**
 * Combined existing-chat scenario fixture for tests that need both init metadata
 * and activation-time chat restoration data.
 */
export const mockExistingChatScenario = {
  initResponse: mockInitResponseNewChat,
  activationResponse: mockSessionActivationExistingChat,
}

/**
 * Mock text chat response (non-streaming)
 */
export const mockTextChatResponse = {
  chatId: 'new-chat-id-456',
  chatName: 'Test Bot',
  messages: [
    {
      role: 'assistant',
      content:
        'This is a test response with [example.com](https://example.com){data-original-url="https://example.com"}',
    },
  ],
}

/**
 * Mock voice chat response (non-streaming)
 */
export const mockVoiceChatResponse = {
  audio: 'base64encodedaudiodata...',
  transcript: 'What products do you offer?',
  response: 'We offer a variety of products...',
  chatId: 'voice-chat-id-789',
  chatName: 'Test Bot',
}

/**
 * Mock SSE events for text chat streaming
 */
export const mockTextChatStreamEvents: Array<{
  type: StreamEvent['type']
  [key: string]: any
}> = [
  {
    type: 'info',
    id: 'stream-chat-id-123',
    isNewChat: true,
  },
  {
    type: 'content',
    content: 'This',
  },
  {
    type: 'content',
    content: ' is',
  },
  {
    type: 'content',
    content: ' a streaming',
  },
  {
    type: 'content',
    content: ' response.',
  },
  {
    type: 'message_finalized',
    message: {
      role: 'assistant',
      content: 'This is a streaming response.',
    },
  },
  {
    type: 'done',
    chatId: 'stream-chat-id-123',
    message: {
      role: 'assistant',
      content: 'This is a streaming response.',
    },
  },
]

/**
 * Mock SSE events for voice chat streaming
 */
export const mockVoiceChatStreamEvents: Array<{
  type: StreamEvent['type']
  [key: string]: any
}> = [
  {
    type: 'info',
    id: 'voice-chat-id-456',
    isNewChat: true,
    chatName: 'Test Bot',
  },
  {
    type: 'transcript',
    transcript: 'What are your business hours?',
  },
  {
    type: 'content',
    content: 'Our',
  },
  {
    type: 'content',
    content: ' business',
  },
  {
    type: 'content',
    content: ' hours',
  },
  {
    type: 'content',
    content: ' are',
  },
  {
    type: 'content',
    content: ' Monday-Friday, 9am-5pm.',
  },
  {
    type: 'message_finalized',
    message: {
      role: 'assistant',
      content: 'Our business hours are Monday-Friday, 9am-5pm.',
    },
  },
  {
    type: 'audioChunk',
    audioChunk: 'base64initsegment...',
    audioChunkIndex: 0,
    isInitSegment: true,
  },
  {
    type: 'audioChunk',
    audioChunk: 'base64chunk1...',
    audioChunkIndex: 1,
    isInitSegment: false,
  },
  {
    type: 'audioChunk',
    audioChunk: 'base64chunk2...',
    audioChunkIndex: 2,
    isInitSegment: false,
  },
  {
    type: 'audio',
    audio: 'base64completeaudio...',
  },
  {
    type: 'done',
    chatId: 'voice-chat-id-456',
    chatName: 'Test Bot',
    transcript: 'What are your business hours?',
    response: 'Our business hours are Monday-Friday, 9am-5pm.',
    audio: 'base64completeaudio...',
  },
]

/**
 * Mock error responses
 */
export const mockErrorResponses = {
  unauthorized: {
    message: 'Unauthorized',
  },
  forbidden: {
    message: 'Public chat disabled for site',
  },
  notFound: {
    message: 'Chat not found',
  },
  rateLimit: {
    message: 'Rate limit exceeded',
  },
  serverError: {
    message: 'Internal server error',
  },
  badRequest: {
    message: 'Invalid request body',
    details: 'Missing required field: message',
  },
}
