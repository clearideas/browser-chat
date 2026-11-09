import type { ChatMessage, WidgetAction } from '@/types'

/**
 * Mock chat messages
 */
export const mockChatMessages: ChatMessage[] = [
  {
    role: 'user',
    content: 'Hello, how are you?',
    createdAt: new Date('2024-01-01T10:00:00Z'),
  },
  {
    role: 'assistant',
    content: 'I am doing well, thank you for asking!',
    createdAt: new Date('2024-01-01T10:00:01Z'),
  },
  {
    role: 'user',
    content: 'What can you help me with?',
    createdAt: new Date('2024-01-01T10:00:05Z'),
  },
  {
    role: 'assistant',
    content:
      'I can help you with various questions. Here is a [link](https://example.com){data-original-url="https://example.com"} to learn more.',
    createdAt: new Date('2024-01-01T10:00:06Z'),
  },
]

/**
 * Mock chat message with audio
 */
export const mockChatMessageWithAudio: ChatMessage = {
  role: 'assistant',
  content: 'This is a voice response.',
  audio: 'base64encodedaudiodata...',
  createdAt: new Date('2024-01-01T10:00:10Z'),
}

/**
 * Mock widget actions
 */
export const mockWidgetActions: WidgetAction[] = [
  {
    id: 'chat',
    title: 'Ask a question',
    description: 'AI Assistant can help',
    type: 'chat',
    icon: 'sparkles',
  },
  {
    id: 'link-1',
    title: 'Documentation',
    description: 'Browse our help center',
    type: 'link',
    url: 'https://example.com/docs',
  },
  {
    id: 'link-2',
    title: 'Contact Support',
    description: 'Get help from our support team',
    type: 'link',
    url: 'https://example.com/support',
  },
]

/**
 * Mock markdown content with various formats
 */
export const mockMarkdownContent = {
  simple: 'This is simple text.',
  withLinks:
    'Check out [example.com](https://example.com){data-original-url="https://example.com"} for more info.',
  withCode: 'Here is some code: `const x = 1;`',
  withCodeBlock: '```javascript\nconst x = 1;\n```',
  withLists: '- Item 1\n- Item 2\n- Item 3',
  withTable: '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |',
  withSourceLinks:
    'Based on [example.com](https://example.com/page1){data-original-url="https://example.com/page1"} and [another.com](https://another.com/page2){data-original-url="https://another.com/page2"}',
}

/**
 * Mock base64 audio data (minimal valid WebM header)
 */
export const mockBase64Audio = btoa('WEBM_HEADER_PLACEHOLDER_DATA')
