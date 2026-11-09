import type { WidgetLocale } from './i18n/messages'

// Inline type definitions for standalone widget

export interface ChatMessage {
  content: string
  role: 'user' | 'assistant' | 'tool' | 'system' | 'developer'
  createdAt?: Date
  updatedAt?: Date
  aiModel?: string
  templateId?: string
  sites?: Array<{ id: string; name: string }>
  files?: Array<{ id: string; name: string }>
  modelSelectionReason?: string
  audio?: string // Base64 audio data for voice responses
}

export interface WidgetAction {
  id: string
  title: string
  description: string
  type: 'chat' | 'link'
  url?: string
  icon?: string
}

export interface StreamEvent {
  type:
    | 'info'
    | 'transcript'
    | 'content'
    | 'thinking'
    | 'toolCall'
    | 'toolCallComplete'
    | 'message_finalized'
    | 'audioChunk'
    | 'audio'
    | 'done'
    | 'error'
  content?: string
  thinking?: string
  transcript?: string
  audioChunk?: string
  audioChunkIndex?: number
  isInitSegment?: boolean
  audio?: string
  toolCall?: any
  message?: PublicChatMessage
  chatId?: string
  chatName?: string
  error?: string
  statusCode?: number
  id?: string
  isNewChat?: boolean
  response?: string
}

export interface PublicChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ url: string; title: string }>
}

export interface InitResponse {
  initialMessage: string
  style?: {
    color?: string
    mode?: 'dark' | 'light' | 'system'
  }
  links?: Array<{
    title: string
    description?: string
    url: string
  }>
  chatName: string
  chatTagline?: string
  heroGreeting?: string
  iconUrl?: string
  voiceEnabled?: boolean
  voice?: {
    enabled: boolean
  }
  helloBubbleEnabled?: boolean
  helloBubbleText?: string
  helloBubbleDelay?: number
  disclaimerText?: string
  disclaimerDialogEnabled?: boolean
  disclaimerDialogText?: string
}

export interface SessionActivationResponse {
  existingChat?: {
    chatId: string
    messages: Array<{
      role: 'user' | 'assistant'
      content: string
      createdAt?: string
    }>
  }
}

export interface WidgetProps {
  // Public chat API configuration
  accessKey: string // Widget access key for public chat API
  apiBaseUrl?: string // Optional API base URL
  // Widget positioning and styling
  openOnLoad?: boolean
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  width?: number
  height?: number
  // Absolute positioning props (use these for custom positioning instead of position)
  top?: number
  right?: number
  bottom?: number
  left?: number
  // User props for standalone usage
  userName?: string
  userEmail?: string
  userId?: string
  // Note: Actions/links come only from server initData, not from props
  // Dark mode detection (allows parent page to communicate dark mode state)
  // Can be a boolean, a function that returns boolean, or a string (global variable/function name)
  darkMode?: boolean | (() => boolean) | string
  // Floating action button size in pixels (default: 56)
  fabSize?: number
  // Hide floating action button initially (default: false)
  // Widget stays in DOM, but FAB is hidden. Use hide()/show() methods for dynamic control.
  fabHide?: boolean
  // GDPR consent management
  // Can be a boolean, a function that returns boolean, or a string (global variable/function name)
  consentRequired?: boolean | (() => boolean) | string // If true, consent is required before using cookies/localStorage
  consentGranted?: boolean | (() => boolean) | string // If true, consent has been granted (only relevant if consentRequired is true)
  locale?: WidgetLocale | string
}

export interface WidgetConfig extends WidgetProps {
  container?: string | HTMLElement
  hasConsent?: boolean | (() => boolean) | string // If string, it's a global variable/function name to check
  throwOnMissingConsent?: boolean // If true, throws an error when consent is not granted. Default: false (returns a no-op instance)
}

export interface WidgetInstance {
  open: () => void
  close: () => void
  toggle: () => void
  sendMessage: (content: string) => Promise<void>
  hide: () => void // Hide the floating action button
  show: () => void // Show the floating action button
  openChatDirectly: () => void // Open chat view directly, skipping home view
  // Prop setters (override props and other sources)
  setDarkMode: (isDark: boolean) => void
  setConsentRequired: (required: boolean) => void
  setConsentGranted: (granted: boolean) => void
  setPosition: (position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') => void
  setWidth: (width: number) => void
  setHeight: (height: number) => void
  setTop: (top: number | undefined) => void
  setRight: (right: number | undefined) => void
  setBottom: (bottom: number | undefined) => void
  setLeft: (left: number | undefined) => void
  setFabSize: (size: number) => void
  setActions: (actions: WidgetAction[]) => void
  setUserName: (name: string | undefined) => void
  setUserEmail: (email: string | undefined) => void
  setUserId: (id: string | undefined) => void
  setLocale: (locale: WidgetLocale | string | undefined) => void
  destroy: () => void
}
