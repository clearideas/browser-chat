<script setup lang="ts">
import 'tippy.js/dist/tippy.css'

import tippy from 'tippy.js'
import type { CSSProperties } from 'vue'
import { computed, nextTick, onMounted, onUnmounted, ref, unref, watch } from 'vue'

import ChatInput from './components/ChatInput.vue'
import ChatMessageComponent from './components/ChatMessage.vue'
import RealtimeVoiceView from './components/RealtimeVoiceView.vue'
import WidgetFAB from './components/WidgetFAB.vue'
import WidgetHeader from './components/WidgetHeader.vue'
import WidgetHomeView from './components/WidgetHomeView.vue'
import { useAudioPlayback } from './composables/useAudioPlayback'
import { useRealtimeVoice } from './composables/useRealtimeVoice'
import { useVoiceRecording } from './composables/useVoiceRecording'
import {
  setWidgetLocale,
  startWidgetLocaleTracking,
  stopWidgetLocaleTracking,
  useWidgetI18n,
} from './i18n/runtime'
import { icons } from './icons'
import type {
  ChatMessage,
  InitResponse,
  SessionActivationResponse,
  StreamEvent,
  WidgetAction,
  WidgetProps,
} from './types'
import { debugLog, debugWarn } from './utils/debug'
import {
  trackRealtimeTranscriptMessage,
  upsertRealtimeTranscriptMessage,
} from './utils/realtimeTranscript'

// Log immediately when component script loads
console.log('[ClearIdeasWidget] Component script loaded')

// Helper function to wrap icon path in SVG tag
function getIconSVG(iconName: keyof typeof icons, size: number = 16): string {
  const iconPath = icons[iconName]
  if (!iconPath) return ''
  // Determine viewBox based on icon
  let viewBox = '0 0 640 640' // default
  if (iconName === 'ciIcon') {
    viewBox = '0 0 512 512'
  } else if (iconName === 'chevronRight' || iconName === 'chevronLeft') {
    viewBox = '0 0 640 640'
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" fill="currentColor">${iconPath}</svg>`
}

const props = withDefaults(defineProps<WidgetProps>(), {
  openOnLoad: false,
  position: 'bottom-right',
  width: 380,
  height: 540,
  fabHide: false,
  consentRequired: false,
  consentGranted: false,
  locale: undefined,
})
const { locale: widgetLocale, t } = useWidgetI18n()

// Container ref for click handlers and tippy initialization
const messageContentContainer = ref<HTMLElement | null>(null)

// Button refs for tooltip initialization
const voiceBtnRef = ref<HTMLElement | null>(null)
const sendBtnRef = ref<HTMLElement | null>(null)
const cancelBtnRef = ref<HTMLElement | null>(null)
const acceptBtnRef = ref<HTMLElement | null>(null)
const backBtnRef = ref<HTMLElement | null>(null)
const closeBtnRef = ref<HTMLElement | null>(null)
const newChatBtnRef = ref<HTMLElement | null>(null)
const fabBtnRef = ref<HTMLElement | null>(null)
const audioBtnRefs = ref<Map<number, HTMLElement>>(new Map())
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null)

// Store tippy instances to avoid recreating them
const tippyInstances = ref<Map<HTMLElement, any>>(new Map())

// Local state for public chat
const messages = ref<ChatMessage[]>([])
const loading = ref<boolean>(false)
const error = ref<string | null>(null)
const chatId = ref<string | null>(null)
const chatName = ref<string>('')
const isOpen = ref<boolean>(false)
const shouldFocusInput = ref<boolean>(false)
const currentView = ref<'home' | 'chat'>('home')
const realtimeVoiceModeOpen = ref(false)
const realtimeUserHasSpoken = ref(false)
const realtimeTranscriptMessages = new Map<string, ChatMessage>()

// Init data from API
const initData = ref<InitResponse | null>(null)
const loadingInit = ref<boolean>(false)

// Track if this is a new chat (existing chat is loaded during session activation, not init)
// The initial greeting should persist for new chats until chat state changes
const isNewChat = ref<boolean>(true)

// Session ID for user tracking (fallback when cookies are blocked)
const sessionId = ref<string | null>(null)
const hasCompletedInitialInitLoad = ref(false)
const activatedSessionId = ref<string | null>(null)
const openRequestToken = ref(0)

// Hello bubble state
const isHelloBubbleVisible = ref(false)
const helloBubbleText = ref('')
const helloBubbleTimeoutId = ref<number | null>(null)
const HELLO_BUBBLE_STORAGE_KEY = 'clearideas_hello_bubble_shown'

// Disclaimer dialog state
const showDisclaimerDialog = ref<boolean>(false)
const disclaimerDialogScrolledToBottom = ref<boolean>(false)
const disclaimerDialogHasScrolled = ref<boolean>(false)
const disclaimerDialogContentRef = ref<HTMLElement | null>(null)
const DISCLAIMER_DIALOG_STORAGE_KEY = 'clearideas_disclaimer_dialog_dismissed'

/**
 * Helper function to resolve a consent prop value (supports boolean, function, or string)
 * Used within computed properties so Vue can track reactivity automatically
 *
 * @param propValue - The consent value, which can be:
 *   - boolean: Direct boolean value (reactive if prop is reactive)
 *   - function: Function that returns boolean (Vue tracks refs/computed accessed inside)
 *   - string: Name of a global variable/ref/computed on window object
 *     - If the global is a function, it will be called
 *     - If the global is a ref/computed (has .value), .value will be accessed (Vue tracks this)
 *     - If the global is a plain variable, its current value is returned (not reactive)
 *   - undefined: Falls back to defaultValue
 * @param defaultValue - Default value to return if propValue is undefined
 * @returns The resolved boolean value
 *
 * Note: When using string prop names for global variables:
 * - Reactive refs/computed will be tracked by Vue when .value is accessed
 * - Plain variables will return their current value but won't be reactive
 * - Functions will be called and any side effects will execute
 */
function resolveConsentValue(
  propValue: boolean | (() => boolean) | string | undefined,
  defaultValue: boolean = false,
): boolean {
  if (propValue === undefined) {
    return defaultValue
  }
  if (typeof propValue === 'boolean') {
    return propValue
  }
  if (typeof propValue === 'function') {
    // Vue will track any refs/computed accessed inside this function
    return propValue()
  }
  if (typeof propValue === 'string') {
    // For string props (global variables), check if it's a ref/computed
    if (typeof window !== 'undefined') {
      const globalValue = (window as any)[propValue]
      if (typeof globalValue === 'function') {
        return globalValue()
      }
      // If it's a ref/computed, Vue will track it when we access .value
      if (globalValue && typeof globalValue === 'object' && 'value' in globalValue) {
        return Boolean(globalValue.value)
      }
      return Boolean(globalValue)
    }
  }
  return defaultValue
}

// Internal prop overrides (set via setter methods)
// MUST be declared before computed properties that reference them to avoid temporal dead zone issues
const darkModeOverride = ref<boolean | undefined>(undefined)
const consentRequiredOverride = ref<boolean | undefined>(undefined)
const consentGrantedOverride = ref<boolean | undefined>(undefined)
const positionOverride = ref<string | undefined>(undefined)
const widthOverride = ref<number | undefined>(undefined)
const heightOverride = ref<number | undefined>(undefined)
const topOverride = ref<number | undefined>(undefined)
const rightOverride = ref<number | undefined>(undefined)
const bottomOverride = ref<number | undefined>(undefined)
const leftOverride = ref<number | undefined>(undefined)
const fabSizeOverride = ref<number | undefined>(undefined)
const actionsOverride = ref<WidgetAction[] | undefined>(undefined)
const userNameOverride = ref<string | undefined>(undefined)
const userEmailOverride = ref<string | undefined>(undefined)
const userIdOverride = ref<string | undefined>(undefined)
const localeOverride = ref<string | undefined>(undefined)

const resolvedLocale = computed(() => localeOverride.value ?? props.locale)

// GDPR consent management computed properties
// Using computed ensures Vue tracks reactivity automatically when functions access refs/computed
const resolvedConsentRequired = computed(() => {
  if (consentRequiredOverride.value !== undefined) {
    return consentRequiredOverride.value
  }
  return resolveConsentValue(props.consentRequired, false)
})
const resolvedConsentGranted = computed(() => {
  if (consentGrantedOverride.value !== undefined) {
    return consentGrantedOverride.value
  }
  return resolveConsentValue(props.consentGranted, false)
})

const shouldUsePersistentStorage = computed(() => {
  // Use localStorage if consent is not required OR consent has been granted
  return !resolvedConsentRequired.value || resolvedConsentGranted.value
})

const shouldIncludeCredentials = computed(() => {
  // Include credentials if consent is not required OR consent has been granted
  return !resolvedConsentRequired.value || resolvedConsentGranted.value
})

const consentStatus = computed<'granted' | 'not-required' | 'pending'>(() => {
  if (!resolvedConsentRequired.value) {
    return 'not-required'
  }
  if (resolvedConsentGranted.value) {
    return 'granted'
  }
  return 'pending'
})

// Helper function to get the appropriate storage based on consent state
function getStorage(): Storage {
  if (typeof window === 'undefined') {
    // Fallback for SSR - return a mock storage that properly implements Storage interface
    // Use an in-memory storage object for SSR
    const storage: Record<string, string> = {}
    return {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, value: string) => {
        storage[key] = value
      },
      removeItem: (key: string) => {
        delete storage[key]
      },
      clear: () => {
        Object.keys(storage).forEach(key => delete storage[key])
      },
      get length() {
        return Object.keys(storage).length
      },
      key: (index: number) => {
        const keys = Object.keys(storage)
        return keys[index] || null
      },
    } as Storage
  }
  return shouldUsePersistentStorage.value ? localStorage : sessionStorage
}

// Helper function to get sessionId from storage, respecting consent state
function getStoredSessionId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  // Respect consent state: use appropriate storage based on shouldUsePersistentStorage
  if (shouldUsePersistentStorage.value) {
    // Prefer localStorage, fallback to sessionStorage
    const fromLocalStorage = localStorage.getItem('clearideasPublicChatSessionId')
    if (fromLocalStorage) {
      return fromLocalStorage
    }
    return sessionStorage.getItem('clearideasPublicChatSessionId')
  } else {
    // Consent not granted: only use sessionStorage, ignore localStorage
    return sessionStorage.getItem('clearideasPublicChatSessionId')
  }
}

// Cache key for init data in sessionStorage
const INIT_DATA_CACHE_KEY = 'clearideasPublicChatInitData'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CachedInitData {
  data: InitResponse
  timestamp: string // ISO timestamp
  consentStatus: 'granted' | 'not-required' | 'pending'
  locale: string
  sessionId?: string
}

// Get cached init data from storage (checks both localStorage and sessionStorage)
// This ensures cache hits even if consent state changed between cache write and read
function getCachedInitData(): CachedInitData | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    // First check current storage (based on consent state)
    const storage = getStorage()
    let cached = storage.getItem(INIT_DATA_CACHE_KEY)
    if (cached) {
      return JSON.parse(cached) as CachedInitData
    }
    // If not found in current storage, check the other storage
    // This handles cases where consent state changed after caching
    const otherStorage = storage === localStorage ? sessionStorage : localStorage
    cached = otherStorage.getItem(INIT_DATA_CACHE_KEY)
    if (cached) {
      debugLog('[ClearIdeasWidget] Found cached init data in alternate storage')
      return JSON.parse(cached) as CachedInitData
    }
    return null
  } catch (err) {
    debugLog('[ClearIdeasWidget] Failed to parse cached init data:', err)
    return null
  }
}

// Store init data in storage (respects consent state) with timestamp and consent status
function setCachedInitData(data: InitResponse): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const cachedSessionId = sessionId.value || getStoredSessionId() || undefined
    const cached: CachedInitData = {
      data,
      timestamp: new Date().toISOString(),
      consentStatus: consentStatus.value,
      locale: widgetLocale.value,
      ...(cachedSessionId ? { sessionId: cachedSessionId } : {}),
    }
    const storage = getStorage()
    storage.setItem(INIT_DATA_CACHE_KEY, JSON.stringify(cached))
    debugLog(
      `[ClearIdeasWidget] Cached init data in ${shouldUsePersistentStorage.value ? 'localStorage' : 'sessionStorage'}`,
    )
  } catch (err) {
    // Handle storage quota errors gracefully (fallback to API call)
    debugWarn('[ClearIdeasWidget] Failed to cache init data (storage quota exceeded?):', err)
  }
}

// Check if cached data is stale (>5 minutes old)
function isCachedDataStale(cached: CachedInitData): boolean {
  try {
    const cachedTime = new Date(cached.timestamp).getTime()
    // Explicitly check for invalid timestamp - NaN indicates invalid date
    if (isNaN(cachedTime)) {
      debugLog('[ClearIdeasWidget] Invalid timestamp in cache, treating as stale')
      return true
    }
    const now = Date.now()
    const age = now - cachedTime
    return age > CACHE_TTL_MS
  } catch (err) {
    debugLog('[ClearIdeasWidget] Failed to check cache staleness:', err)
    return true // Consider stale if we can't parse timestamp
  }
}

// Clear cached init data from storage (checks both localStorage and sessionStorage)
function clearCachedInitData(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    // Clear from both storages to handle consent state changes
    localStorage.removeItem(INIT_DATA_CACHE_KEY)
    sessionStorage.removeItem(INIT_DATA_CACHE_KEY)
    debugLog('[ClearIdeasWidget] Cleared cached init data')
  } catch (err) {
    debugWarn('[ClearIdeasWidget] Failed to clear cached init data:', err)
  }
}

function clearStoredSessionId(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.removeItem('clearideasPublicChatSessionId')
    sessionStorage.removeItem('clearideasPublicChatSessionId')
    debugLog('[ClearIdeasWidget] Cleared stored session ID')
  } catch (err) {
    debugWarn('[ClearIdeasWidget] Failed to clear stored session ID:', err)
  }
}

function resetChatStateForLocaleChange() {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }

  stopAllAudio()
  audioBtnRefs.value.clear()
  messageAudioState.value.clear()
  sessionId.value = null
  chatId.value = null
  chatName.value = ''
  messages.value = []
  loading.value = false
  error.value = null
  streamingContent.value = ''
  streamingAssistantIndex.value = -1
  isNewChat.value = true
  activatedSessionId.value = null
}

function mapPublicChatMessages(
  existingMessages: NonNullable<SessionActivationResponse['existingChat']>['messages'],
): ChatMessage[] {
  return existingMessages.map(msg => {
    let createdAt = new Date()
    if (msg.createdAt) {
      const parsed = new Date(msg.createdAt)
      if (!isNaN(parsed.getTime())) {
        createdAt = parsed
      }
    }

    return {
      role: msg.role || 'assistant',
      content: msg.content || '',
      createdAt,
    }
  })
}

function applyExistingChat(existingChat?: SessionActivationResponse['existingChat']): void {
  if (!existingChat) {
    chatId.value = null
    messages.value = []
    isNewChat.value = true
    return
  }

  chatId.value = existingChat.chatId
  messages.value = Array.isArray(existingChat.messages)
    ? mapPublicChatMessages(existingChat.messages)
    : []
  isNewChat.value = false
}

// Detect dark mode (checks multiple sources: prop, server init data, parent page, system preference)
// Uses computed to automatically track reactivity - if prop is a function that accesses refs/computed,
// Vue will track those dependencies automatically
const isDarkMode = computed(() => {
  // Check internal override first (set via setDarkMode method)
  if (darkModeOverride.value !== undefined) {
    return darkModeOverride.value
  }

  // Check prop (supports boolean, function, or string)
  // Vue automatically tracks reactivity when function/computed is called within computed
  if (props.darkMode !== undefined) {
    if (typeof props.darkMode === 'boolean') {
      return props.darkMode
    }
    if (typeof props.darkMode === 'function') {
      // Vue will track any refs/computed accessed inside this function
      return props.darkMode()
    }
    if (typeof props.darkMode === 'string') {
      // For string props (global variables), we need to check if it's a ref/computed
      // Otherwise fall back to direct access (not reactive, but efficient)
      if (typeof window !== 'undefined') {
        const globalValue = (window as any)[props.darkMode]
        if (typeof globalValue === 'function') {
          return globalValue()
        }
        // If it's a ref/computed, Vue will track it when we access .value
        if (globalValue && typeof globalValue === 'object' && 'value' in globalValue) {
          return Boolean(globalValue.value)
        }
        return Boolean(globalValue)
      }
    }
  }

  // Check server init data
  if (initData.value?.style?.mode === 'dark') return true
  if (initData.value?.style?.mode === 'light') return false

  // Check system preference or parent theme
  if (typeof window !== 'undefined') {
    const root = document.documentElement
    const hasDarkTheme =
      root.hasAttribute('data-theme') && root.getAttribute('data-theme') === 'dark'
    const hasDarkClass = root.classList.contains('dark')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    return hasDarkTheme || hasDarkClass || (initData.value?.style?.mode === 'system' && prefersDark)
  }
  return false
})

// Streaming state
const streamingContent = ref<string>('')
const streamingAssistantIndex = ref<number>(-1)
const abortController = ref<AbortController | null>(null)

// Chat input state (inlined from ConsumerChatInput)
const chatInputContent = ref<string>('')
const chatInputFocused = ref<boolean>(false)
const chatInputExpanded = computed(
  () => chatInputFocused.value || chatInputContent.value.length > 0,
)

// Use audio playback composable (basic playback functions)
const {
  messageAudioState,
  playMessageAudio,
  toggleMessageAudio,
  setMessageAudioTime,
  getMessageAudioProgress,
  stopAllAudio,
  isMessageAudioPlaying,
} = useAudioPlayback()

// Progressive audio playback state (kept in main component - tightly coupled with streaming)
// Note: messageAudioState is shared between composable and progressive playback logic

// Voice enabled computed (from server init data only)
// Note: Voice is controlled by server-side init data, not by component props.
// This ensures voice capabilities match what the server supports.
const voiceEnabled = computed(() => {
  return initData.value?.voiceEnabled || initData.value?.voice?.enabled || false
})

// Max recording duration computed
const maxRecordingDuration = computed(() => {
  // Get from initData.voice.maxAudioDuration when available in API response
  // For now, default to 60 seconds
  return 60 // Default 60 seconds
})

// Calculate number of waveform bars based on container width
const waveformBars = ref<number>(25)

// Watch for waveformBars from ChatInput component
watch(
  () => {
    const exposed = chatInputRef.value?.waveformBars
    // waveformBars is exposed as a Ref, so we need to unwrap it
    // Use unref to safely unwrap if it's a Ref, otherwise return as-is
    return exposed !== undefined ? unref(exposed as any) : undefined
  },
  newBars => {
    if (newBars !== undefined) {
      waveformBars.value = newBars
    }
  },
  { immediate: true },
)

// Use voice recording composable
const {
  isRecording,
  recordingDuration,
  waveformData,
  supportsVoiceRecording,
  startRecording: startVoiceRecording,
  stopRecordingAndSend,
  cancelRecording,
  cleanupRecording: cleanupVoiceRecording,
} = useVoiceRecording(
  maxRecordingDuration,
  async (audioBase64: string, format: string) => {
    await sendVoiceMessage(audioBase64, format)
  },
  (errorMsg: string) => {
    error.value = errorMsg
  },
  waveformBars,
)

// Markdown formatting is now in utils/markdown.ts

// Get API base URL - use prop if provided, otherwise use default from Vite env
// VITE_API_BASE_URL is replaced at build time via vite.config.ts define option
const DEFAULT_API_BASE_URL = __VITE_API_BASE_URL__ || 'https://api.clearideas.com'

const apiUrl = computed(() => {
  const base = props.apiBaseUrl || DEFAULT_API_BASE_URL
  if (!base) {
    console.error(
      '[ClearIdeasWidget] apiBaseUrl is required. Provide it via prop or set VITE_API_BASE_URL at build time.',
    )
    return ''
  }
  return base.replace(/\/+$/, '')
})

// Native speech-to-speech voice. The browser sends audio over WebRTC while the
// API owns the OpenAI session and sideband tool execution. If session creation
// is unavailable, startRecording falls back to the existing recorded flow.
const {
  connectionState: realtimeVoiceConnectionState,
  isActive: realtimeVoiceActive,
  isResponding: realtimeVoiceResponding,
  isMuted: realtimeVoiceMuted,
  liveUserTranscript: realtimeLiveUserTranscript,
  recordingDuration: realtimeRecordingDuration,
  waveformData: realtimeWaveformData,
  supportsRealtimeVoice,
  connect: connectRealtimeVoice,
  toggleMuted: toggleRealtimeMuted,
  disconnect: disconnectRealtimeVoice,
} = useRealtimeVoice({
  apiUrl,
  accessKey: computed(() => props.accessKey),
  chatId,
  publicSessionId: sessionId,
  locale: widgetLocale,
  includeCredentials: shouldIncludeCredentials,
  waveformBars,
  onChatId: id => {
    chatId.value = id
  },
  onUserTranscript: (transcript, identity) => {
    if (transcript.trim()) realtimeUserHasSpoken.value = true
    upsertRealtimeTranscriptMessage(messages.value, realtimeTranscriptMessages, identity, {
      role: 'user',
      content: transcript,
      createdAt: new Date(),
    })
    clearCachedInitData()
  },
  onAssistantTranscriptDelta: (delta, identity) => {
    if (streamingAssistantIndex.value < 0) {
      messages.value.push({ role: 'assistant', content: '', createdAt: new Date() })
      streamingAssistantIndex.value = messages.value.length - 1
      streamingContent.value = ''
    }
    streamingContent.value += delta
    const streamingMessage = messages.value[streamingAssistantIndex.value]
    streamingMessage.content = streamingContent.value
    trackRealtimeTranscriptMessage(realtimeTranscriptMessages, identity, streamingMessage)
  },
  onAssistantTranscriptDone: (transcript, identity) => {
    if (streamingAssistantIndex.value < 0) {
      upsertRealtimeTranscriptMessage(messages.value, realtimeTranscriptMessages, identity, {
        role: 'assistant',
        content: transcript,
        createdAt: new Date(),
      })
    } else {
      const streamingMessage = messages.value[streamingAssistantIndex.value]
      streamingMessage.content = transcript
      trackRealtimeTranscriptMessage(realtimeTranscriptMessages, identity, streamingMessage)
    }
    streamingAssistantIndex.value = -1
    streamingContent.value = ''
  },
  onError: message => {
    error.value = message
  },
})

const supportsAnyVoice = computed(() => supportsRealtimeVoice.value || supportsVoiceRecording.value)
const voiceInputActive = computed(() => realtimeVoiceActive.value || isRecording.value)
const voiceInputDuration = computed(() =>
  realtimeVoiceActive.value ? realtimeRecordingDuration.value : recordingDuration.value,
)
const voiceInputWaveform = computed(() =>
  realtimeVoiceActive.value ? realtimeWaveformData.value : waveformData.value,
)
const realtimeVoiceCaption = computed(() => {
  if (realtimeLiveUserTranscript.value) return realtimeLiveUserTranscript.value
  const lastMessage = messages.value[messages.value.length - 1]
  return lastMessage?.content || initData.value?.initialMessage || ''
})

// Computed properties for widget configuration
const widgetColor = computed(() => {
  // If uninitialized (initData is null), return grey based on dark mode
  if (!initData.value) {
    return isDarkMode.value ? '#4a4a4a' : '#c0c0c0'
  }

  if (initData.value?.style?.color) {
    return initData.value.style.color
  }
  if (typeof window !== 'undefined' && document?.documentElement) {
    const cssValue = getComputedStyle(document.documentElement)
      .getPropertyValue('--ci-widget-feature')
      .trim()
    if (cssValue) {
      return cssValue.includes(',') ? `rgb(${cssValue})` : cssValue
    }
  }
  return '#ED613F'
})

const widgetLinks = computed(() => {
  // If actionsOverride is set, use that (set via setActions() method)
  if (actionsOverride.value !== undefined) {
    return actionsOverride.value
  }

  // Actions/links come only from server initData
  // Always include chat action first (with fallback if initData not loaded yet)
  const chatAction: WidgetAction = {
    id: 'chat',
    title: initData.value?.chatName
      ? `Chat with ${initData.value.chatName}`
      : 'Chat with AI Assistant',
    description: initData.value?.chatTagline || 'Ask questions and get help',
    type: 'chat',
    icon: 'sparkles',
  }

  // Process links from initData
  const linkActions: WidgetAction[] = []
  if (initData.value?.links && initData.value.links.length > 0) {
    initData.value.links.forEach(
      (link: NonNullable<InitResponse['links']>[number], index: number) => {
        linkActions.push({
          id: `link-${index}`,
          title: link.title,
          description: link.description || '',
          type: 'link' as const,
          url: link.url,
        })
      },
    )
  }

  return [chatAction, ...linkActions]
})

const widgetChatName = computed(() => {
  return initData.value?.chatName || chatName.value || 'Clear Ideas™ Assistant'
})

// Helper to adjust color lightness
function adjustColorLightness(color: string, amount: number): string {
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      const r = Math.max(0, Math.min(255, parseInt(match[1]) + amount))
      const g = Math.max(0, Math.min(255, parseInt(match[2]) + amount))
      const b = Math.max(0, Math.min(255, parseInt(match[3]) + amount))
      return `rgb(${r}, ${g}, ${b})`
    }
  }
  if (color.startsWith('#')) {
    const cleanHex = color.replace('#', '')
    const r = parseInt(
      cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.substring(0, 2),
      16,
    )
    const g = parseInt(
      cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.substring(2, 4),
      16,
    )
    const b = parseInt(
      cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.substring(4, 6),
      16,
    )
    const newR = Math.max(0, Math.min(255, r + amount))
    const newG = Math.max(0, Math.min(255, g + amount))
    const newB = Math.max(0, Math.min(255, b + amount))
    return `rgb(${newR}, ${newG}, ${newB})`
  }
  return color
}

const widgetColorLight = computed(() => adjustColorLightness(widgetColor.value, 30))
const widgetColorDark = computed(() => adjustColorLightness(widgetColor.value, -20))
const widgetColorBase = computed(() => {
  const color = widgetColor.value
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      return `rgb(${match[1]}, ${match[2]}, ${match[3]})`
    }
  }
  if (color.startsWith('#')) {
    const cleanHex = color.replace('#', '')
    const r = parseInt(
      cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.substring(0, 2),
      16,
    )
    const g = parseInt(
      cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.substring(2, 4),
      16,
    )
    const b = parseInt(
      cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.substring(4, 6),
      16,
    )
    return `rgb(${r}, ${g}, ${b})`
  }
  return color
})

// Calculate relative luminance for contrast calculation
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(val => {
    val = val / 255
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

// Get RGB values from color string
function getRgbFromColor(color: string): { r: number; g: number; b: number } | null {
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
      }
    }
  }
  if (color.startsWith('#')) {
    const cleanHex = color.replace('#', '')
    const r = parseInt(
      cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.substring(0, 2),
      16,
    )
    const g = parseInt(
      cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.substring(2, 4),
      16,
    )
    const b = parseInt(
      cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.substring(4, 6),
      16,
    )
    return { r, g, b }
  }
  return null
}

// Convert hex color to rgba string
function hexToRgba(hex: string, alpha: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '')

  // Handle 3-digit hex
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16)
    const g = parseInt(cleanHex[1] + cleanHex[1], 16)
    const b = parseInt(cleanHex[2] + cleanHex[2], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  // Handle 6-digit hex
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Determine if we should use white or black text based on background color contrast
const headerContrastColor = computed(() => {
  const rgb = getRgbFromColor(widgetColorBase.value)
  if (!rgb) {
    return 'rgb(33, 33, 33)' // Default to dark text
  }
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b)
  // If luminance is above 0.5, use black text, otherwise use white
  return luminance > 0.5 ? 'rgb(33, 33, 33)' : 'rgb(255, 255, 255)'
})

// Audio context - needs to be created after user interaction
let audioContext: AudioContext | null = null
let audioContextInitialized = false

// Initialize audio context (must be called after user interaction)
function initAudioContext() {
  if (!audioContext && !audioContextInitialized) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextInitialized = true
      debugLog('[ClearIdeasWidget] Audio context initialized')
    } catch (err) {
      debugWarn('[ClearIdeasWidget] Failed to create audio context:', err)
      audioContextInitialized = true // Mark as attempted to avoid repeated failures
    }
  }
  return audioContext
}

// Initialize audio context on any user interaction with the page
// This allows the hello bubble sound to play even if user hasn't clicked the widget yet
function initAudioContextOnInteraction() {
  if (audioContextInitialized) return

  const events = ['click', 'touchstart', 'keydown']
  const initOnce = () => {
    initAudioContext()
    // Remove listeners after first interaction
    events.forEach(event => {
      document.removeEventListener(event, initOnce, { capture: true })
    })
  }

  events.forEach(event => {
    document.addEventListener(event, initOnce, { capture: true, once: true })
  })
}

// Play a pleasant notification sound using Web Audio API
async function playHelloBubbleSound() {
  try {
    // Initialize audio context if not already created
    const ctx = initAudioContext()
    if (!ctx) {
      debugLog('[ClearIdeasWidget] Audio context not available')
      return
    }

    // Resume audio context if suspended (required after user interaction)
    // Wait for it to be ready before playing
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
        debugLog('[ClearIdeasWidget] Audio context resumed')
      } catch (err) {
        debugWarn('[ClearIdeasWidget] Failed to resume audio context:', err)
        return
      }
    }

    // Small delay to ensure context is fully ready
    await new Promise(resolve => setTimeout(resolve, 50))

    // Create a more musical sound with multiple frequencies
    const frequencies = [523.25, 659.25, 783.99] // C5, E5, G5 - a pleasant C major chord
    const duration = 0.3

    frequencies.forEach((freq, index) => {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = freq
      oscillator.type = 'sine'

      // Stagger the start times slightly for a more musical effect
      const startTime = ctx.currentTime + index * 0.05
      const volume = index === 0 ? 0.25 : 0.18 // First note slightly louder

      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.05)
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration)

      oscillator.start(startTime)
      oscillator.stop(startTime + duration)
    })

    debugLog('[ClearIdeasWidget] Hello bubble sound played')
  } catch (err) {
    debugWarn('[ClearIdeasWidget] Failed to play hello bubble sound:', err)
    // Silently fail - sound is optional
  }
}

// Check if hello bubble was already shown
function hasHelloBubbleBeenShown(): boolean {
  try {
    const storage = getStorage()
    return storage.getItem(HELLO_BUBBLE_STORAGE_KEY) === 'true'
  } catch (err) {
    debugWarn('[ClearIdeasWidget] Failed to check hello bubble shown status:', err)
    return false
  }
}

// Mark hello bubble as shown
function markHelloBubbleAsShown() {
  try {
    const storage = getStorage()
    storage.setItem(HELLO_BUBBLE_STORAGE_KEY, 'true')
  } catch (err) {
    debugWarn('[ClearIdeasWidget] Failed to mark hello bubble as shown:', err)
  }
}

// Show hello bubble on FAB
function showHelloBubble() {
  if (!fabBtnRef.value || !initData.value) {
    debugLog('[ClearIdeasWidget] Hello bubble: FAB or initData not available')
    return
  }

  // Check if already shown
  if (hasHelloBubbleBeenShown()) {
    debugLog('[ClearIdeasWidget] Hello bubble already shown, skipping')
    return
  }

  // Check if enabled
  if (!initData.value.helloBubbleEnabled) {
    debugLog('[ClearIdeasWidget] Hello bubble: not enabled')
    return
  }

  // Get text (use default if not provided)
  const bubbleText =
    initData.value.helloBubbleText?.trim() ||
    `Hi! I'm ${initData.value.chatName || 'here'}. Ask me anything and I'll help you!`

  debugLog('[ClearIdeasWidget] Hello bubble check:', {
    enabled: initData.value.helloBubbleEnabled,
    hasText: !!initData.value.helloBubbleText,
    text: initData.value.helloBubbleText,
    bubbleText,
    delay: initData.value.helloBubbleDelay,
  })

  // Get delay (default 5 seconds)
  const delay = (initData.value.helloBubbleDelay ?? 5) * 1000

  // Clear any existing timeout
  if (helloBubbleTimeoutId.value !== null) {
    clearTimeout(helloBubbleTimeoutId.value)
  }

  // Set timeout to show bubble after delay
  helloBubbleTimeoutId.value = window.setTimeout(() => {
    if (!fabBtnRef.value || !initData.value) return

    // Check again if already shown (in case user interacted while waiting)
    if (hasHelloBubbleBeenShown()) {
      return
    }

    // Get text again (use default if not provided)
    const bubbleText =
      initData.value.helloBubbleText?.trim() ||
      `Hi! I'm ${initData.value.chatName || 'here'}. Ask me anything and I'll help you!`

    // Set bubble text and show it
    helloBubbleText.value = bubbleText
    isHelloBubbleVisible.value = true

    // Play sound when bubble appears (don't await - let it play in background)
    playHelloBubbleSound().catch(err => {
      debugWarn('[ClearIdeasWidget] Sound playback failed:', err)
    })

    // Mark as shown
    markHelloBubbleAsShown()

    // Auto-hide after 15 seconds
    setTimeout(() => {
      hideHelloBubble()
    }, 15000)
  }, delay)
}

// Hide hello bubble
function hideHelloBubble() {
  isHelloBubbleVisible.value = false
  // Clear timeout if it exists
  if (helloBubbleTimeoutId.value !== null) {
    clearTimeout(helloBubbleTimeoutId.value)
    helloBubbleTimeoutId.value = null
  }
  // Clear text after animation completes
  setTimeout(() => {
    if (!isHelloBubbleVisible.value) {
      helloBubbleText.value = ''
    }
  }, 300)
}

// Check if disclaimer dialog was already dismissed
function hasDisclaimerDialogBeenDismissed(): boolean {
  try {
    const storage = getStorage()
    return storage.getItem(DISCLAIMER_DIALOG_STORAGE_KEY) === 'true'
  } catch (err) {
    debugWarn('[ClearIdeasWidget] Failed to check disclaimer dialog dismissed status:', err)
    return false
  }
}

// Mark disclaimer dialog as dismissed
function markDisclaimerDialogAsDismissed() {
  try {
    const storage = getStorage()
    storage.setItem(DISCLAIMER_DIALOG_STORAGE_KEY, 'true')
  } catch (err) {
    debugWarn('[ClearIdeasWidget] Failed to mark disclaimer dialog as dismissed:', err)
  }
}

// Show disclaimer dialog if enabled and not already dismissed
// Only show when on chat view
function checkAndShowDisclaimerDialog() {
  if (!initData.value) return

  // Only show on chat view, not home view
  if (currentView.value !== 'chat') {
    return
  }

  // Check if enabled and text exists
  if (!initData.value.disclaimerDialogEnabled || !initData.value.disclaimerDialogText) {
    return
  }

  // Check if already dismissed
  if (hasDisclaimerDialogBeenDismissed()) {
    return
  }

  // Show dialog
  showDisclaimerDialog.value = true
  // Check scroll position after dialog is rendered
  nextTick(() => {
    checkDisclaimerDialogScroll()
  })
}

// Dismiss disclaimer dialog
function dismissDisclaimerDialog() {
  showDisclaimerDialog.value = false
  markDisclaimerDialogAsDismissed()
  // Reset scroll state
  disclaimerDialogScrolledToBottom.value = false
  disclaimerDialogHasScrolled.value = false
}

// Check if disclaimer dialog content is scrolled to bottom
function checkDisclaimerDialogScroll() {
  if (!disclaimerDialogContentRef.value) return

  const element = disclaimerDialogContentRef.value
  const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 5 // 5px threshold

  // Track if user has started scrolling
  if (element.scrollTop > 10) {
    disclaimerDialogHasScrolled.value = true
  }

  disclaimerDialogScrolledToBottom.value = isAtBottom
}

// Load initialization data from API
async function loadInitData() {
  if (!apiUrl.value || !props.accessKey) {
    console.warn('[ClearIdeasWidget] Cannot load init data: missing apiUrl or accessKey')
    return
  }

  // Always log that we're starting (so user knows widget is loading)
  console.log(
    '[ClearIdeasWidget] loadInitData() called - set window.__ClearIdeasWidgetDebug = true for detailed logs',
  )
  // Always log consent state - critical for debugging authenticated vs anonymous
  console.log('[ClearIdeasWidget] loadInitData() called with consent state', {
    consentRequired: resolvedConsentRequired.value,
    consentGranted: resolvedConsentGranted.value,
    consentStatus: consentStatus.value,
    shouldIncludeCredentials: shouldIncludeCredentials.value,
    shouldUsePersistentStorage: shouldUsePersistentStorage.value,
  })
  debugLog('[ClearIdeasWidget] loadInitData() called', {
    apiUrl: apiUrl.value,
    hasAccessKey: !!props.accessKey,
    currentInitData: initData.value ? 'exists' : 'null',
    sessionId: sessionId.value,
  })

  loadingInit.value = true
  try {
    // Check for existing session ID in both localStorage and sessionStorage
    const storedSessionId = getStoredSessionId()
    if (storedSessionId) {
      sessionId.value = storedSessionId
      debugLog('[ClearIdeasWidget] Restored session ID from storage:', storedSessionId)
    }

    // Check for cached init data before making API call
    const cached = getCachedInitData()
    if (cached) {
      // Validate cache: check if consent status matches and data is not stale
      const consentMatches = cached.consentStatus === consentStatus.value
      const localeMatches = cached.locale === widgetLocale.value
      const isStale = isCachedDataStale(cached)

      if (consentMatches && localeMatches && !isStale) {
        // Cache is valid - use cached data
        debugLog('[ClearIdeasWidget] Using cached init data', {
          age: Date.now() - new Date(cached.timestamp).getTime(),
          consentStatus: cached.consentStatus,
          locale: cached.locale,
        })
        console.log('[ClearIdeasWidget] Using cached init data (skipping API call)')
        initData.value = cached.data
        if (!sessionId.value && cached.sessionId) {
          sessionId.value = cached.sessionId
          try {
            const storage = getStorage()
            storage.setItem('clearideasPublicChatSessionId', cached.sessionId)
          } catch (err) {
            debugWarn('[ClearIdeasWidget] Failed to persist cached session ID:', err)
          }
        }

        // Process cached data same as API response
        if (cached.data.chatName) {
          chatName.value = cached.data.chatName
        }
        isNewChat.value = true

        loadingInit.value = false
        console.log('[ClearIdeasWidget] loadInitData() completed successfully (from cache)')
        debugLog('[ClearIdeasWidget] loadInitData() completed successfully (from cache)')

        // Trigger hello bubble if enabled (after nextTick to ensure FAB is mounted)
        // The bubble's own localStorage key controls whether it's shown, independent of init cache
        nextTick(() => {
          showHelloBubble()
        })

        return
      } else {
        // Cache invalid - clear it and fetch fresh data
        debugLog('[ClearIdeasWidget] Cache invalid', {
          consentMatches,
          localeMatches,
          isStale,
          cachedConsentStatus: cached.consentStatus,
          cachedLocale: cached.locale,
          currentLocale: widgetLocale.value,
          currentConsentStatus: consentStatus.value,
        })
        clearCachedInitData()
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${props.accessKey}`,
      'Accept-Language': widgetLocale.value,
      'x-clearideas-public-chat-consent-status': consentStatus.value,
    }

    // CRITICAL: Always include session ID if available (for session continuity)
    if (sessionId.value) {
      headers['x-clearideas-public-chat-session'] = sessionId.value
    }

    // Always log request details
    console.log('[ClearIdeasWidget] Fetching /init with headers:', {
      hasSessionId: !!headers['x-clearideas-public-chat-session'],
      consentStatus: headers['x-clearideas-public-chat-consent-status'],
      credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
    })
    debugLog('[ClearIdeasWidget] Fetching /init with headers:', {
      hasSessionId: !!headers['x-clearideas-public-chat-session'],
      consentStatus: headers['x-clearideas-public-chat-consent-status'],
    })

    // Use cache: "no-store" to bypass all caches and force a fresh request
    // This prevents 304 responses that might have empty bodies and cause initialization issues
    // When init() is called again (e.g., after login), the component is destroyed and recreated,
    // so we want fresh data, not cached responses
    const response = await fetch(`${apiUrl.value}/public/chat/init`, {
      method: 'GET',
      headers,
      credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
      cache: 'no-store', // Bypass cache entirely to ensure fresh response with body
    })

    // Extract headers for logging
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })
    // Always log response details - critical for debugging init issues
    console.log('[ClearIdeasWidget] /init response received', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: responseHeaders,
    })
    debugLog('[ClearIdeasWidget] /init response received', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: responseHeaders,
    })

    // Handle 304 Not Modified responses first - these typically have no body
    // With cache: 'no-store', 304 should be rare, but handle it as a safety net
    if (response.status === 304) {
      console.warn(
        '[ClearIdeasWidget] Received 304 Not Modified response (unexpected with cache: no-store)',
      )
      // For 304, check if we have valid cached data first before attempting to parse body
      const cached = getCachedInitData()
      if (cached) {
        const consentMatches = cached.consentStatus === consentStatus.value
        const localeMatches = cached.locale === widgetLocale.value
        const isStale = isCachedDataStale(cached)
        if (consentMatches && localeMatches && !isStale) {
          // Use cached data - 304 means nothing changed
          debugLog('[ClearIdeasWidget] Using cached data for 304 response')
          initData.value = cached.data
          if (!sessionId.value && cached.sessionId) {
            sessionId.value = cached.sessionId
            try {
              const storage = getStorage()
              storage.setItem('clearideasPublicChatSessionId', cached.sessionId)
            } catch (err) {
              debugWarn('[ClearIdeasWidget] Failed to persist cached session ID:', err)
            }
          }
          if (cached.data.chatName) {
            chatName.value = cached.data.chatName
          }
          isNewChat.value = true
          loadingInit.value = false

          // Trigger hello bubble if enabled (after nextTick to ensure FAB is mounted)
          // The bubble's own localStorage key controls whether it's shown, independent of init cache
          nextTick(() => {
            showHelloBubble()
          })

          return
        }
      }
      // No valid cache or cache is stale - fall through to retry logic below
    }

    // Allow other non-ok responses to be handled
    // 304 has response.ok === false, but we want to handle it specially above
    if (!response.ok && response.status !== 304) {
      console.warn('[ClearIdeasWidget] Init request failed:', response.status, response.statusText)
      // Clear cache on 401/403 (session expired)
      if (response.status === 401 || response.status === 403) {
        clearCachedInitData()
        debugLog('[ClearIdeasWidget] Cleared cache due to authentication error')
      }
      return
    }

    // Extract and store session ID from response header
    // Note: Custom headers must be exposed via CORS header: Access-Control-Expose-Headers: x-clearideas-public-chat-session-id
    const responseSessionId = response.headers.get('x-clearideas-public-chat-session-id')
    if (responseSessionId) {
      sessionId.value = responseSessionId
      if (typeof window !== 'undefined') {
        try {
          const storage = getStorage()
          storage.setItem('clearideasPublicChatSessionId', responseSessionId)
          debugLog(
            `[ClearIdeasWidget] Session ID stored in ${shouldUsePersistentStorage.value ? 'localStorage' : 'sessionStorage'}:`,
            responseSessionId,
          )
        } catch (err) {
          debugWarn('[ClearIdeasWidget] Failed to persist session ID from response:', err)
          // Continue - session ID is still set in memory
        }
      }
    } else {
      // Debug: Log available headers (only standard ones will be visible if CORS headers not exposed)
      const availableHeaders: string[] = []
      response.headers.forEach((_value, key) => {
        availableHeaders.push(key)
      })
      debugWarn(
        '[ClearIdeasWidget] No x-clearideas-public-chat-session-id header accessible in /init response.',
        'Available headers:',
        availableHeaders,
        'If header exists in raw response, server must expose it via Access-Control-Expose-Headers',
      )
    }

    // Handle 304 Not Modified responses - these may have empty bodies
    // With cache: 'no-store', 304 should be rare, but handle it as a safety net
    let data: InitResponse
    if (response.status === 304) {
      console.warn(
        '[ClearIdeasWidget] Received 304 Not Modified response (unexpected with cache: no-store)',
      )
      console.log('[ClearIdeasWidget] 304 response - attempting to parse body')
      // For 304, try to parse the response body (browser should provide cached body)
      // If parsing fails or body is empty, retry with cache: 'no-store' to force fresh data
      try {
        const text = await response.text()
        console.log('[ClearIdeasWidget] 304 response body length:', text.length)
        debugLog('[ClearIdeasWidget] 304 response body length:', text.length)
        if (text) {
          data = JSON.parse(text)
          console.log('[ClearIdeasWidget] Successfully parsed 304 response body')
          debugLog('[ClearIdeasWidget] Successfully parsed 304 response body')
        } else {
          // Empty body on 304 - retry with cache: 'no-store' to get fresh data
          console.warn(
            '[ClearIdeasWidget] Received 304 response with empty body. Retrying with cache bypass.',
          )
          const retryResponse = await fetch(`${apiUrl.value}/public/chat/init`, {
            method: 'GET',
            headers,
            credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
            cache: 'no-store',
          })
          debugLog('[ClearIdeasWidget] Retry response:', {
            status: retryResponse.status,
            ok: retryResponse.ok,
          })
          if (!retryResponse.ok) {
            console.warn(
              '[ClearIdeasWidget] Retry request failed:',
              retryResponse.status,
              retryResponse.statusText,
            )
            return
          }
          try {
            data = await retryResponse.json()
            debugLog('[ClearIdeasWidget] Successfully parsed retry response')
          } catch (retryParseError) {
            console.warn('[ClearIdeasWidget] Failed to parse retry response JSON:', retryParseError)
            return
          }
        }
      } catch (parseError) {
        // Failed to parse 304 response - retry with cache: 'no-store' to get fresh data
        console.warn(
          '[ClearIdeasWidget] Failed to parse 304 response body. Retrying with cache bypass.',
          parseError,
        )
        try {
          const retryResponse = await fetch(`${apiUrl.value}/public/chat/init`, {
            method: 'GET',
            headers,
            credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
            cache: 'no-store',
          })
          debugLog('[ClearIdeasWidget] Retry response (from catch):', {
            status: retryResponse.status,
            ok: retryResponse.ok,
          })
          if (!retryResponse.ok) {
            console.warn(
              '[ClearIdeasWidget] Retry request failed:',
              retryResponse.status,
              retryResponse.statusText,
            )
            return
          }
          try {
            data = await retryResponse.json()
            debugLog('[ClearIdeasWidget] Successfully parsed retry response (from catch)')
          } catch (retryParseError) {
            console.warn('[ClearIdeasWidget] Failed to parse retry response JSON:', retryParseError)
            return
          }
        } catch (retryError) {
          console.warn('[ClearIdeasWidget] Retry request also failed:', retryError)
          return
        }
      }
    } else {
      // For non-304 responses, parse JSON with error handling
      try {
        data = await response.json()
        // Always log successful parse - critical for debugging
        console.log('[ClearIdeasWidget] Successfully parsed init response', {
          hasChatName: !!data.chatName,
          hasActions: !!(data.links && data.links.length > 0),
        })
        debugLog('[ClearIdeasWidget] Successfully parsed init response', {
          hasChatName: !!data.chatName,
          hasActions: !!(data.links && data.links.length > 0),
        })
      } catch (parseError) {
        console.warn('[ClearIdeasWidget] Failed to parse init response JSON:', parseError)
        return
      }
    }

    // Log the actual data before setting it
    console.log('[ClearIdeasWidget] About to set initData.value', {
      dataKeys: Object.keys(data),
      hasChatName: !!data.chatName,
      hasLinks: !!(data.links && data.links.length > 0),
      helloBubbleEnabled: data.helloBubbleEnabled,
      helloBubbleText: data.helloBubbleText,
      helloBubbleDelay: data.helloBubbleDelay,
      disclaimerText: data.disclaimerText,
      disclaimerDialogEnabled: data.disclaimerDialogEnabled,
      disclaimerDialogText: data.disclaimerDialogText,
      dataPreview: JSON.stringify(data).substring(0, 200),
    })

    initData.value = data
    setCachedInitData(data)

    // Trigger hello bubble if enabled (after nextTick to ensure FAB is mounted)
    nextTick(() => {
      showHelloBubble()
    })

    // Always log when initData is set - critical for debugging
    console.log('[ClearIdeasWidget] initData.value set successfully', {
      hasInitData: !!initData.value,
      chatName: initData.value?.chatName,
      initDataValueType: typeof initData.value,
      initDataValueIsNull: initData.value === null,
      initDataValueIsUndefined: initData.value === undefined,
    })
    debugLog('[ClearIdeasWidget] initData.value set successfully', {
      hasInitData: !!initData.value,
      chatName: initData.value?.chatName,
    })

    if (data.chatName) {
      chatName.value = data.chatName
    }
    isNewChat.value = true

    console.log('[ClearIdeasWidget] loadInitData() completed successfully')
    debugLog('[ClearIdeasWidget] loadInitData() completed successfully')
  } catch (err) {
    console.error('[ClearIdeasWidget] Failed to load init data:', err)
    console.error('[ClearIdeasWidget] Error details:', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      initDataAtError: initData.value ? 'exists' : 'null',
    })
    debugLog('[ClearIdeasWidget] Error details:', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      initDataAtError: initData.value ? 'exists' : 'null',
    })
  } finally {
    loadingInit.value = false
    console.log('[ClearIdeasWidget] loadInitData() finished', {
      loadingInit: loadingInit.value,
      hasInitData: !!initData.value,
    })
    debugLog('[ClearIdeasWidget] loadInitData() finished', {
      loadingInit: loadingInit.value,
      hasInitData: !!initData.value,
    })
  }
}

async function activateChatSession() {
  const currentSessionId = sessionId.value
  if (activatedSessionId.value && activatedSessionId.value === currentSessionId) {
    return
  }

  if (!apiUrl.value || !props.accessKey) {
    console.warn('[ClearIdeasWidget] Cannot activate session: missing apiUrl or accessKey')
    return
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${props.accessKey}`,
    'Accept-Language': widgetLocale.value,
    'x-clearideas-public-chat-consent-status': consentStatus.value,
  }

  if (sessionId.value) {
    headers['x-clearideas-public-chat-session'] = sessionId.value
  }

  const response = await fetch(`${apiUrl.value}/public/chat/session`, {
    method: 'POST',
    headers,
    credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const responseSessionId = response.headers.get('x-clearideas-public-chat-session-id')
  const effectiveSessionId = responseSessionId || currentSessionId || null
  if (responseSessionId) {
    sessionId.value = responseSessionId
    try {
      const storage = getStorage()
      storage.setItem('clearideasPublicChatSessionId', responseSessionId)
    } catch (err) {
      debugWarn('[ClearIdeasWidget] Failed to persist session ID from activation:', err)
    }
  }

  const data: SessionActivationResponse = await response.json()
  activatedSessionId.value = effectiveSessionId
  applyExistingChat(data.existingChat)
}

// Send message to public chat API using streaming endpoint
async function sendPublicChatMessage(content: string) {
  if (!content.trim() || loading.value) return

  if (!apiUrl.value) {
    error.value = t('chat.apiNotConfigured')
    console.error('[ClearIdeasWidget] apiBaseUrl is missing. Default: https://api.clearideas.com')
    return
  }

  if (!props.accessKey || !props.accessKey.trim()) {
    error.value = t('chat.accessKeyRequired')
    console.error('[ClearIdeasWidget] accessKey is missing')
    return
  }

  if (abortController.value) {
    abortController.value.abort()
  }

  abortController.value = new AbortController()

  loading.value = true
  error.value = null
  streamingContent.value = ''
  streamingAssistantIndex.value = -1

  const requestUrl = chatId.value
    ? `${apiUrl.value}/public/chat/${chatId.value}/stream`
    : `${apiUrl.value}/public/chat/stream`

  try {
    const userMessage: ChatMessage = {
      content,
      role: 'user',
      createdAt: new Date(),
    }
    messages.value.push(userMessage)
    // Clear cached init data - chat state has changed (new message added)
    // This ensures cached init data won't be used on next page load, forcing a fresh init call
    clearCachedInitData()

    const headers = new Headers()
    headers.set('Authorization', `Bearer ${props.accessKey}`)
    headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'text/event-stream')
    headers.set('Accept-Language', widgetLocale.value)

    // Include session ID if available
    if (sessionId.value) {
      headers.set('x-clearideas-public-chat-session', sessionId.value)
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: {
          content,
        },
      }),
      credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
      signal: abortController.value.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: t('chat.unknownError') }))
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error(t('chat.responseBodyNull'))
    }

    // Don't create assistant message upfront - wait for content to start streaming
    // The assistant message will be created when the first content event arrives

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          if (streamingAssistantIndex.value >= 0 && streamingContent.value) {
            messages.value[streamingAssistantIndex.value].content = streamingContent.value
          }
          streamingAssistantIndex.value = -1
          streamingContent.value = ''
          break
        }

        if (abortController.value?.signal.aborted) {
          reader.cancel()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: StreamEvent = JSON.parse(line.slice(6))
              handleStreamEvent(data)
            } catch (parseError) {
              console.warn('[ClearIdeasWidget] Failed to parse SSE event:', parseError)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  } catch (err) {
    console.error('[ClearIdeasWidget] Request failed:', err)

    if (err instanceof Error && err.name === 'AbortError') {
      if (streamingAssistantIndex.value >= 0) {
        messages.value.splice(streamingAssistantIndex.value, 1)
      }
      streamingAssistantIndex.value = -1
      streamingContent.value = ''
      return
    }

    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      error.value = t('chat.corsError', { url: requestUrl })
    } else if (err instanceof Error) {
      error.value = err.message
    } else {
      error.value = t('chat.sendFailed')
    }

    if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'user') {
      messages.value.pop()
    }

    if (streamingAssistantIndex.value >= 0) {
      messages.value.splice(streamingAssistantIndex.value, 1)
      streamingAssistantIndex.value = -1
    }
    streamingContent.value = ''
  } finally {
    loading.value = false
    abortController.value = null
  }
}

// Handle streaming events
function handleStreamEvent(event: StreamEvent, voiceMode: boolean = false) {
  switch (event.type) {
    case 'info':
      if (event.chatId) {
        chatId.value = event.chatId
      } else if (event.id) {
        chatId.value = event.id
      }
      if (event.chatName) {
        chatName.value = event.chatName
      }
      break

    case 'transcript':
      // Voice mode: Add user message with transcript immediately
      if (voiceMode && event.transcript) {
        const userMessage: ChatMessage = {
          role: 'user',
          content: event.transcript,
          createdAt: new Date(),
        }
        messages.value.push(userMessage)
        // Clear cached init data - chat state has changed (new message added)
        // This ensures cached init data won't be used on next page load, forcing a fresh init call
        clearCachedInitData()
      }
      break

    case 'content':
      if (event.content) {
        // Create assistant message if it doesn't exist yet (for both text and voice mode)
        if (streamingAssistantIndex.value < 0) {
          const assistantMessage: ChatMessage = {
            content: '',
            role: 'assistant',
            createdAt: new Date(),
          }
          messages.value.push(assistantMessage)
          streamingAssistantIndex.value = messages.value.length - 1
        }
        streamingContent.value += event.content
        messages.value[streamingAssistantIndex.value].content = streamingContent.value
      }
      break

    case 'thinking':
      // Can optionally show thinking indicator, but for now just log
      break

    case 'toolCall':
    case 'toolCallComplete':
      // Tool calls are handled internally, no UI update needed
      break

    case 'audioChunk':
      // Voice mode: Handle progressive audio chunks
      if (voiceMode && event.audioChunk) {
        // Create assistant message if it doesn't exist yet (audio chunks might arrive before content)
        if (streamingAssistantIndex.value < 0) {
          const assistantMessage: ChatMessage = {
            content: '',
            role: 'assistant',
            createdAt: new Date(),
          }
          messages.value.push(assistantMessage)
          streamingAssistantIndex.value = messages.value.length - 1
        }
        const messageIndex = streamingAssistantIndex.value
        handleAudioChunk(messageIndex, event.audioChunk, event.audioChunkIndex, event.isInitSegment)
      }
      break

    case 'audio':
      // Voice mode: Store complete audio data in assistant message
      if (voiceMode && event.audio && streamingAssistantIndex.value >= 0) {
        const messageIndex = streamingAssistantIndex.value
        messages.value[messageIndex].audio = event.audio

        // If MediaSource progressive playback is already working, append any remaining chunks and end stream
        const state = messageAudioState.value.get(messageIndex)
        if (
          state?.isUsingProgressivePlayback &&
          state.mediaSource &&
          state.sourceBuffer &&
          state.mediaSource.readyState === 'open'
        ) {
          console.log('[ClearIdeasWidget] Complete audio received, ending MediaSource stream', {
            messageIndex,
            totalChunks: state.audioChunks?.length || 0,
          })
          // Append any remaining chunks and end stream
          appendRemainingChunksAndEndStream(messageIndex)
        } else if (state?.audio && !state.audio.paused && state.isUsingProgressivePlayback) {
          // Already playing via MediaSource, just store for replay
          console.log(
            '[ClearIdeasWidget] Progressive playback already active, storing complete audio for replay',
            {
              messageIndex,
            },
          )
        } else {
          // No active playback, start with complete audio
          console.log('[ClearIdeasWidget] Playing complete audio', {
            messageIndex,
            hasMediaSource: !!state?.mediaSource,
            isUsingProgressivePlayback: state?.isUsingProgressivePlayback,
          })
          playMessageAudio(messageIndex, event.audio)
        }
      }
      break

    case 'message_finalized':
      if (event.message && streamingAssistantIndex.value >= 0) {
        messages.value[streamingAssistantIndex.value].content =
          event.message.content || streamingContent.value
      }
      break

    case 'done':
      if (event.chatId) {
        chatId.value = event.chatId
      } else if (event.id) {
        chatId.value = event.id
      }
      if (event.chatName) {
        chatName.value = event.chatName
      }

      if (voiceMode) {
        // Voice mode: Use response field and audio field
        let messageIndex = streamingAssistantIndex.value

        // Create assistant message if it doesn't exist yet
        if (messageIndex < 0 && (event.response || streamingContent.value)) {
          const assistantMessage: ChatMessage = {
            content: event.response || streamingContent.value || '',
            role: 'assistant',
            createdAt: new Date(),
          }
          messages.value.push(assistantMessage)
          messageIndex = messages.value.length - 1
        }

        if (messageIndex >= 0) {
          // Use response field if available, otherwise use accumulated content
          if (event.response) {
            messages.value[messageIndex].content = event.response
          } else if (streamingContent.value) {
            messages.value[messageIndex].content = streamingContent.value
          }

          // Store audio if not already stored from audio event
          if (event.audio) {
            // Always store complete audio for replay
            messages.value[messageIndex].audio = event.audio

            // Play complete audio if not already playing
            const state = messageAudioState.value.get(messageIndex)
            if (!state?.isPlaying) {
              console.log('[ClearIdeasWidget] Playing complete audio from done event', {
                messageIndex,
              })
              playMessageAudio(messageIndex, event.audio)
            } else {
              // If already playing, update stored audio for replay but don't interrupt
              console.log('[ClearIdeasWidget] Audio already playing, storing for replay', {
                messageIndex,
              })
            }
          }
        }
      } else {
        // Text mode: Use message field
        if (event.message && streamingAssistantIndex.value >= 0) {
          messages.value[streamingAssistantIndex.value].content =
            event.message.content || streamingContent.value
        } else if (streamingContent.value && streamingAssistantIndex.value < 0) {
          // Create assistant message if content exists but no message was created
          const assistantMessage: ChatMessage = {
            content: streamingContent.value,
            role: 'assistant',
            createdAt: new Date(),
          }
          messages.value.push(assistantMessage)
          streamingAssistantIndex.value = messages.value.length - 1
        }
      }

      streamingAssistantIndex.value = -1
      streamingContent.value = ''
      // Clear cached init data - chat state has changed (assistant response finalized)
      // This ensures cached init data won't be used on next page load, forcing a fresh init call
      clearCachedInitData()
      break

    case 'error':
      error.value = event.error || t('chat.streamError')
      if (streamingAssistantIndex.value >= 0) {
        messages.value.splice(streamingAssistantIndex.value, 1)
        streamingAssistantIndex.value = -1
      }
      streamingContent.value = ''
      break
  }
}

async function openWidget() {
  const requestToken = ++openRequestToken.value

  // Initialize audio context on first user interaction
  initAudioContext()

  console.log(
    '[ClearIdeasWidget] openWidget called, current messages count:',
    messages.value.length,
  )

  // Don't open widget until initialization succeeds
  // If initData already exists, we can open immediately
  if (!initData.value) {
    // Reset state before attempting init
    error.value = null
    streamingContent.value = ''
    streamingAssistantIndex.value = -1
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }

    // Attempt to load init data
    await loadInitData()

    // Only open if initialization succeeded (initData was loaded)
    if (!initData.value) {
      console.warn('[ClearIdeasWidget] Cannot open widget: initialization failed')
      return
    }
  }

  try {
    await activateChatSession()
  } catch (activationError) {
    console.warn(
      '[ClearIdeasWidget] Session activation failed during open; continuing with new chat state',
      activationError,
    )
    applyExistingChat(undefined)
    error.value =
      activationError instanceof Error ? activationError.message : t('chat.unknownError')
  }

  if (requestToken !== openRequestToken.value || isOpen.value) {
    return
  }

  // Initialization succeeded, now open the widget
  isOpen.value = true
  currentView.value = 'home'
  error.value = null
  streamingContent.value = ''
  streamingAssistantIndex.value = -1
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }

  // Disclaimer dialog will be shown via watcher when view switches to chat

  nextTick(() => {
    shouldFocusInput.value = false
    nextTick(() => (shouldFocusInput.value = true))
  })
}

function closeWidget() {
  openRequestToken.value += 1
  isOpen.value = false
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  if (realtimeVoiceModeOpen.value || voiceInputActive.value) cancelVoiceInput()
  // Stop all audio playback
  stopAllAudio()
}

function toggleWidget() {
  // Initialize audio context on first user interaction
  initAudioContext()

  // Hide hello bubble when FAB is activated
  if (isHelloBubbleVisible.value) {
    hideHelloBubble()
  }

  if (isOpen.value) closeWidget()
  else openWidget()
}

async function openChatDirectly() {
  // Open widget if closed
  if (!isOpen.value) {
    await openWidget()
  }
  // Set view to chat (skip home view)
  currentView.value = 'chat'
}

// FAB visibility state (defaults to prop value)
const fabVisible = ref(!props.fabHide)

function hideFab() {
  fabVisible.value = false
  if (isHelloBubbleVisible.value) {
    hideHelloBubble()
  }
}

function showFab() {
  fabVisible.value = true
}

function setDarkMode(isDark: boolean) {
  darkModeOverride.value = isDark
}

function setConsentRequired(required: boolean) {
  consentRequiredOverride.value = required
}

function setConsentGranted(granted: boolean) {
  consentGrantedOverride.value = granted
}

function setPosition(position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') {
  positionOverride.value = position
}

function setWidth(width: number) {
  widthOverride.value = width
}

function setHeight(height: number) {
  heightOverride.value = height
}

function setTop(top: number | undefined) {
  topOverride.value = top
}

function setRight(right: number | undefined) {
  rightOverride.value = right
}

function setBottom(bottom: number | undefined) {
  bottomOverride.value = bottom
}

function setLeft(left: number | undefined) {
  leftOverride.value = left
}

function setFabSize(size: number) {
  fabSizeOverride.value = size
}

function setActions(actions: WidgetAction[]) {
  actionsOverride.value = actions
}

function setUserName(name: string | undefined) {
  userNameOverride.value = name
}

function setUserEmail(email: string | undefined) {
  userEmailOverride.value = email
}

function setUserId(id: string | undefined) {
  userIdOverride.value = id
}

function setLocale(locale: string | undefined) {
  localeOverride.value = locale
}

// Expose methods for external API
defineExpose({
  openWidget,
  closeWidget,
  toggleWidget,
  openChatDirectly,
  sendPublicChatMessage,
  startVoiceRecording: startRecording,
  stopVoiceRecording: stopRecordingAndSend,
  cancelVoiceRecording: cancelRecording,
  hideFab,
  showFab,
  setDarkMode,
  setConsentRequired,
  setConsentGranted,
  setPosition,
  setWidth,
  setHeight,
  setTop,
  setRight,
  setBottom,
  setLeft,
  setFabSize,
  setActions,
  setUserName,
  setUserEmail,
  setUserId,
  setLocale,
})

async function handleSendMessage(content: string) {
  if (currentView.value !== 'chat') {
    currentView.value = 'chat'
    // Disclaimer dialog will be shown via watcher when view switches to chat
  }
  await sendPublicChatMessage(content)
}

// Chat input handlers (inlined from ConsumerChatInput)
function trySendChatInput() {
  const trimmed = chatInputContent.value.trim()
  if (!trimmed || loading.value) return
  handleSendMessage(trimmed)
  chatInputContent.value = ''
  chatInputFocused.value = false
}

onMounted(async () => {
  startWidgetLocaleTracking()
  syncWidgetLocale()
  // Always log that widget is mounting

  // Initialize audio context on any page interaction
  // This allows the hello bubble sound to work even before user clicks the widget
  initAudioContextOnInteraction()
  console.log(
    '[ClearIdeasWidget] Widget mounted - set window.__ClearIdeasWidgetDebug = true for detailed logs',
  )

  // Load session ID respecting consent state
  const storedSessionId = getStoredSessionId()
  if (storedSessionId) {
    sessionId.value = storedSessionId
    // Determine which storage was actually used (same logic as getStoredSessionId)
    let storageType: string
    if (shouldUsePersistentStorage.value) {
      storageType = localStorage.getItem('clearideasPublicChatSessionId')
        ? 'localStorage'
        : 'sessionStorage'
    } else {
      storageType = 'sessionStorage'
    }
    debugLog(`[ClearIdeasWidget] Loaded existing session ID from ${storageType}:`, storedSessionId)
  } else {
    debugLog('[ClearIdeasWidget] No existing session ID found in storage')
  }

  await loadInitData()
  hasCompletedInitialInitLoad.value = true
  if (props.openOnLoad) {
    await openWidget()
  }
  nextTick(() => {
    addClickEventListener()
    initializeTippy()
    initializeButtonTooltips()
  })
})

watch(
  resolvedLocale,
  value => {
    setWidgetLocale(value)
  },
  { immediate: true },
)

watch(
  widgetLocale,
  async (value, previousValue) => {
    nextTick(() => {
      resetButtonTooltips()
      initializeButtonTooltips()
    })

    if (hasCompletedInitialInitLoad.value && previousValue && value !== previousValue) {
      clearCachedInitData()
      clearStoredSessionId()
      resetChatStateForLocaleChange()

      if (apiUrl.value && props.accessKey) {
        await loadInitData()
      }
    }
  },
  { immediate: true },
)

// Helper functions for setting refs from child components
function setVoiceBtnRef(el: HTMLElement | null) {
  voiceBtnRef.value = el
  nextTick(() => initializeButtonTooltips())
}
function setSendBtnRef(el: HTMLElement | null) {
  sendBtnRef.value = el
  nextTick(() => initializeButtonTooltips())
}
function setCancelBtnRef(el: HTMLElement | null) {
  cancelBtnRef.value = el
  nextTick(() => initializeButtonTooltips())
}
function setAcceptBtnRef(el: HTMLElement | null) {
  acceptBtnRef.value = el
  nextTick(() => initializeButtonTooltips())
}
function setBackBtnRef(el: HTMLElement | null) {
  backBtnRef.value = el
  nextTick(() => initializeButtonTooltips())
}
function setCloseBtnRef(el: HTMLElement | null) {
  closeBtnRef.value = el
  nextTick(() => initializeButtonTooltips())
}
function setFabBtnRef(el: HTMLElement | null) {
  fabBtnRef.value = el
  nextTick(() => initializeButtonTooltips())
}

function resetButtonTooltips() {
  tippyInstances.value.forEach(instance => {
    instance.destroy()
  })
  tippyInstances.value.clear()
}

function syncWidgetLocale() {
  setWidgetLocale(resolvedLocale.value)
}

// Initialize tooltips for buttons
function initializeButtonTooltips() {
  // Voice button tooltip - only if visible (not recording)
  if (voiceBtnRef.value && !isRecording.value && !tippyInstances.value.has(voiceBtnRef.value)) {
    const instance = tippy(voiceBtnRef.value, {
      content: t('input.voiceModeTooltip'),
      placement: 'top',
      theme: 'light-border',
      arrow: true,
    })
    tippyInstances.value.set(voiceBtnRef.value, instance)
  }

  // Send button tooltip - only if visible (not recording)
  if (sendBtnRef.value && !isRecording.value && !tippyInstances.value.has(sendBtnRef.value)) {
    const instance = tippy(sendBtnRef.value, {
      content: t('input.sendMessage'),
      placement: 'top',
      theme: 'light-border',
      arrow: true,
    })
    tippyInstances.value.set(sendBtnRef.value, instance)
  }

  // Cancel button tooltip - only if visible (recording)
  if (cancelBtnRef.value && isRecording.value && !tippyInstances.value.has(cancelBtnRef.value)) {
    const instance = tippy(cancelBtnRef.value, {
      content: t('input.cancelRecording'),
      placement: 'top',
      theme: 'light-border',
      arrow: true,
    })
    tippyInstances.value.set(cancelBtnRef.value, instance)
  }

  // Accept button tooltip - only if visible (recording)
  if (acceptBtnRef.value && isRecording.value && !tippyInstances.value.has(acceptBtnRef.value)) {
    const instance = tippy(acceptBtnRef.value, {
      content: t('input.sendRecording'),
      placement: 'top',
      theme: 'light-border',
      arrow: true,
    })
    tippyInstances.value.set(acceptBtnRef.value, instance)
  }

  // Back button tooltip
  if (backBtnRef.value && !tippyInstances.value.has(backBtnRef.value)) {
    const instance = tippy(backBtnRef.value, {
      content: t('header.backToHome'),
      placement: 'bottom',
      theme: 'light-border',
      arrow: true,
    })
    tippyInstances.value.set(backBtnRef.value, instance)
  }

  // Close button tooltip
  if (closeBtnRef.value && !tippyInstances.value.has(closeBtnRef.value)) {
    const instance = tippy(closeBtnRef.value, {
      content: t('fab.closeChat'),
      placement: 'bottom',
      theme: 'light-border',
      arrow: true,
    })
    tippyInstances.value.set(closeBtnRef.value, instance)
  }

  // New chat button tooltip
  if (newChatBtnRef.value && !tippyInstances.value.has(newChatBtnRef.value)) {
    const instance = tippy(newChatBtnRef.value, {
      content: t('chat.newChat'),
      placement: 'top',
      theme: 'light-border',
      arrow: true,
    })
    tippyInstances.value.set(newChatBtnRef.value, instance)
  }

  // FAB button tooltip - update content dynamically
  if (fabBtnRef.value) {
    if (tippyInstances.value.has(fabBtnRef.value)) {
      const instance = tippyInstances.value.get(fabBtnRef.value)
      instance?.setContent(isOpen.value ? t('fab.closeChat') : t('fab.openChat'))
    } else {
      const instance = tippy(fabBtnRef.value, {
        content: isOpen.value ? t('fab.closeChat') : t('fab.openChat'),
        placement: 'left',
        theme: 'light-border',
        arrow: true,
      })
      tippyInstances.value.set(fabBtnRef.value, instance)
    }
  }

  // Audio play/pause buttons
  audioBtnRefs.value.forEach((element: HTMLElement, index: number) => {
    if (element && !tippyInstances.value.has(element)) {
      const instance = tippy(element, {
        content: isMessageAudioPlaying(index) ? t('audio.pause') : t('audio.play'),
        placement: 'top',
        theme: 'light-border',
        arrow: true,
      })
      tippyInstances.value.set(element, instance)
    } else if (element && tippyInstances.value.has(element)) {
      // Update existing tooltip content
      const instance = tippyInstances.value.get(element)
      instance?.setContent(isMessageAudioPlaying(index) ? t('audio.pause') : t('audio.play'))
    }
  })
}

onUnmounted(() => {
  stopWidgetLocaleTracking()
  resetButtonTooltips()
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  // Cleanup hello bubble timeout
  if (helloBubbleTimeoutId.value !== null) {
    clearTimeout(helloBubbleTimeoutId.value)
    helloBubbleTimeoutId.value = null
  }
  // Cleanup voice recording
  if (isRecording.value) {
    cancelRecording()
  }
  disconnectRealtimeVoice()
  // Stop all message audio
  stopAllAudio()
})

const positionClass = computed(() => {
  const top = topOverride.value !== undefined ? topOverride.value : props.top
  const right = rightOverride.value !== undefined ? rightOverride.value : props.right
  const bottom = bottomOverride.value !== undefined ? bottomOverride.value : props.bottom
  const left = leftOverride.value !== undefined ? leftOverride.value : props.left

  if (top !== undefined || right !== undefined || bottom !== undefined || left !== undefined) {
    return 'pos-absolute'
  }

  const position = positionOverride.value !== undefined ? positionOverride.value : props.position
  switch (position) {
    case 'bottom-left':
      return 'pos-bl'
    case 'top-right':
      return 'pos-tr'
    case 'top-left':
      return 'pos-tl'
    default:
      return 'pos-br'
  }
})

// Compute current widget position for bubble placement
const currentWidgetPosition = computed(() => {
  const top = topOverride.value !== undefined ? topOverride.value : props.top
  const right = rightOverride.value !== undefined ? rightOverride.value : props.right
  const bottom = bottomOverride.value !== undefined ? bottomOverride.value : props.bottom
  const left = leftOverride.value !== undefined ? leftOverride.value : props.left

  // If using numeric positioning, infer position from which edges are set
  if (top !== undefined || right !== undefined || bottom !== undefined || left !== undefined) {
    // Determine vertical position
    const hasTop = top !== undefined
    const hasBottom = bottom !== undefined
    // Determine horizontal position
    const hasRight = right !== undefined
    const hasLeft = left !== undefined

    // If both top and bottom are set, use the smaller value (closer to edge)
    // If both left and right are set, use the smaller value (closer to edge)
    let verticalPos: 'top' | 'bottom' = 'bottom'
    let horizontalPos: 'left' | 'right' = 'right'

    if (hasTop && hasBottom) {
      verticalPos = (top ?? 0) < (bottom ?? 0) ? 'top' : 'bottom'
    } else if (hasTop) {
      verticalPos = 'top'
    } else if (hasBottom) {
      verticalPos = 'bottom'
    }

    if (hasLeft && hasRight) {
      horizontalPos = (left ?? 0) < (right ?? 0) ? 'left' : 'right'
    } else if (hasLeft) {
      horizontalPos = 'left'
    } else if (hasRight) {
      horizontalPos = 'right'
    }

    return `${verticalPos}-${horizontalPos}` as
      'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  }

  // Use preset position if no numeric positioning
  const position = positionOverride.value !== undefined ? positionOverride.value : props.position
  return position
})

// Compute bubble positioning based on widget position
const helloBubbleStyle = computed(() => {
  const position = currentWidgetPosition.value
  const style: Record<string, string> = {
    maxWidth: '380px',
    width: '340px',
  }

  switch (position) {
    case 'bottom-right':
      // Bubble above and to the left of FAB
      style.bottom = 'calc(100% + 16px)'
      style.right = '0'
      break
    case 'bottom-left':
      // Bubble above and to the right of FAB
      style.bottom = 'calc(100% + 16px)'
      style.left = '0'
      break
    case 'top-right':
      // Bubble below and to the left of FAB
      style.top = 'calc(100% + 16px)'
      style.right = '0'
      break
    case 'top-left':
      // Bubble below and to the right of FAB
      style.top = 'calc(100% + 16px)'
      style.left = '0'
      break
  }

  return style
})

// Compute arrow direction and position based on widget position
const helloBubbleArrowStyle = computed(() => {
  const position = currentWidgetPosition.value
  // The bubble uses a gradient: linear-gradient(135deg, widgetColor 0%, darker 100%)
  // Use the exact same color calculation as the gradient for perfect matching
  const baseColor = widgetColor.value
  const darkerColor = adjustColorLightness(baseColor, -15) // Same as gradient end
  let arrowColor: string

  switch (position) {
    case 'bottom-right':
    case 'bottom-left':
      // Arrow points down (bubble is above FAB)
      // Arrow connects at bottom of bubble where gradient is darkest (100%)
      // Use the exact same darker color as the gradient end
      arrowColor = darkerColor
      break
    case 'top-right':
    case 'top-left':
      // Arrow points up (bubble is below FAB)
      // Arrow connects at top of bubble where gradient is lightest (0%)
      arrowColor = baseColor
      break
    default:
      arrowColor = baseColor
  }

  const style: Record<string, string> = {}

  switch (position) {
    case 'bottom-right':
    case 'bottom-left':
      // Arrow points down (bubble is above FAB)
      // Position at -9px to overlap by 1px and eliminate gap
      style.bottom = '-9px'
      style.top = 'auto'
      style.borderTop = `10px solid ${arrowColor}`
      style.borderBottom = 'none'
      style.borderLeft = '10px solid transparent'
      style.borderRight = '10px solid transparent'
      style.right = position === 'bottom-right' ? '20px' : 'auto'
      style.left = position === 'bottom-left' ? '20px' : 'auto'
      break
    case 'top-right':
    case 'top-left':
      // Arrow points up (bubble is below FAB)
      // Position at -9px to overlap by 1px and eliminate gap
      style.top = '-9px'
      style.bottom = 'auto'
      style.borderBottom = `10px solid ${arrowColor}`
      style.borderTop = 'none'
      style.borderLeft = '10px solid transparent'
      style.borderRight = '10px solid transparent'
      style.right = position === 'top-right' ? '20px' : 'auto'
      style.left = position === 'top-left' ? '20px' : 'auto'
      break
  }

  return style
})

const absoluteStyle = computed(() => {
  const style: Record<string, string> = {}
  const top = topOverride.value !== undefined ? topOverride.value : props.top
  const right = rightOverride.value !== undefined ? rightOverride.value : props.right
  const bottom = bottomOverride.value !== undefined ? bottomOverride.value : props.bottom
  const left = leftOverride.value !== undefined ? leftOverride.value : props.left
  if (top !== undefined) style.top = `${top}px`
  if (right !== undefined) style.right = `${right}px`
  if (bottom !== undefined) style.bottom = `${bottom}px`
  if (left !== undefined) style.left = `${left}px`
  return style
})

const panelStyle = computed(() => {
  const width = widthOverride.value !== undefined ? widthOverride.value : props.width
  const height = heightOverride.value !== undefined ? heightOverride.value : props.height
  const position = currentWidgetPosition.value

  // Calculate available viewport space
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
  const fabSize =
    fabSizeOverride.value !== undefined ? fabSizeOverride.value : (props.fabSize ?? 56)
  const margin = 16 // Widget container margin
  const gap = 12 // Gap between FAB and panel

  // Calculate max dimensions to fit in viewport
  const maxWidth = Math.min(width, viewportWidth - margin * 2)
  const maxHeight = Math.min(height, viewportHeight - margin * 2 - fabSize - gap)

  const style: Record<string, string> = {
    width: `${maxWidth}px`,
    height: `${maxHeight}px`,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 32px)',
  }

  // Position panel based on widget position
  switch (position) {
    case 'bottom-right':
      // Panel above and to the right of FAB
      style.bottom = '100%'
      style.top = 'auto'
      style.right = '0'
      style.left = 'auto'
      style.marginBottom = `${gap}px`
      style.marginTop = '0'
      break
    case 'bottom-left':
      // Panel above and to the left of FAB
      style.bottom = '100%'
      style.top = 'auto'
      style.left = '0'
      style.right = 'auto'
      style.marginBottom = `${gap}px`
      style.marginTop = '0'
      break
    case 'top-right':
      // Panel below and to the right of FAB
      style.top = '100%'
      style.bottom = 'auto'
      style.right = '0'
      style.left = 'auto'
      style.marginTop = `${gap}px`
      style.marginBottom = '0'
      break
    case 'top-left':
      // Panel below and to the left of FAB
      style.top = '100%'
      style.bottom = 'auto'
      style.left = '0'
      style.right = 'auto'
      style.marginTop = `${gap}px`
      style.marginBottom = '0'
      break
  }

  return style
})

const widgetContainerStyle = computed<CSSProperties>(() => {
  const fabSize =
    fabSizeOverride.value !== undefined ? fabSizeOverride.value : (props.fabSize ?? 56)
  const isFabSurfaceVisible = fabVisible.value
  const isHelloBubbleSurfaceVisible = isHelloBubbleVisible.value && !!helloBubbleText.value
  const hasVisibleWidgetSurface = isOpen.value || isFabSurfaceVisible || isHelloBubbleSurfaceVisible

  return {
    width: `${fabSize}px`,
    height: `${fabSize}px`,
    pointerEvents: hasVisibleWidgetSurface ? 'auto' : 'none',
  }
})

const displayName = computed(() => {
  const userName = userNameOverride.value !== undefined ? userNameOverride.value : props.userName
  const userEmail =
    userEmailOverride.value !== undefined ? userEmailOverride.value : props.userEmail
  const name = userName || userEmail?.split('@')[0]
  if (!name) return 'there'
  const first = String(name).split(' ')[0]
  return first || 'there'
})

function handleAction(action: WidgetAction) {
  if (action.type === 'chat') {
    startChat()
  } else if (action.type === 'link' && action.url) {
    window.open(action.url, '_blank')
  }
}

async function startChat() {
  // Ensure init data is loaded before switching to chat
  if (!initData.value) {
    await loadInitData()
  }
  currentView.value = 'chat'
  nextTick(() => {
    shouldFocusInput.value = false
    nextTick(() => (shouldFocusInput.value = true))
  })
}

function startNewChat() {
  realtimeVoiceModeOpen.value = false
  realtimeUserHasSpoken.value = false
  disconnectRealtimeVoice()
  realtimeTranscriptMessages.clear()
  chatId.value = null
  messages.value = []
  error.value = null
  streamingContent.value = ''
  streamingAssistantIndex.value = -1
  // This is a new chat - greeting should show
  isNewChat.value = true
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  // Stop all audio and clear audio state for all messages
  stopAllAudio()
  messageAudioState.value.clear()
  // Clear cached init data - fresh init will happen automatically
  clearCachedInitData()
  // Stay in chat view - don't switch to home
}

function goToHome() {
  if (realtimeVoiceModeOpen.value || voiceInputActive.value) cancelVoiceInput()
  currentView.value = 'home'
}

// Voice recording wrapper to check voiceEnabled before starting
async function startRecording() {
  if (!voiceEnabled.value) {
    error.value = t('chat.voiceDisabled')
    return
  }

  error.value = null
  if (supportsRealtimeVoice.value) {
    realtimeTranscriptMessages.clear()
    realtimeUserHasSpoken.value = false
    realtimeVoiceModeOpen.value = true
    try {
      await connectRealtimeVoice()
      return
    } catch (realtimeError) {
      // Keep the live-call failure visible. The user can explicitly choose the
      // legacy recorded flow from the dedicated voice screen.
      debugWarn('[ClearIdeasWidget] Realtime voice unavailable', {
        error: realtimeError instanceof Error ? realtimeError.message : String(realtimeError),
      })
      error.value =
        realtimeError instanceof Error ? realtimeError.message : t('chat.sendVoiceFailed')
      return
    }
  }

  await startVoiceRecording()
}

function completeVoiceInput() {
  // Native realtime providers decide when a turn has ended.
  if (realtimeVoiceActive.value) return
  stopRecordingAndSend()
}

function cancelVoiceInput() {
  if (realtimeVoiceModeOpen.value || realtimeVoiceActive.value) {
    realtimeVoiceModeOpen.value = false
    realtimeUserHasSpoken.value = false
    disconnectRealtimeVoice()
    streamingAssistantIndex.value = -1
    streamingContent.value = ''
    return
  }
  cancelRecording()
}

async function useRecordedVoiceFallback() {
  realtimeVoiceModeOpen.value = false
  realtimeUserHasSpoken.value = false
  disconnectRealtimeVoice()
  error.value = null
  await startVoiceRecording()
}

function endRealtimeVoiceMode() {
  realtimeVoiceModeOpen.value = false
  realtimeUserHasSpoken.value = false
  disconnectRealtimeVoice()
  streamingAssistantIndex.value = -1
  streamingContent.value = ''
}

async function sendVoiceMessage(audioBase64: string, format: string) {
  if (!apiUrl.value || !props.accessKey) {
    error.value = t('chat.configMissing')
    cleanupVoiceRecording()
    return
  }

  if (abortController.value) {
    abortController.value.abort()
  }

  abortController.value = new AbortController()

  loading.value = true
  error.value = null
  streamingContent.value = ''
  streamingAssistantIndex.value = -1

  // Use chatId if available to continue conversation
  const requestUrl = chatId.value
    ? `${apiUrl.value}/public/chat/voice/${chatId.value}/stream`
    : `${apiUrl.value}/public/chat/voice/stream`

  try {
    const headers = new Headers()
    headers.set('Authorization', `Bearer ${props.accessKey}`)
    headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'text/event-stream')
    headers.set('Accept-Language', widgetLocale.value)

    // Include session ID if available
    if (sessionId.value) {
      headers.set('x-clearideas-public-chat-session', sessionId.value)
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audio: audioBase64,
        format,
      }),
      credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
      signal: abortController.value.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: t('chat.unknownError') }))
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error(t('chat.responseBodyNull'))
    }

    // Don't create assistant message upfront - wait for transcript event
    // The assistant message will be created when content starts streaming

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          // The done event handler should have already processed everything
          // But ensure we clean up state if done event wasn't received
          if (streamingAssistantIndex.value >= 0 && streamingContent.value) {
            messages.value[streamingAssistantIndex.value].content = streamingContent.value
          }
          streamingAssistantIndex.value = -1
          streamingContent.value = ''
          break
        }

        if (abortController.value?.signal.aborted) {
          reader.cancel()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: StreamEvent = JSON.parse(line.slice(6))
              handleStreamEvent(data, true) // Pass true to indicate voice mode
            } catch (parseError) {
              console.warn('[ClearIdeasWidget] Failed to parse SSE event:', parseError)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Switch to chat view if not already there
    if (currentView.value !== 'chat') {
      currentView.value = 'chat'
    }
  } catch (err) {
    console.error('[ClearIdeasWidget] Voice message failed:', err)

    if (err instanceof Error && err.name === 'AbortError') {
      if (streamingAssistantIndex.value >= 0) {
        messages.value.splice(streamingAssistantIndex.value, 1)
      }
      streamingAssistantIndex.value = -1
      streamingContent.value = ''
      cleanupVoiceRecording()
      return
    }

    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      error.value = t('chat.corsError', { url: requestUrl })
    } else if (err instanceof Error) {
      error.value = err.message
    } else {
      error.value = t('chat.sendVoiceFailed')
    }

    if (streamingAssistantIndex.value >= 0) {
      messages.value.splice(streamingAssistantIndex.value, 1)
      streamingAssistantIndex.value = -1
    }
    streamingContent.value = ''
  } finally {
    loading.value = false
    abortController.value = null
    cleanupVoiceRecording()
  }
}

// Handle progressive audio chunks
function handleAudioChunk(
  messageIndex: number,
  base64Chunk: string,
  chunkIndex?: number,
  isInitSegment?: boolean,
) {
  let state = messageAudioState.value.get(messageIndex)

  // Initialize state if it doesn't exist
  if (!state) {
    state = {
      audio: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      audioChunks: [],
    }
    messageAudioState.value.set(messageIndex, state)
  }

  // Initialize chunks array if needed
  if (!state.audioChunks) {
    state.audioChunks = []
  }

  // Add chunk to array (handle indexed vs sequential)
  let isChunk0 = false
  if (chunkIndex !== undefined) {
    // Insert at correct position based on index (expand array if needed)
    while (state.audioChunks.length <= chunkIndex) {
      state.audioChunks.push(undefined as any)
    }
    state.audioChunks[chunkIndex] = base64Chunk
    isChunk0 = chunkIndex === 0
  } else {
    // Append if no index provided
    state.audioChunks.push(base64Chunk)
    isChunk0 = state.audioChunks.length === 1
  }

  // Track if this is the initialization segment
  if (isInitSegment) {
    state.initSegmentReceived = true
  }

  // Check if we should start progressive playback
  const validChunks = state.audioChunks.filter((chunk: string | undefined): chunk is string =>
    Boolean(chunk),
  )

  // Start MediaSource when we receive the initialization segment (chunk 0 with isInitSegment flag)
  // Only start if MediaSource is not already initialized
  let shouldStart = false
  if (isInitSegment || (isChunk0 && state.initSegmentReceived)) {
    // We have the initialization segment, start MediaSource
    shouldStart = !state.mediaSource && !state.isUsingProgressivePlayback
  }

  console.log('[ClearIdeasWidget] Audio chunk received', {
    messageIndex,
    chunkIndex,
    isInitSegment,
    chunksCount: state.audioChunks.length,
    validChunksCount: validChunks.length,
    shouldStart,
    hasMediaSource: !!state.mediaSource,
    isUsingProgressivePlayback: state.isUsingProgressivePlayback,
    isPlaying: state.isPlaying,
    initSegmentReceived: state.initSegmentReceived,
  })

  if (shouldStart) {
    // Start MediaSource-based progressive playback
    console.log('[ClearIdeasWidget] Starting MediaSource playback', {
      messageIndex,
      chunksAvailable: validChunks.length,
    })
    startProgressivePlayback(messageIndex)
  } else if (state.isUsingProgressivePlayback && state.sourceBuffer) {
    // Append chunk to existing MediaSource playback
    appendChunkToMediaSource(messageIndex, base64Chunk)
  }
}

// Start MediaSource-based progressive playback for WebM/Opus
function startProgressivePlayback(messageIndex: number) {
  const state = messageAudioState.value.get(messageIndex)
  if (!state || !state.audioChunks || state.audioChunks.length === 0) return

  // Check MediaSource support for WebM
  if (!window.MediaSource || !MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
    console.warn(
      '[ClearIdeasWidget] MediaSource API not supported for WebM/Opus, will wait for complete audio',
    )
    return
  }

  // Ensure we have the initialization segment
  if (!state.initSegmentReceived) {
    console.log(
      '[ClearIdeasWidget] Waiting for initialization segment before starting MediaSource',
      { messageIndex },
    )
    return
  }

  // Stop any currently playing audio
  stopAllAudio()

  // Create MediaSource
  const mediaSource = new MediaSource()
  const audioUrl = URL.createObjectURL(mediaSource)
  const audio = new Audio(audioUrl)

  // Store references
  state.mediaSource = mediaSource
  state.audio = audio
  state.isUsingProgressivePlayback = true
  state.isPlaying = false // Will be set to true when playback actually starts

  // Set up audio element event handlers before sourceopen
  audio.onloadedmetadata = () => {
    const currentState = messageAudioState.value.get(messageIndex)
    if (currentState) {
      currentState.duration = audio.duration
    }
  }

  audio.ontimeupdate = () => {
    const currentState = messageAudioState.value.get(messageIndex)
    if (currentState) {
      currentState.currentTime = audio.currentTime
    }
  }

  audio.onended = () => {
    const currentState = messageAudioState.value.get(messageIndex)
    if (currentState) {
      currentState.isPlaying = false
      currentState.currentTime = 0
    }
  }

  audio.onerror = e => {
    console.error('[ClearIdeasWidget] Audio element error:', e)
    const currentState = messageAudioState.value.get(messageIndex)
    if (currentState) {
      currentState.isPlaying = false
      currentState.isUsingProgressivePlayback = false
    }
  }

  // Handle MediaSource ready
  mediaSource.addEventListener('sourceopen', () => {
    console.log('[ClearIdeasWidget] MediaSource sourceopen event', {
      messageIndex,
    })
    try {
      // Create source buffer for WebM/Opus
      const sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs="opus"')
      state.sourceBuffer = sourceBuffer
      console.log('[ClearIdeasWidget] SourceBuffer created', { messageIndex })

      // Append initial chunks in order
      // For indexed chunks, we need to append in index order (0, 1, 2, ...)
      // For sequential chunks, append in array order
      let chunks: string[] = []
      if (state.audioChunks) {
        // Check if chunks are indexed (has undefined entries)
        const hasUndefinedEntries = state.audioChunks.some(
          (chunk: string | undefined) => chunk === undefined,
        )
        if (hasUndefinedEntries) {
          // Indexed chunks - extract in order, ensuring chunk 0 comes first
          // Filter undefined and keep original order (chunk 0 at index 0, chunk 1 at index 1, etc.)
          chunks = []
          for (let i = 0; i < state.audioChunks.length; i++) {
            const chunk = state.audioChunks[i]
            if (chunk !== undefined) {
              chunks.push(chunk)
            }
          }
        } else {
          // Sequential chunks - use as-is
          chunks = state.audioChunks.filter((chunk: string | undefined): chunk is string =>
            Boolean(chunk),
          )
        }
      }

      console.log('[ClearIdeasWidget] Preparing chunks for MediaSource', {
        messageIndex,
        totalChunks: chunks.length,
        firstChunkSize: chunks[0] ? atob(chunks[0]).length : 0,
      })

      // Initialize appended chunks count
      state.appendedChunksCount = 0

      // Flag to track if playback has started
      let playbackStarted = false

      // Append chunks progressively
      const appendNextAvailableChunk = () => {
        if (
          state.appendedChunksCount! < state.audioChunks!.length &&
          !sourceBuffer.updating &&
          mediaSource.readyState === 'open'
        ) {
          const nextChunk = state.audioChunks![state.appendedChunksCount!]
          if (nextChunk !== undefined) {
            try {
              const binaryChunk = Uint8Array.from(atob(nextChunk), c => c.charCodeAt(0))
              sourceBuffer.appendBuffer(binaryChunk)
              state.appendedChunksCount!++
              console.log('[ClearIdeasWidget] Appended chunk to MediaSource', {
                messageIndex,
                chunkIndex: state.appendedChunksCount! - 1,
                totalChunks: state.audioChunks!.length,
              })
              return true
            } catch (e) {
              console.error('[ClearIdeasWidget] Error appending chunk:', e, {
                messageIndex,
                chunkIndex: state.appendedChunksCount,
              })
            }
          }
        }
        return false
      }

      // Set up continuous appending - this will be called after each chunk is appended
      sourceBuffer.addEventListener('updateend', () => {
        // Start playback after initialization segment (chunk 0) is appended
        if (!playbackStarted && state.appendedChunksCount! >= 1) {
          playbackStarted = true
          state.isPlaying = true
          audio
            .play()
            .then(() => {
              console.log('[ClearIdeasWidget] MediaSource playback started', {
                messageIndex,
                chunksAppended: state.appendedChunksCount,
              })
            })
            .catch(err => {
              console.warn('[ClearIdeasWidget] Failed to start MediaSource playback:', err)
              const currentState = messageAudioState.value.get(messageIndex)
              if (currentState) {
                currentState.isPlaying = false
                currentState.isUsingProgressivePlayback = false
              }
            })
        }

        // Try to append next chunk after current one finishes
        appendNextAvailableChunk()

        // Check if we should end the stream (all chunks appended and complete audio received)
        if (state.completeAudioReceived) {
          const validChunksCount = state.audioChunks!.filter(
            (chunk: string | undefined): chunk is string => Boolean(chunk),
          ).length

          if (
            state.appendedChunksCount! >= validChunksCount &&
            !sourceBuffer.updating &&
            mediaSource.readyState === 'open'
          ) {
            try {
              mediaSource.endOfStream()
              console.log('[ClearIdeasWidget] MediaSource stream ended (all chunks appended)', {
                messageIndex,
                appendedChunks: state.appendedChunksCount,
                validChunks: validChunksCount,
              })
            } catch (e) {
              console.warn('[ClearIdeasWidget] Error ending MediaSource stream:', e)
            }
          }
        }
      })

      // Start by appending the first available chunk (chunk 0)
      if (chunks.length > 0) {
        appendNextAvailableChunk()
      } else {
        console.warn('[ClearIdeasWidget] No chunks available to append', {
          messageIndex,
        })
      }

      console.log('[ClearIdeasWidget] MediaSource playback initialized', {
        messageIndex,
        initialChunks: chunks.length,
      })
    } catch (e) {
      console.error('[ClearIdeasWidget] Error creating source buffer:', e)
      state.isUsingProgressivePlayback = false
      state.isPlaying = false
    }
  })

  // Handle MediaSource errors
  mediaSource.addEventListener('error', e => {
    console.error('[ClearIdeasWidget] MediaSource error:', e, {
      messageIndex,
      readyState: mediaSource.readyState,
      sourceBuffers: mediaSource.sourceBuffers.length,
    })
    const currentState = messageAudioState.value.get(messageIndex)
    if (currentState) {
      currentState.isUsingProgressivePlayback = false
      currentState.isPlaying = false
    }
  })

  // Log MediaSource state changes
  mediaSource.addEventListener('sourceended', () => {
    console.log('[ClearIdeasWidget] MediaSource sourceended', { messageIndex })
  })

  mediaSource.addEventListener('sourceclose', () => {
    console.log('[ClearIdeasWidget] MediaSource sourceclose', { messageIndex })
  })
}

// Trigger appending of next chunk to MediaSource
// The continuous updateend listener handles most appending,
// but we call this to trigger immediate append if sourceBuffer is idle
function appendChunkToMediaSource(messageIndex: number, _base64Chunk: string) {
  const state = messageAudioState.value.get(messageIndex)
  if (!state || !state.sourceBuffer || !state.mediaSource || !state.audioChunks) {
    return
  }

  // If sourceBuffer is not updating, try to append the next chunk immediately
  if (!state.sourceBuffer.updating && state.mediaSource.readyState === 'open') {
    if (state.appendedChunksCount === undefined) {
      state.appendedChunksCount = 0
    }

    // Check if the next chunk in sequence is available
    if (state.appendedChunksCount < state.audioChunks.length) {
      const nextChunk = state.audioChunks[state.appendedChunksCount]
      if (nextChunk !== undefined) {
        try {
          const binaryChunk = Uint8Array.from(atob(nextChunk), c => c.charCodeAt(0))
          state.sourceBuffer.appendBuffer(binaryChunk)
          state.appendedChunksCount++
          console.log('[ClearIdeasWidget] Triggered immediate chunk append', {
            messageIndex,
            chunkIndex: state.appendedChunksCount - 1,
            totalChunks: state.audioChunks.length,
          })
        } catch (e) {
          console.error('[ClearIdeasWidget] Error appending chunk:', e)
        }
      }
    }
  }
  // If sourceBuffer is updating, the updateend listener will handle it automatically
}

// End the MediaSource stream after all chunks are appended
function appendRemainingChunksAndEndStream(messageIndex: number) {
  const state = messageAudioState.value.get(messageIndex)
  if (!state || !state.sourceBuffer || !state.mediaSource || !state.audioChunks) {
    return
  }

  // Mark that complete audio has arrived
  state.completeAudioReceived = true

  console.log(
    '[ClearIdeasWidget] Complete audio received, will end stream after all chunks appended',
    {
      messageIndex,
      appendedChunks: state.appendedChunksCount,
      totalChunks: state.audioChunks.length,
      sourceBufferUpdating: state.sourceBuffer.updating,
      mediaSourceState: state.mediaSource.readyState,
    },
  )

  // The updateend listener in startProgressivePlayback will check this flag and end the stream
  // when all chunks are appended. We don't add a competing listener here.
}

// Audio playback functions are now provided by useAudioPlayback composable
// These are just kept here for progressive playback compatibility

// Helper computed functions for message audio state access
function getMessageAudioCurrentTime(index: number): number {
  return messageAudioState.value.get(index)?.currentTime || 0
}

function getMessageAudioDuration(index: number): number {
  return messageAudioState.value.get(index)?.duration || 0
}

// Watch for audio state changes to update tooltips
watch(
  () => messages.value.map((_: ChatMessage, index: number) => isMessageAudioPlaying(index)),
  () => {
    nextTick(() => {
      audioBtnRefs.value.forEach((element: HTMLElement, index: number) => {
        if (element && tippyInstances.value.has(element)) {
          const instance = tippyInstances.value.get(element)
          instance?.setContent(isMessageAudioPlaying(index) ? t('audio.pause') : t('audio.play'))
        }
      })
    })
  },
  { deep: true },
)

// Watch for isOpen changes to update FAB tooltip
watch(isOpen, () => {
  nextTick(() => {
    if (fabBtnRef.value && tippyInstances.value.has(fabBtnRef.value)) {
      const instance = tippyInstances.value.get(fabBtnRef.value)
      instance?.setContent(isOpen.value ? t('fab.closeChat') : t('fab.openChat'))
    }
  })
})

// Watch for consentGranted changes to handle migration between storage types
watch(resolvedConsentGranted, async (newValue, oldValue) => {
  if (typeof window === 'undefined') {
    return
  }

  // Handle transition from false to true (consent granted)
  if (oldValue === false && newValue === true && resolvedConsentRequired.value === true) {
    // Clear cached init data - consent state changed
    clearCachedInitData()
    // Migrate sessionId from sessionStorage to localStorage if it exists
    if (sessionId.value) {
      const sessionIdFromSessionStorage = sessionStorage.getItem('clearideasPublicChatSessionId')
      if (sessionIdFromSessionStorage && sessionIdFromSessionStorage === sessionId.value) {
        try {
          // Migrate to localStorage
          localStorage.setItem('clearideasPublicChatSessionId', sessionId.value)
          sessionStorage.removeItem('clearideasPublicChatSessionId')
          debugLog(
            '[ClearIdeasWidget] Migrated session ID from sessionStorage to localStorage:',
            sessionId.value,
          )

          // Re-initialize to establish cookie for existing session
          await loadInitData()
        } catch (err) {
          debugWarn('[ClearIdeasWidget] Failed to migrate session ID to localStorage:', err)
          // Continue - session ID remains in sessionStorage
        }
      }
    }
  }

  // Handle transition from true to false (consent denied/revoked)
  if (oldValue === true && newValue === false && resolvedConsentRequired.value === true) {
    // Clear cached init data - consent state changed
    clearCachedInitData()
    // Move sessionId from localStorage to sessionStorage if it exists
    if (sessionId.value) {
      const sessionIdFromLocalStorage = localStorage.getItem('clearideasPublicChatSessionId')
      if (sessionIdFromLocalStorage && sessionIdFromLocalStorage === sessionId.value) {
        try {
          // Migrate to sessionStorage
          sessionStorage.setItem('clearideasPublicChatSessionId', sessionId.value)
          localStorage.removeItem('clearideasPublicChatSessionId')
          debugLog(
            '[ClearIdeasWidget] Migrated session ID from localStorage to sessionStorage (consent revoked):',
            sessionId.value,
          )
        } catch (err) {
          debugWarn('[ClearIdeasWidget] Failed to migrate session ID to sessionStorage:', err)
          // Continue - session ID remains in localStorage
        }
      }
    } else {
      // If no sessionId in memory, clean up any leftover localStorage entry
      const leftoverSessionId = localStorage.getItem('clearideasPublicChatSessionId')
      if (leftoverSessionId) {
        localStorage.removeItem('clearideasPublicChatSessionId')
        debugLog(
          '[ClearIdeasWidget] Removed leftover session ID from localStorage (consent revoked)',
        )
      }
    }
  }
})

// Duration formatting is now in utils/duration.ts
// Voice recording support is now provided by useVoiceRecording composable

// Remove auto-switch to chat - user must manually click chat action
// watch(
//   () => messages.value.length,
//   len => {
//     if (len > 0) currentView.value = 'chat'
//   },
// )

// Click handler for chat-source elements
function addClickEventListener() {
  if (messageContentContainer.value) {
    messageContentContainer.value.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.classList.contains('chat-source')) {
        event.preventDefault()
        // Use data-original-url first (external link), then fall back to href
        const href = target.getAttribute('data-original-url') || target.getAttribute('href')
        if (href) {
          window.open(href, '_blank', 'noopener,noreferrer')
        }
      }
    })
  }
}

// Initialize tippy tooltips for chat-source elements
function initializeTippy() {
  if (messageContentContainer.value) {
    const tippyElements = messageContentContainer.value.querySelectorAll('.chat-source')
    tippyElements.forEach((element: Element) => {
      const tippyContent = element.getAttribute('data-tippy-content')
      if (tippyContent) {
        tippy(element, {
          content: tippyContent,
          allowHTML: true,
          placement: 'top',
        })
      }
    })
  }
}

// Auto-scroll to bottom when messages update
const messagesContainer = ref<HTMLElement | null>(null)
watch(
  () => [messages.value.length, streamingContent.value],
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
      addClickEventListener()
      initializeTippy()
      initializeButtonTooltips()
    })
  },
  { deep: true },
)

watch(
  () => streamingContent.value,
  () => {
    nextTick(() => {
      addClickEventListener()
      initializeTippy()
      initializeButtonTooltips()
    })
  },
)

// Watch for recording state changes to initialize tooltips for recording buttons
watch(isRecording, () => {
  nextTick(() => {
    initializeButtonTooltips()
  })
})

// Watch for view changes to initialize tooltips when buttons appear
watch(currentView, newView => {
  nextTick(() => {
    initializeButtonTooltips()
    // Check for disclaimer dialog when switching to chat view
    if (newView === 'chat') {
      checkAndShowDisclaimerDialog()
      // Check scroll position after dialog appears
      if (showDisclaimerDialog.value) {
        nextTick(() => {
          checkDisclaimerDialogScroll()
        })
      }
    } else {
      // Hide disclaimer if switching away from chat view
      if (showDisclaimerDialog.value) {
        showDisclaimerDialog.value = false
      }
    }
  })
})
</script>

<template>
  <div
    class="ci-widget"
    :class="[positionClass, { 'ci-widget-dark': isDarkMode }]"
    :style="{ ...absoluteStyle, ...widgetContainerStyle }"
  >
    <Transition name="ci-widget-scale-fade">
      <div v-if="isOpen" class="ci-widget-panel ci-widget-card" :style="panelStyle">
        <!-- Disclaimer Dialog Overlay -->
        <Transition name="ci-widget-fade">
          <div
            v-if="
              showDisclaimerDialog &&
              initData?.disclaimerDialogEnabled &&
              initData?.disclaimerDialogText &&
              currentView === 'chat'
            "
            class="ci-widget-disclaimer-dialog-overlay"
            @click.self="dismissDisclaimerDialog"
          >
            <div class="ci-widget-disclaimer-dialog">
              <div
                ref="disclaimerDialogContentRef"
                class="ci-widget-disclaimer-dialog__content"
                @scroll="checkDisclaimerDialogScroll"
              >
                <div class="ci-widget-disclaimer-dialog__text">
                  {{ initData.disclaimerDialogText }}
                </div>
                <!-- Scroll indicator -->
                <div
                  v-if="
                    !disclaimerDialogHasScrolled &&
                    disclaimerDialogContentRef &&
                    disclaimerDialogContentRef.scrollHeight >
                      disclaimerDialogContentRef.clientHeight
                  "
                  class="ci-widget-disclaimer-dialog__scroll-indicator"
                >
                  <span>{{ t('disclaimerDialog.scrollToContinue') }}</span>
                  <span class="ci-widget-disclaimer-dialog__scroll-arrow">↓</span>
                </div>
              </div>
              <div class="ci-widget-disclaimer-dialog__footer">
                <button
                  class="ci-widget-disclaimer-dialog__button"
                  :class="{
                    'ci-widget-disclaimer-dialog__button--disabled':
                      !disclaimerDialogScrolledToBottom,
                  }"
                  :disabled="!disclaimerDialogScrolledToBottom"
                  @click="dismissDisclaimerDialog"
                  :style="{ backgroundColor: widgetColor }"
                >
                  {{ t('disclaimerDialog.ok') }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
        <WidgetHeader
          :current-view="currentView"
          :init-data="initData"
          :widget-chat-name="widgetChatName"
          :widget-color-base="widgetColorBase"
          :widget-color-light="widgetColorLight"
          :widget-color-dark="widgetColorDark"
          :header-contrast-color="headerContrastColor"
          :display-name="displayName"
          @go-home="goToHome"
          @close="closeWidget"
          @back-btn-ref="setBackBtnRef"
          @close-btn-ref="setCloseBtnRef"
        />
        <div ref="messagesContainer" class="ci-widget-panel__body">
          <Transition name="ci-widget-view-fade">
            <RealtimeVoiceView
              v-if="realtimeVoiceModeOpen"
              key="realtime-voice"
              :connection-state="realtimeVoiceConnectionState"
              :is-responding="realtimeVoiceResponding"
              :is-muted="realtimeVoiceMuted"
              :duration="realtimeRecordingDuration"
              :waveform-data="realtimeWaveformData"
              :widget-color="widgetColor"
              :caption="realtimeVoiceCaption"
              :has-user-spoken="realtimeUserHasSpoken"
              @toggle-mute="toggleRealtimeMuted"
              @end="endRealtimeVoiceMode"
              @use-recorded="useRecordedVoiceFallback"
            />

            <WidgetHomeView
              v-else-if="currentView === 'home'"
              key="home"
              :actions="widgetLinks"
              :widget-color="widgetColor"
              @action="handleAction"
            />

            <div v-else key="chat">
              <!-- Messages display -->
              <div class="ci-widget-messages" ref="messageContentContainer">
                <!-- AI Disclaimer -->
                <div class="ci-widget-disclaimer">
                  <span
                    class="ci-widget-icon"
                    v-html="getIconSVG('triangleExclamation', 14)"
                  ></span>
                  <span>
                    {{ initData?.disclaimerText || t('chat.disclaimer') }}
                  </span>
                </div>
                <!-- Initial greeting message -->
                <!-- Show for new chats until an existing chat is restored or a conversation starts -->
                <ChatMessageComponent
                  v-if="isNewChat && !loadingInit && initData?.initialMessage"
                  :key="'initial'"
                  :message="{
                    role: 'assistant',
                    content: initData.initialMessage || '',
                    createdAt: new Date(),
                  }"
                  :index="-1"
                  :widget-color="widgetColor"
                  :is-playing="false"
                  :current-time="0"
                  :duration="0"
                  :progress="0"
                  @toggle="() => {}"
                  @seek="() => {}"
                  @audio-btn-ref="() => {}"
                />
                <!-- Regular messages from existing chat or new messages -->
                <ChatMessageComponent
                  v-for="(message, index) in messages"
                  :key="`msg-${index}`"
                  :message="message"
                  :index="index"
                  :widget-color="widgetColor"
                  :is-playing="isMessageAudioPlaying(index)"
                  :current-time="getMessageAudioCurrentTime(index)"
                  :duration="getMessageAudioDuration(index)"
                  :progress="getMessageAudioProgress(index)"
                  @toggle="toggleMessageAudio"
                  @seek="setMessageAudioTime"
                  @audio-btn-ref="
                    (idx, el) => {
                      if (el) {
                        audioBtnRefs.set(idx, el)
                        nextTick(() => initializeButtonTooltips())
                      }
                    }
                  "
                />
                <!-- Show generating indicator throughout entire stream -->
                <div
                  v-if="loading || streamingAssistantIndex >= 0"
                  class="ci-widget-message ci-widget-message--assistant"
                >
                  <div class="generating-item">
                    <div class="generating-standalone">
                      <div class="generating-indicator">
                        <div class="generating-animation">
                          <div class="dot"></div>
                          <div class="dot"></div>
                          <div class="dot"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="error" class="ci-widget-message ci-widget-message--error">
                  <div class="ci-widget-message__content">
                    <span
                      class="ci-widget-icon"
                      v-html="getIconSVG('triangleExclamation', 16)"
                    ></span>
                    <span>{{ error }}</span>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
        <div v-if="!realtimeVoiceModeOpen" class="ci-widget-panel__footer">
          <template v-if="currentView === 'chat'">
            <ChatInput
              ref="chatInputRef"
              v-model="chatInputContent"
              :disabled="loading"
              :loading="loading"
              :is-recording="voiceInputActive"
              :recording-duration="voiceInputDuration"
              :waveform-data="voiceInputWaveform"
              :voice-enabled="voiceEnabled"
              :supports-voice-recording="supportsAnyVoice"
              :expanded="chatInputExpanded"
              @send="trySendChatInput"
              @start-recording="startRecording"
              @stop-recording="completeVoiceInput"
              @cancel-recording="cancelVoiceInput"
              @focus="chatInputFocused = true"
              @blur="chatInputFocused = false"
              @voice-btn-ref="setVoiceBtnRef"
              @send-btn-ref="setSendBtnRef"
              @cancel-btn-ref="setCancelBtnRef"
              @accept-btn-ref="setAcceptBtnRef"
            />
            <div v-if="chatId && messages.length > 0" class="ci-widget-new-chat-wrapper">
              <button
                ref="newChatBtnRef"
                class="ci-widget-new-chat-btn"
                @click="startNewChat"
                :aria-label="t('chat.newChatAria')"
              >
                <span class="ci-widget-icon" v-html="getIconSVG('plus', 12)"></span>
                <span>{{ t('chat.newChat') }}</span>
              </button>
            </div>
            <div class="ci-widget-powered">
              <a
                href="https://clearideas.com?utm_source=widget&utm_medium=chat&utm_campaign=powered_by"
                target="_blank"
                rel="noopener noreferrer"
                class="ci-widget-powered__link"
              >
                {{ t('chat.poweredBy') }}
              </a>
            </div>
          </template>
          <template v-else>
            <div class="ci-widget-powered">
              <a
                href="https://clearideas.com?utm_source=widget&utm_medium=chat&utm_campaign=powered_by"
                target="_blank"
                rel="noopener noreferrer"
                class="ci-widget-powered__link"
              >
                {{ t('chat.poweredBy') }}
              </a>
            </div>
          </template>
        </div>
      </div>
    </Transition>

    <WidgetFAB
      v-if="fabVisible"
      :is-open="isOpen"
      :widget-color="widgetColor"
      :fab-size="props.fabSize"
      @toggle="toggleWidget"
      @fab-btn-ref="setFabBtnRef"
    />

    <!-- Hello Bubble -->
    <Transition name="hello-bubble">
      <div
        v-if="isHelloBubbleVisible && helloBubbleText"
        class="ci-widget-hello-bubble"
        :style="helloBubbleStyle"
        @click="hideHelloBubble"
      >
        <div
          class="ci-widget-hello-bubble__content"
          :style="{
            background: `linear-gradient(135deg, ${widgetColor} 0%, ${adjustColorLightness(widgetColor, -15)} 100%)`,
            boxShadow: `0 8px 24px ${hexToRgba(widgetColor, 0.4)}, 0 4px 12px rgba(0, 0, 0, 0.15)`,
          }"
        >
          <div
            v-if="initData?.iconUrl"
            class="ci-widget-hello-bubble__icon"
            v-html="
              `<img src='${initData.iconUrl}' alt='' style='width: 24px; height: 24px; object-fit: contain;' />`
            "
          ></div>
          <div v-else class="ci-widget-hello-bubble__icon" v-html="getIconSVG('ciIcon', 24)"></div>
          <div class="ci-widget-hello-bubble__text">{{ helloBubbleText }}</div>
          <button
            class="ci-widget-hello-bubble__close"
            @click.stop="hideHelloBubble"
            :aria-label="t('helloBubble.close')"
          >
            ×
          </button>
        </div>
        <div class="ci-widget-hello-bubble__arrow" :style="helloBubbleArrowStyle"></div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Widget container */
.ci-widget {
  --ci-widget-surface: 255, 255, 255;
  --ci-widget-on-surface: 33, 33, 33;
  --ci-widget-background: 255, 255, 255;
  --ci-widget-on-background: 33, 33, 33;
  --ci-widget-border-color: 145, 145, 145;
  --ci-widget-border-opacity: 0.24;
  --ci-widget-medium-emphasis-opacity: 0.8;
  --ci-widget-high-emphasis-opacity: 0.9;
  position: fixed;
  z-index: 2100;
  color: rgb(var(--ci-widget-on-surface));
  color-scheme: light;
  /* Size is set dynamically via inline style based on fabSize prop */
}

.ci-widget.pos-br {
  right: 16px;
  bottom: 16px;
}

.ci-widget.pos-bl {
  left: 16px;
  bottom: 16px;
}

.ci-widget.pos-tr {
  right: 16px;
  top: 16px;
}

.ci-widget.pos-tl {
  left: 16px;
  top: 16px;
}

.ci-widget.pos-absolute {
  position: fixed;
}

/* FAB button styles moved to WidgetFAB.vue component */

/* Hello Bubble */
.ci-widget-hello-bubble {
  position: absolute;
  /* Positioning is set dynamically via inline styles based on widget position */
  z-index: 2200;
  pointer-events: auto;
  animation: helloBubblePulse 2s ease-in-out infinite;
}

.ci-widget-hello-bubble__content {
  /* Background and box-shadow are set dynamically via inline styles */
  color: white;
  padding: 14px 16px;
  border-radius: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  overflow: visible; /* Allow arrow to overlap without clipping */
}

.ci-widget-hello-bubble__content:hover {
  transform: translateY(-2px);
  /* Box-shadow is updated dynamically via inline styles */
}

.ci-widget-hello-bubble:hover .ci-widget-hello-bubble__arrow {
  transform: translateY(-2px);
}

.ci-widget-hello-bubble__icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ci-widget-hello-bubble__text {
  flex: 1;
  font-weight: 500;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.ci-widget-hello-bubble__close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background 0.2s ease,
    transform 0.2s ease;
  padding: 0;
  margin: 0;
}

.ci-widget-hello-bubble__close:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.ci-widget-hello-bubble__arrow {
  position: absolute;
  /* Positioning and direction are set dynamically via inline styles */
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
  z-index: 1;
  transition: transform 0.2s ease;
}

/* Hello Bubble Animations */
@keyframes helloBubblePulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}

/* Hello Bubble Transition */
.hello-bubble-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.hello-bubble-leave-active {
  transition: all 0.3s ease-in;
}

.hello-bubble-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.9);
}

.hello-bubble-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.hello-bubble-enter-to,
.hello-bubble-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Panel */
.ci-widget-panel {
  position: absolute;
  /* Positioning is set dynamically via inline styles based on widget position */
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  opacity: 1 !important;
  background: rgb(255, 255, 255) !important;
  background-color: rgb(255, 255, 255) !important;
  color: rgb(var(--ci-widget-on-surface)) !important;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
}

.ci-widget-card {
  background: rgb(255, 255, 255) !important;
  background-color: rgb(255, 255, 255) !important;
  color: rgb(var(--ci-widget-on-surface)) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  opacity: 1 !important;
}

/* Ensure dark mode backgrounds are solid - override CSS variables */
.ci-widget.ci-widget-dark {
  --ci-widget-surface: 31, 31, 31;
  --ci-widget-background: 24, 24, 24;
  --ci-widget-on-surface: 255, 255, 255;
  --ci-widget-on-background: 255, 255, 255;
  --ci-widget-border-color: 234, 234, 234;
  --ci-widget-border-opacity: 0.12;
  color: rgb(var(--ci-widget-on-surface));
  color-scheme: dark;
}

/* Force solid backgrounds in dark mode - completely override CSS variables */
/* Must be more specific than .ci-widget-card to override !important */
.ci-widget.ci-widget-dark .ci-widget-panel.ci-widget-card,
.ci-widget.ci-widget-dark .ci-widget-card.ci-widget-panel,
.ci-widget.ci-widget-dark .ci-widget-card,
.ci-widget.ci-widget-dark div.ci-widget-panel.ci-widget-card,
.ci-widget.ci-widget-dark div.ci-widget-card.ci-widget-panel {
  /* Completely override any CSS variable usage */
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
  background-image: none !important;
  color: rgb(var(--ci-widget-on-surface)) !important;
  opacity: 1 !important;
  /* Reset any potential transparent backgrounds */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.ci-widget.ci-widget-dark .ci-widget-panel {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
  color: rgb(var(--ci-widget-on-surface)) !important;
  opacity: 1 !important;
}

.ci-widget.ci-widget-dark .ci-widget-messages {
  background: rgb(24, 24, 24) !important;
  background-color: rgb(24, 24, 24) !important;
  color: rgb(var(--ci-widget-on-background)) !important;
  opacity: 1 !important;
}

.ci-widget.ci-widget-dark .ci-widget-action:not(.ci-widget-action--chat) {
  background-color: rgb(31, 31, 31) !important;
  background: rgb(31, 31, 31) !important;
}

/* Override all message content backgrounds in dark mode */
.ci-widget.ci-widget-dark .ci-widget-message--assistant .ci-widget-message__content {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
  opacity: 1 !important;
}

.ci-widget.ci-widget-dark .consumer-input__wrapper {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
  border: 1px solid rgba(234, 234, 234, 0.12) !important;
}

.ci-widget.ci-widget-dark .consumer-input__textarea,
.ci-widget.ci-widget-dark .consumer-input__waveform {
  background: transparent !important;
  background-color: transparent !important;
  color: rgb(var(--ci-widget-on-surface)) !important;
}

.ci-widget.ci-widget-dark .consumer-input__textarea::placeholder {
  color: rgba(var(--ci-widget-on-surface), 0.56) !important;
}

.ci-widget.ci-widget-dark .consumer-input__voice-btn {
  color: rgb(255, 255, 255) !important;
}

.ci-widget.ci-widget-dark .consumer-input__accept-btn {
  background: rgb(var(--ci-widget-feature)) !important;
  background-color: rgb(var(--ci-widget-feature)) !important;
}

.ci-widget.ci-widget-dark .ci-widget-audio-btn {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
}

/* Header styles moved to WidgetHeader.vue component */

/* Override header in dark mode to bypass CSS variables */
.ci-widget.ci-widget-dark .ci-widget-panel__header:not(.ci-widget-panel__header--chat) {
  background: rgb(31, 31, 31);
  background-color: rgb(31, 31, 31);
  opacity: 1;
  border-bottom: 1px solid rgba(234, 234, 234, 0.12);
}

/* Ensure chat header background color from inline style takes precedence */
.ci-widget-panel__header--chat {
  background: var(--chat-header-bg) !important;
  background-color: var(--chat-header-bg) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.ci-widget.ci-widget-dark .ci-widget-panel__header--chat {
  background: var(--chat-header-bg) !important;
  background-color: var(--chat-header-bg) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* When header has feature color background in dark mode, override defaults */
.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero):not([style*='background-color'])
  .ci-widget-title {
  color: rgb(255, 255, 255);
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero):not([style*='background-color'])
  .ci-widget-icon {
  color: rgb(255, 255, 255);
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero):not([style*='background-color'])
  .ci-widget-btn-icon {
  color: rgb(234, 234, 234);
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero):not([style*='background-color'])
  .ci-widget-btn-icon:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgb(255, 255, 255);
}

.ci-widget.ci-widget-dark .ci-widget-panel__header--hero {
  background: transparent !important;
}

.ci-widget.ci-widget-dark .ci-widget-hero-background {
  opacity: 0.9;
}

.ci-widget.ci-widget-dark .ci-widget-hero-background__layer {
  opacity: 0.5;
}

.ci-widget.ci-widget-dark .ci-widget-hero-background__layer--3 {
  opacity: 0.4;
}

.ci-widget-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  flex: 1;
  min-width: 0;
  transition: color 0.2s ease;
}

.ci-widget-title-icon {
  width: 24px;
  height: 24px;
}

.ci-widget-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ci-widget-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
  z-index: 2;
}

.ci-widget-header-icon {
  display: block;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.ci-widget-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.ci-widget-icon svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

.ci-widget-icon svg path {
  fill: currentColor;
}

.ci-widget-btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.ci-widget-btn-icon:hover {
  background: rgba(0, 0, 0, 0.1);
}

.ci-widget.ci-widget-dark .ci-widget-btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* When header has feature color, hover should be contrast-aware */
.ci-widget-panel__header:not(.ci-widget-panel__header--hero) .ci-widget-btn-icon:hover {
  background: rgba(0, 0, 0, 0.15);
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero)
  .ci-widget-btn-icon:hover {
  background: rgba(255, 255, 255, 0.15);
}

.ci-widget-btn-icon .ci-widget-icon {
  width: 18px;
  height: 18px;
}

.ci-widget-panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: rgb(255, 255, 255) !important;
  background-color: rgb(255, 255, 255) !important;
  opacity: 1 !important;
}

/* Override body in dark mode to bypass CSS variables */
.ci-widget.ci-widget-dark .ci-widget-panel__body {
  background: rgb(24, 24, 24) !important;
  background-color: rgb(24, 24, 24) !important;
  opacity: 1 !important;
}

.ci-widget-panel__footer {
  padding: 8px;
  background: rgb(255, 255, 255) !important;
  background-color: rgb(255, 255, 255) !important;
  border-top: 1px solid rgba(145, 145, 145, 0.24) !important;
  opacity: 1 !important;
}

/* Override footer in dark mode to bypass CSS variables */
.ci-widget.ci-widget-dark .ci-widget-panel__footer {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
  border-top: 1px solid rgba(234, 234, 234, 0.12) !important;
  opacity: 1 !important;
}

/* Dark mode border overrides */

.ci-widget.ci-widget-dark .ci-widget-message--assistant .ci-widget-message__content {
  border: 1px solid rgba(234, 234, 234, 0.12) !important;
}

.ci-widget.ci-widget-dark .consumer-input__voice-btn {
  border-left: 1px solid rgba(234, 234, 234, 0.12) !important;
  color: rgb(255, 255, 255) !important;
}

.ci-widget.ci-widget-dark .consumer-input__cancel-btn {
  border: 1px solid rgba(211, 47, 47, 0.3) !important;
}

.ci-widget-new-chat-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 4px;
  margin-bottom: 2px;
}

.ci-widget-new-chat-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: rgba(var(--ci-widget-on-surface), var(--ci-widget-medium-emphasis-opacity));
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.ci-widget-new-chat-btn:hover {
  background: rgba(var(--ci-widget-on-surface), 0.05);
  color: rgba(var(--ci-widget-on-surface), var(--ci-widget-high-emphasis-opacity));
}

.ci-widget-new-chat-btn:active {
  background: rgba(var(--ci-widget-on-surface), 0.1);
}

.ci-widget-new-chat-btn span:last-child {
  font-weight: 500;
}

.ci-widget-new-chat-btn .ci-widget-icon {
  width: 12px;
  height: 12px;
}

.ci-widget-powered {
  text-align: center;
  font-size: 11px;
  color: rgba(var(--ci-widget-on-surface), var(--ci-widget-medium-emphasis-opacity));
  margin-top: 6px;
}

.ci-widget-powered__link {
  color: rgba(var(--ci-widget-on-surface), var(--ci-widget-medium-emphasis-opacity));
  text-decoration: none;
  transition: opacity 0.2s ease;
}

.ci-widget-powered__link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

/* Transition */
.ci-widget-scale-fade-enter-active,
.ci-widget-scale-fade-leave-active {
  transition: all 150ms ease;
}

.ci-widget-scale-fade-enter-active {
  opacity: 1 !important;
}

.ci-widget-scale-fade-enter-from,
.ci-widget-scale-fade-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

.ci-widget-scale-fade-enter-to {
  opacity: 1 !important;
}

/* View transition between home and chat */
.ci-widget-view-fade-enter-active,
.ci-widget-view-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.ci-widget-view-fade-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.ci-widget-view-fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* Home view and action styles moved to WidgetHeader.vue and WidgetHomeView.vue components */

/* Messages container styling */
.ci-widget-messages {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  background: rgb(255, 255, 255) !important;
  background-color: rgb(255, 255, 255) !important;
  opacity: 1 !important;
}

/* AI Disclaimer styling */
.ci-widget-disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(var(--ci-widget-secondary, 163, 177, 198), 0.7);
}

.ci-widget-disclaimer .ci-widget-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: rgba(var(--ci-widget-secondary, 163, 177, 198), 0.7);
  width: 14px;
  height: 14px;
}

.ci-widget-disclaimer span:last-child {
  flex: 1;
}

/* Dark mode disclaimer */
.ci-widget.ci-widget-dark .ci-widget-disclaimer {
  color: rgba(var(--ci-widget-secondary, 107, 124, 145), 0.8) !important;
}

.ci-widget.ci-widget-dark .ci-widget-disclaimer .ci-widget-icon {
  color: rgba(var(--ci-widget-secondary, 107, 124, 145), 0.8) !important;
}

/* Disclaimer Dialog Overlay */
.ci-widget-disclaimer-dialog-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
  border-radius: 12px; /* Match panel border radius */
}

.ci-widget-disclaimer-dialog {
  background: rgb(var(--ci-widget-surface, 255, 255, 255));
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: 90%;
  max-height: 80%;
  width: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ci-widget-disclaimer-dialog__content {
  padding: 24px;
  padding-bottom: 60px; /* Extra space for scroll indicator */
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  position: relative;
}

.ci-widget-disclaimer-dialog__text {
  font-size: 14px;
  line-height: 1.6;
  color: rgb(var(--ci-widget-on-surface, 33, 33, 33));
  white-space: pre-wrap;
  word-wrap: break-word;
}

.ci-widget-disclaimer-dialog__footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(var(--ci-widget-border-color, 145, 145, 145), 0.24);
  display: flex;
  justify-content: center;
}

.ci-widget-disclaimer-dialog__button {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: opacity 0.2s;
}

.ci-widget-disclaimer-dialog__button:hover {
  opacity: 0.9;
}

.ci-widget-disclaimer-dialog__button:active {
  opacity: 0.8;
}

.ci-widget-disclaimer-dialog__button--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.ci-widget-disclaimer-dialog__scroll-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 24px;
  background: linear-gradient(
    to top,
    rgb(var(--ci-widget-surface, 255, 255, 255)) 0%,
    rgba(var(--ci-widget-surface, 255, 255, 255), 0.9) 60%,
    transparent 100%
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  font-size: 12px;
  color: rgba(var(--ci-widget-on-surface, 33, 33, 33), 0.6);
}

.ci-widget-disclaimer-dialog__scroll-arrow {
  font-size: 16px;
  animation: bounce 1.5s ease-in-out infinite;
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(4px);
  }
}

/* Dark mode scroll indicator */
.ci-widget.ci-widget-dark .ci-widget-disclaimer-dialog__scroll-indicator {
  background: linear-gradient(
    to top,
    rgb(var(--ci-widget-surface, 31, 31, 31)) 0%,
    rgba(var(--ci-widget-surface, 31, 31, 31), 0.9) 60%,
    transparent 100%
  );
  color: rgba(var(--ci-widget-on-surface, 255, 255, 255), 0.6);
}

/* Dark mode disclaimer dialog */
.ci-widget.ci-widget-dark .ci-widget-disclaimer-dialog {
  background: rgb(var(--ci-widget-surface, 31, 31, 31)) !important;
  background-color: rgb(var(--ci-widget-surface, 31, 31, 31)) !important;
}

.ci-widget.ci-widget-dark .ci-widget-disclaimer-dialog__text {
  color: rgb(var(--ci-widget-on-surface, 255, 255, 255));
}

.ci-widget.ci-widget-dark .ci-widget-disclaimer-dialog__footer {
  border-top-color: rgba(var(--ci-widget-border-color, 234, 234, 234), 0.12);
}

/* Message styles moved to ChatMessage.vue component */
/* Initial message is now rendered via ChatMessageComponent, so no duplicate styles needed */

/* Generating indicator (inlined from ChatGeneratingIndicator) */
.generating-item {
  display: flex;
  justify-content: center;
  align-items: center;
  padding-top: 8px;
  padding-bottom: 8px;
}

.generating-standalone {
  margin-left: 8px;
  margin-right: 8px;
  padding: 8px;
}

.generating-indicator {
  display: flex;
  align-items: center;
}

.generating-animation {
  display: flex;
  gap: 4px;
}

.generating-animation .dot {
  --size: 8px;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: rgba(var(--ci-widget-feature), 0.8);
  animation: dotWave 1.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  box-shadow: 0 0 0 rgba(var(--ci-widget-feature), 0);
}

.generating-animation .dot:nth-child(1) {
  animation-delay: -0.24s;
}

.generating-animation .dot:nth-child(2) {
  animation-delay: -0.12s;
}

.generating-animation .dot:nth-child(3) {
  animation-delay: 0s;
}

@keyframes dotWave {
  0%,
  100% {
    transform: translateY(0) scale(0.9);
    box-shadow: 0 0 0 rgba(var(--ci-widget-feature), 0);
    opacity: 0.6;
  }
  25% {
    transform: translateY(-6px) scale(1);
    box-shadow: 0 0 3px rgba(var(--ci-widget-feature), 0.6);
    opacity: 1;
  }
  50% {
    transform: translateY(0) scale(0.9);
    box-shadow: 0 0 0 rgba(var(--ci-widget-feature), 0);
    opacity: 0.6;
  }
  75% {
    transform: translateY(3px) scale(0.85);
    box-shadow: 0 0 3px rgba(var(--ci-widget-feature), 0.3);
    opacity: 0.7;
  }
}

/* Chat input styles moved to ChatInput.vue component */

@media (max-width: 600px) {
  .ci-widget-panel {
    width: calc(100vw - 24px) !important;
    height: calc(100vh - 110px) !important;
  }
}
</style>

<style>
/* Markdown tables are rendered inside the child message component. */
.ci-widget.ci-widget-dark .ci-widget-message__text th {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
}

/* Error message styles (error messages are still rendered directly, not via ChatMessageComponent) */
.ci-widget-message--error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.ci-widget-message--error .ci-widget-message__content {
  background: rgba(var(--ci-widget-error), 0.1);
  color: rgb(var(--ci-widget-error));
  border-radius: 8px;
  border: 1px solid rgba(var(--ci-widget-error), 0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  padding: 8px 12px;
  word-wrap: break-word;
  line-height: 1.5;
}

.ci-widget-message--error .ci-widget-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

@media print {
  .ci-widget,
  .ci-widget * {
    display: none !important;
    visibility: hidden !important;
  }
}
</style>
