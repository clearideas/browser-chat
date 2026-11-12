<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, nextTick, onMounted, onUnmounted, ref, unref, watch } from 'vue'

import ChatInput from './components/ChatInput.vue'
import ChatMessageComponent from './components/ChatMessage.vue'
import RealtimeVoiceView from './components/RealtimeVoiceView.vue'
import WidgetFAB from './components/WidgetFAB.vue'
import WidgetHeader from './components/WidgetHeader.vue'
import WidgetHomeView from './components/WidgetHomeView.vue'
import { type MessageAudioState, useAudioPlayback } from './composables/useAudioPlayback'
import { useRealtimeVoice } from './composables/useRealtimeVoice'
import { useVoiceRecording } from './composables/useVoiceRecording'
import {
  provideWidgetI18n,
  startWidgetLocaleTracking,
  stopWidgetLocaleTracking,
} from './i18n/runtime'
import type { WidgetMessagesOption } from './i18n/types'
import { getIconSVG } from './icons'
import type {
  ChatMessage,
  InitResponse,
  SessionActivationResponse,
  StreamEvent,
  WidgetAction,
  WidgetProps,
} from './types'
import { accentPalette, accentVariables } from './utils/color'
import { debugLog, debugWarn } from './utils/debug'
import {
  errorStatus,
  microphoneErrorKind,
  ServerMessageError,
  VOICE_ERROR_KEYS,
  type VoiceErrorKind,
} from './utils/errors'
import { uniqueId } from './utils/ids'
import { currentPageTheme, startPageThemeTracking, stopPageThemeTracking } from './utils/page-theme'
import {
  trackRealtimeTranscriptMessage,
  upsertRealtimeTranscriptMessage,
} from './utils/realtimeTranscript'
import { openExternal, safeColor, safeWebUrl } from './utils/safe'
import { createSseParser } from './utils/sse'
import {
  getBrowserStorage,
  migrateLegacyKeys,
  readItem,
  removeItem,
  storageKey,
  type StorageKeyName,
  storageNamespace,
  writeItem,
} from './utils/storage'

// Log immediately when component script loads

const props = withDefaults(defineProps<WidgetProps>(), {
  openOnLoad: false,
  position: 'bottom-right',
  width: 380,
  height: 540,
  fabHide: false,
  consentRequired: false,
  consentGranted: false,
  locale: undefined,
  // Without this default Vue turns an absent boolean prop into false, and the widget would never
  // follow the server's theme mode, the page theme or the system preference.
  darkMode: undefined,
})
// This widget's locale (shared with its child components, separate from other widgets).
const i18n = provideWidgetI18n()
const { locale: widgetLocale, dir: widgetDir, t } = i18n

const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null)

// Local state for public chat
const messages = ref<ChatMessage[]>([])
const loading = ref<boolean>(false)
const error = ref<string | null>(null)
const chatId = ref<string | null>(null)
const chatName = ref<string>('')
const isOpen = ref<boolean>(false)
// Keyboard focus: the panel, and the launcher focus returns to when the panel closes.
const panelRef = ref<HTMLElement | null>(null)
const fabRef = ref<{ $el: HTMLElement } | null>(null)
const panelId = uniqueId('ci-widget-panel')
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

// Disclaimer dialog state
const showDisclaimerDialog = ref<boolean>(false)
const disclaimerDialogScrolledToBottom = ref<boolean>(false)
const disclaimerDialogHasScrolled = ref<boolean>(false)
const disclaimerDialogContentRef = ref<HTMLElement | null>(null)
const disclaimerDialogVisible = computed(
  () =>
    showDisclaimerDialog.value &&
    !!initData.value?.disclaimerDialogEnabled &&
    !!initData.value?.disclaimerDialogText &&
    currentView.value === 'chat',
)

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

/** The site's ID for the signed-in visitor (userId option or setUserId()), or null. */
const currentUserId = computed(() => {
  const value = userIdOverride.value !== undefined ? userIdOverride.value : props.userId
  return typeof value === 'string' && value.trim() ? value.trim() : null
})

const USER_ID_HEADER = 'x-clearideas-public-chat-user-id'
const MAX_USER_ID_LENGTH = 256
let warnedUserId: string | null = null

/**
 * Header identifying the signed-in user (protocol README §5.5). The value is percent-encoded, since
 * header values must be ASCII; an over-long ID is not sent.
 */
function userIdHeaders(): Record<string, string> {
  const userId = currentUserId.value
  if (!userId) return {}
  if (userId.length > MAX_USER_ID_LENGTH) {
    if (warnedUserId !== userId) {
      console.warn(
        `[ClearIdeasWidget] userId is longer than ${MAX_USER_ID_LENGTH} characters and is not sent.`,
      )
      warnedUserId = userId
    }
    return {}
  }
  return { [USER_ID_HEADER]: encodeURIComponent(userId) }
}
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

// Browser storage, namespaced per server and site (utils/storage.ts). localStorage is used only
// when consent is not required or has been granted; otherwise sessionStorage.
function storageKeyFor(name: StorageKeyName): string {
  return storageKey(
    name,
    storageNamespace(apiUrl.value, props.accessKey ?? '', currentUserId.value),
  )
}

function activeStorage(): Storage | null {
  return getBrowserStorage(shouldUsePersistentStorage.value ? 'local' : 'session')
}

function readStored(name: StorageKeyName): string | null {
  const key = storageKeyFor(name)
  if (shouldUsePersistentStorage.value) {
    return readItem(getBrowserStorage('local'), key) ?? readItem(getBrowserStorage('session'), key)
  }
  return readItem(getBrowserStorage('session'), key)
}

function writeStored(name: StorageKeyName, value: string): void {
  writeItem(activeStorage(), storageKeyFor(name), value)
}

function removeStored(name: StorageKeyName): void {
  removeItem(getBrowserStorage('local'), storageKeyFor(name))
  removeItem(getBrowserStorage('session'), storageKeyFor(name))
}

function getStoredSessionId(): string | null {
  return readStored('session')
}

function storeSessionId(id: string): void {
  writeStored('session', id)
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CachedInitData {
  data: InitResponse
  timestamp: string // ISO timestamp
  consentStatus: 'granted' | 'not-required' | 'pending'
  locale: string
  sessionId?: string
}

/**
 * Server configuration is untrusted (protocol README §7.1): keep only http(s) icon and link URLs,
 * a valid color, a known theme mode and a sane bubble delay.
 */
function sanitizeInitData(data: InitResponse): InitResponse {
  const color = safeColor(data.style?.color)
  const mode = data.style?.mode
  const links = Array.isArray(data.links) ? data.links : []
  const delay = data.helloBubbleDelay
  return {
    ...data,
    style: {
      ...(color ? { color } : {}),
      ...(mode === 'light' || mode === 'dark' || mode === 'system' ? { mode } : {}),
    },
    iconUrl: safeWebUrl(data.iconUrl) ?? undefined,
    links: links
      .filter(link => link && typeof link.title === 'string' && safeWebUrl(link.url))
      .slice(0, 4)
      .map(link => ({ ...link, url: safeWebUrl(link.url)! })),
    helloBubbleDelay:
      typeof delay === 'number' && Number.isFinite(delay) && delay >= 0
        ? Math.min(delay, 600)
        : undefined,
  }
}

// Cached init data is read from either storage so a cache written before a consent change still
// counts.
function getCachedInitData(): CachedInitData | null {
  const key = storageKeyFor('initCache')
  const raw =
    readItem(getBrowserStorage('local'), key) ?? readItem(getBrowserStorage('session'), key)
  if (!raw) return null
  try {
    const cached = JSON.parse(raw) as CachedInitData
    if (!cached || typeof cached !== 'object' || !cached.data) return null
    return { ...cached, data: sanitizeInitData(cached.data) }
  } catch (err) {
    debugLog('[ClearIdeasWidget] Failed to parse cached init data:', err)
    return null
  }
}

function setCachedInitData(data: InitResponse): void {
  const cachedSessionId = sessionId.value || getStoredSessionId() || undefined
  const cached: CachedInitData = {
    data,
    timestamp: new Date().toISOString(),
    consentStatus: consentStatus.value,
    locale: widgetLocale.value,
    ...(cachedSessionId ? { sessionId: cachedSessionId } : {}),
  }
  writeStored('initCache', JSON.stringify(cached))
}

// Check if cached data is stale (>5 minutes old)
function isCachedDataStale(cached: CachedInitData): boolean {
  const cachedTime = new Date(cached.timestamp).getTime()
  return Number.isNaN(cachedTime) || Date.now() - cachedTime > CACHE_TTL_MS
}

function clearCachedInitData(): void {
  removeStored('initCache')
}

function clearStoredSessionId(): void {
  removeStored('session')
}

/** Clears the conversation, for a new language or a different signed-in user. */
function resetChatState() {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }

  stopAllAudio()
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

// Dark mode, in order of precedence: setDarkMode(), the darkMode prop, the server's theme mode
// (dark or light), the page's theme markup (class "dark"/"light", data-theme, data-bs-theme on
// <html> or <body>), then the system preference (server mode "system" or none). Page markup and the
// system preference are observed (utils/page-theme.ts), so the widget follows theme switches live;
// a darkMode function or global is read again whenever the page theme changes.
const isDarkMode = computed(() => {
  const page = currentPageTheme.value

  if (darkModeOverride.value !== undefined) return darkModeOverride.value

  if (props.darkMode !== undefined) {
    if (typeof props.darkMode === 'boolean') return props.darkMode
    if (typeof props.darkMode === 'function') return Boolean(props.darkMode())
    if (typeof props.darkMode === 'string' && typeof window !== 'undefined') {
      // Name of a global: a boolean, a function, or a Vue ref.
      const globalValue = (window as any)[props.darkMode]
      if (typeof globalValue === 'function') return Boolean(globalValue())
      if (globalValue && typeof globalValue === 'object' && 'value' in globalValue) {
        return Boolean(globalValue.value)
      }
      return Boolean(globalValue)
    }
  }

  const mode = initData.value?.style?.mode
  if (mode === 'dark') return true
  if (mode === 'light') return false
  // "system", also when the server sends no mode (the protocol default).
  if (page.marker) return page.marker === 'dark'
  return page.prefersDark
})

// Streaming state
const streamingContent = ref<string>('')
const streamingAssistantIndex = ref<number>(-1)
const abortController = ref<AbortController | null>(null)
// Configuration (/init) and session (/session) requests: a newer request aborts and supersedes the
// one in flight, and both are aborted on unmount, so a late response never overwrites newer state.
let initRequest: AbortController | null = null
let sessionRequest: AbortController | null = null
let unmounted = false

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
  (kind: VoiceErrorKind) => {
    error.value = t(VOICE_ERROR_KEYS[kind])
  },
  waveformBars,
)

// Markdown formatting is now in utils/markdown.ts

// Accent used when neither the server nor the host page sets one.
const DEFAULT_ACCENT = '#ED613F'

// Get API base URL - use prop if provided, otherwise use default from Vite env
// VITE_API_BASE_URL is replaced at build time via vite.config.ts define option
// The constant is defined by this package's build; the guard keeps the .vue source usable in other
// builds that do not define it.
const DEFAULT_API_BASE_URL =
  (typeof __VITE_API_BASE_URL__ !== 'undefined' ? __VITE_API_BASE_URL__ : '') ||
  'https://api.clearideas.com'

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
  extraHeaders: userIdHeaders,
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
  onError: (kind, detail) => {
    console.warn('[ClearIdeasWidget] Voice session error:', detail)
    error.value = t(VOICE_ERROR_KEYS[kind])
  },
})

const supportsAnyVoice = computed(() => supportsRealtimeVoice.value || supportsVoiceRecording.value)
const voiceInputActive = computed(() => realtimeVoiceActive.value || isRecording.value)
// A reply is being requested or streamed (typing indicator, busy conversation log).
const replyInProgress = computed(() => loading.value || streamingAssistantIndex.value >= 0)
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
  // A host page can set a default accent on its root element:
  //   :root { --ci-widget-accent: #2866cf }   (or the legacy --ci-widget-feature: 40, 102, 207)
  if (typeof window !== 'undefined' && document?.documentElement) {
    const rootStyle = getComputedStyle(document.documentElement)
    const accentVar = safeColor(rootStyle.getPropertyValue('--ci-widget-accent').trim())
    if (accentVar) return accentVar
    const legacy = rootStyle.getPropertyValue('--ci-widget-feature').trim()
    const legacyColor = safeColor(legacy.includes(',') ? `rgb(${legacy})` : legacy)
    if (legacyColor) return legacyColor
  }
  return DEFAULT_ACCENT
})

// Accent palette (utils/color.ts). Styles read it from CSS variables on the widget root, so every
// accent-colored element follows the site color.
const accent = computed(() => accentPalette(widgetColor.value, DEFAULT_ACCENT))
const accentStyle = computed(() => accentVariables(accent.value, isDarkMode.value))

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
      ? t('home.chatWith', { name: initData.value.chatName })
      : t('home.chatDefaultTitle'),
    description: initData.value?.chatTagline || t('home.chatDefaultDescription'),
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
  return initData.value?.chatName || chatName.value || t('chat.defaultName')
})

const widgetColorBase = computed(() => accent.value.base)
const widgetColorLight = computed(() => accent.value.soft)
const widgetColorDark = computed(() => accent.value.strong)
// Text and icons on the accent color (white or near-black, whichever contrasts more).
const headerContrastColor = computed(() => accent.value.onAccent)

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
  const removeListeners = () => {
    events.forEach(event => {
      document.removeEventListener(event, initOnce, { capture: true })
    })
    removeInteractionListeners = null
  }
  const initOnce = () => {
    initAudioContext()
    removeListeners() // only the first interaction matters
  }

  events.forEach(event => {
    document.addEventListener(event, initOnce, { capture: true })
  })
  removeInteractionListeners = removeListeners
}

// This instance's page listeners and timers, released on unmount.
let removeInteractionListeners: (() => void) | null = null
const pendingTimers = new Set<number>()

function later(callback: () => void, ms: number): number {
  const id = window.setTimeout(() => {
    pendingTimers.delete(id)
    callback()
  }, ms)
  pendingTimers.add(id)
  return id
}

// Play a pleasant notification sound using Web Audio API
async function playHelloBubbleSound() {
  try {
    // Browsers only allow audio after the visitor interacts with the page, and warn about an
    // AudioContext created earlier. The context exists once the visitor has clicked or typed.
    const ctx = audioContext
    if (!ctx) {
      debugLog('[ClearIdeasWidget] No page interaction yet; hello bubble sound skipped')
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

function hasHelloBubbleBeenShown(): boolean {
  return readStored('helloBubbleShown') === 'true'
}

function markHelloBubbleAsShown() {
  writeStored('helloBubbleShown', 'true')
}

// Show hello bubble on FAB
function showHelloBubble() {
  if (!launcherShown.value || !initData.value) {
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
    if (!launcherShown.value || !initData.value) return

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
    later(hideHelloBubble, 15000)
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
  later(() => {
    if (!isHelloBubbleVisible.value) {
      helloBubbleText.value = ''
    }
  }, 300)
}

function hasDisclaimerDialogBeenDismissed(): boolean {
  return readStored('disclaimerDismissed') === 'true'
}

function markDisclaimerDialogAsDismissed() {
  writeStored('disclaimerDismissed', 'true')
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
  // Check scroll position after dialog is rendered, and move focus into it
  nextTick(() => {
    checkDisclaimerDialogScroll()
    disclaimerDialogContentRef.value?.focus()
  })
}

// Dismiss disclaimer dialog
function dismissDisclaimerDialog() {
  showDisclaimerDialog.value = false
  markDisclaimerDialogAsDismissed()
  // Reset scroll state
  disclaimerDialogScrolledToBottom.value = false
  disclaimerDialogHasScrolled.value = false
  focusPanel() // back to the text box
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

// Load widget configuration (GET /public/chat/init), from a fresh cache when possible.
async function loadInitData() {
  if (!apiUrl.value || !props.accessKey) {
    console.warn('[ClearIdeasWidget] Cannot load init data: missing apiUrl or accessKey')
    return
  }

  initRequest?.abort()
  const request = new AbortController()
  initRequest = request
  const isCurrent = () => initRequest === request && !unmounted

  loadingInit.value = true
  try {
    const storedSessionId = getStoredSessionId()
    if (storedSessionId) sessionId.value = storedSessionId

    const cached = getCachedInitData()
    if (cached) {
      const usable =
        cached.consentStatus === consentStatus.value &&
        cached.locale === widgetLocale.value &&
        !isCachedDataStale(cached)
      if (usable) {
        debugLog('[ClearIdeasWidget] Using cached init data')
        applyInitData(cached.data)
        if (!sessionId.value && cached.sessionId) {
          sessionId.value = cached.sessionId
          storeSessionId(cached.sessionId)
        }
        return
      }
      clearCachedInitData()
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${props.accessKey}`,
      'Accept-Language': widgetLocale.value,
      ...userIdHeaders(),
      'x-clearideas-public-chat-consent-status': consentStatus.value,
    }
    if (sessionId.value) headers['x-clearideas-public-chat-session'] = sessionId.value

    const response = await fetch(`${apiUrl.value}/public/chat/init`, {
      method: 'GET',
      headers,
      credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
      cache: 'no-store',
      signal: request.signal,
    })
    if (!isCurrent()) return

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // The server refuses this widget: nothing a visitor can do, so the launcher is hidden.
        console.warn(
          `[ClearIdeasWidget] Init request failed: ${response.status} ${response.statusText}. ` +
            'The launcher is hidden. Check the access key, that chat is enabled for the site, and that this origin is allowed.',
        )
        initRejected.value = true
        clearCachedInitData()
      } else {
        console.warn(
          '[ClearIdeasWidget] Init request failed:',
          response.status,
          response.statusText,
        )
      }
      return
    }
    initRejected.value = false

    // Requires Access-Control-Expose-Headers on cross-origin servers (protocol README §3.3).
    const responseSessionId = response.headers.get('x-clearideas-public-chat-session-id')
    if (responseSessionId) {
      sessionId.value = responseSessionId
      storeSessionId(responseSessionId)
    }

    const body = (await response.json()) as InitResponse | null
    if (!isCurrent()) return
    if (!body || typeof body !== 'object') throw new Error('Invalid init response')
    const data = sanitizeInitData(body)
    applyInitData(data)
    setCachedInitData(data)
  } catch (err) {
    if (!isCurrent()) return // superseded by a newer load, or the widget was destroyed
    console.error('[ClearIdeasWidget] Failed to load init data:', err)
  } finally {
    // Only the newest load ends the loading state.
    if (initRequest === request) {
      initRequest = null
      loadingInit.value = false
    }
  }
}

function applyInitData(data: InitResponse) {
  initData.value = data
  if (data.chatName) chatName.value = data.chatName
  isNewChat.value = true
  // The bubble's own storage flag decides whether it is shown.
  nextTick(() => showHelloBubble())
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
    ...userIdHeaders(),
    'x-clearideas-public-chat-consent-status': consentStatus.value,
  }

  if (sessionId.value) {
    headers['x-clearideas-public-chat-session'] = sessionId.value
  }

  sessionRequest?.abort()
  const request = new AbortController()
  sessionRequest = request
  const isCurrent = () => sessionRequest === request && !unmounted

  let response: Response
  let data: SessionActivationResponse
  try {
    response = await fetch(`${apiUrl.value}/public/chat/session`, {
      method: 'POST',
      headers,
      credentials: shouldIncludeCredentials.value ? 'include' : 'omit',
      cache: 'no-store',
      signal: request.signal,
    })
    if (!isCurrent()) return
    if (!response.ok) throw await errorFromResponse(response)
    data = await response.json()
    if (!isCurrent()) return
  } catch (error) {
    if (!isCurrent()) return // superseded by a newer activation, or the widget was destroyed
    throw error
  } finally {
    if (sessionRequest === request) sessionRequest = null
  }

  const responseSessionId = response.headers.get('x-clearideas-public-chat-session-id')
  const effectiveSessionId = responseSessionId || currentSessionId || null
  if (responseSessionId) {
    sessionId.value = responseSessionId
    storeSessionId(responseSessionId)
  }

  activatedSessionId.value = effectiveSessionId
  applyExistingChat(data.existingChat)
}

// Send message to public chat API using streaming endpoint
/**
 * The reply being requested or streamed. `reason` says why it ended early: the visitor stopped it
 * (what arrived is kept), nothing arrived for replyTimeoutMs (reported as an error), or null when
 * the widget cancelled it (new chat, language change, destroy; partial text is dropped).
 */
interface ReplyRequest {
  controller: AbortController
  reason: 'stopped' | 'timeout' | null
  timer: number | null
}
let activeReply: ReplyRequest | null = null

const DEFAULT_REPLY_TIMEOUT_MS = 120_000

function beginReply(): ReplyRequest {
  abortController.value?.abort() // a previous request, if any, is cancelled
  const request: ReplyRequest = { controller: new AbortController(), reason: null, timer: null }
  abortController.value = request.controller
  activeReply = request
  keepReplyAlive(request)
  return request
}

/** (Re)starts the silence timer: called when the request starts and whenever data arrives. */
function keepReplyAlive(request: ReplyRequest) {
  if (request.timer !== null) clearTimeout(request.timer)
  const timeout =
    props.replyTimeoutMs && props.replyTimeoutMs > 0
      ? props.replyTimeoutMs
      : DEFAULT_REPLY_TIMEOUT_MS
  request.timer = window.setTimeout(() => {
    request.reason = 'timeout'
    request.controller.abort()
  }, timeout)
}

function endReply(request: ReplyRequest) {
  if (request.timer !== null) clearTimeout(request.timer)
  request.timer = null
  if (activeReply === request) activeReply = null
  if (abortController.value === request.controller) abortController.value = null
}

/** Stops the reply in progress at the visitor's request (the stop button). */
function stopReply() {
  if (!activeReply) return
  activeReply.reason = 'stopped'
  activeReply.controller.abort()
  stopAllAudio() // a spoken reply stops too
}

/** Reads a reply stream, restarting the silence timer on every chunk (keep-alives included). */
async function readReplyStream(
  request: ReplyRequest,
  response: Response,
  onData: (data: string) => void,
) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser(onData)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (request.controller.signal.aborted) {
        void reader.cancel().catch(() => undefined)
        throw new DOMException('Reply aborted', 'AbortError')
      }
      if (done) {
        parser.push(decoder.decode())
        parser.end() // a last event without a closing blank line still counts
        break
      }
      keepReplyAlive(request)
      parser.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }
  // Ended cleanly without a done event: keep the text received so far (protocol README §6.2).
  if (streamingAssistantIndex.value >= 0 && streamingContent.value) {
    messages.value[streamingAssistantIndex.value].content = streamingContent.value
  }
  streamingAssistantIndex.value = -1
  streamingContent.value = ''
}

/**
 * Handles a reply that was aborted. Returns true when nothing more is to be done; false for a
 * timeout, which the caller reports like a failed request.
 */
function endAbortedReply(request: ReplyRequest): boolean {
  if (request.reason === 'timeout') return false
  const index = streamingAssistantIndex.value
  if (request.reason === 'stopped') {
    // Stopped by the visitor: keep what arrived.
    if (index >= 0 && streamingContent.value) messages.value[index].content = streamingContent.value
  } else if (index >= 0) {
    // Cancelled by the widget: drop the partial reply.
    messages.value.splice(index, 1)
  }
  streamingAssistantIndex.value = -1
  streamingContent.value = ''
  return true
}

const isAbortError = (err: unknown) =>
  err !== null && typeof err === 'object' && 'name' in err && err.name === 'AbortError'

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

  const request = beginReply()

  loading.value = true
  error.value = null
  streamingContent.value = ''
  streamingAssistantIndex.value = -1

  const requestUrl = chatId.value
    ? `${apiUrl.value}/public/chat/${encodeURIComponent(chatId.value)}/stream`
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
    for (const [name, value] of Object.entries(userIdHeaders())) headers.set(name, value)

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
      signal: request.controller.signal,
    })
    keepReplyAlive(request)

    if (!response.ok) throw await errorFromResponse(response)
    if (!response.body) throw new Error('Response has no body')

    // The assistant message is created when the first content event arrives.
    await readReplyStream(request, response, data => processStreamData(data))
  } catch (err) {
    if (isAbortError(err) && endAbortedReply(request)) return

    if (request.reason === 'timeout') {
      console.warn(
        '[ClearIdeasWidget] No reply data for the reply timeout; the request was abandoned.',
      )
      error.value = t('chat.replyTimeout')
    } else {
      console.error('[ClearIdeasWidget] Request failed:', err)
      error.value = requestErrorMessage(err, 'chat.sendFailed')
    }

    const last = messages.value[messages.value.length - 1]
    if (request.reason !== 'timeout' && last?.role === 'user') {
      // Not delivered: withdraw it and give the text back so the visitor can retry. (After a
      // timeout the server may have it, so it stays.)
      messages.value.pop()
      if (!chatInputContent.value.trim()) chatInputContent.value = content
    }

    if (streamingAssistantIndex.value >= 0) {
      messages.value.splice(streamingAssistantIndex.value, 1)
      streamingAssistantIndex.value = -1
    }
    streamingContent.value = ''
  } finally {
    endReply(request)
    // A newer request may already be loading (this one was cancelled for it).
    if (!activeReply) loading.value = false
  }
}

/**
 * Handles the data of one stream event (protocol README §6). Data that is not JSON is retried line
 * by line, for servers that send consecutive `data:` lines without blank lines between events (which
 * widget 0.1.x accepted). A malformed event, or a failure while handling one, does not stop the stream.
 */
function processStreamData(data: string, voiceMode = false) {
  let events: StreamEvent[]
  try {
    events = [JSON.parse(data)]
  } catch (parseError) {
    const lines = data.split('\n').filter(line => line.trim())
    try {
      if (lines.length < 2) throw parseError
      events = lines.map(line => JSON.parse(line))
    } catch {
      console.warn('[ClearIdeasWidget] Ignored malformed stream event:', parseError)
      return
    }
  }
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    try {
      handleStreamEvent(event, voiceMode)
    } catch (handlerError) {
      console.error(
        `[ClearIdeasWidget] Failed to handle "${String(event.type)}" event:`,
        handlerError,
      )
    }
  }
}

/**
 * Message for a failed request. fetch and stream reads reject with a TypeError on network failures
 * (unreachable server, dropped connection, or a CORS rejection), whose text differs by browser.
 */
function requestErrorMessage(err: unknown, fallbackKey: string): string {
  if (err instanceof TypeError) {
    console.warn(
      '[ClearIdeasWidget] Network error. If the server is reachable, check that its CORS settings allow this origin (see docs/protocol §3.3).',
    )
    return t('chat.connectionError')
  }
  if (err instanceof ServerMessageError) return err.message
  return t(fallbackKey)
}

/**
 * The error for a failed response: the server's error body message when it has one (servers may
 * localize it, protocol README §8), otherwise a technical error that shows a generic message.
 */
async function errorFromResponse(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null)
  const message = body && typeof body === 'object' ? (body as { message?: unknown }).message : null
  if (typeof message === 'string' && message.trim()) return new ServerMessageError(message)
  return new Error(`HTTP ${response.status} ${response.statusText}`)
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

        const state = messageAudioState.value.get(messageIndex)
        if (state?.isUsingProgressivePlayback) {
          // Progressive playback is running or still opening (this event can arrive before the
          // MediaSource opens): its stream ends once every chunk is appended.
          state.completeAudioReceived = true
          endProgressiveStreamIfComplete(state)
        } else {
          // No progressive playback: play the complete audio.
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
              playMessageAudio(messageIndex, event.audio)
            } else {
              // If already playing, update stored audio for replay but don't interrupt
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

/** Moves keyboard focus into the panel: the text box in chat view, otherwise the first action. */
function focusPanel() {
  nextTick(() => {
    const panel = panelRef.value
    if (!panel) return
    const target =
      currentView.value === 'chat'
        ? panel.querySelector<HTMLElement>('textarea')
        : panel.querySelector<HTMLElement>('.ci-widget-action')
    ;(target ?? panel.querySelector<HTMLElement>('button, textarea, a[href]'))?.focus()
  })
}

/** True if keyboard focus is inside the open panel (in the shadow root or the page). */
function focusIsInPanel(): boolean {
  const panel = panelRef.value
  if (!panel) return false
  const active = (panel.getRootNode() as Document | ShadowRoot).activeElement
  return !!active && panel.contains(active)
}

async function openWidget(options: { focus?: boolean } = {}) {
  const requestToken = ++openRequestToken.value

  // Initialize audio context on first user interaction
  initAudioContext()

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
      // A refused widget has no launcher; otherwise tell the visitor (the next click retries).
      if (!initRejected.value && !unmounted) showUnavailableNotice()
      return
    }
  }

  try {
    await activateChatSession()
  } catch (activationError) {
    if (unmounted) return // widget destroyed while opening
    console.warn(
      '[ClearIdeasWidget] Session activation failed during open; continuing with new chat state',
      activationError,
    )
    applyExistingChat(undefined)
    error.value = requestErrorMessage(activationError, 'chat.unknownError')
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

  // Focus follows a visitor's action, but opening on page load does not take the page's focus.
  if (options.focus !== false) focusPanel()
}

function closeWidget() {
  const returnFocus = focusIsInPanel()
  openRequestToken.value += 1
  isOpen.value = false
  // A reply in progress continues and is there when the panel reopens.
  // Unconditional: a microphone permission prompt may still be pending (nothing active yet).
  cancelVoiceInput()
  // Stop all audio playback
  stopAllAudio()
  if (returnFocus) nextTick(() => fabRef.value?.$el?.focus())
}

/** Escape closes the panel (and returns focus to the launcher). */
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    event.stopPropagation()
    closeWidget()
  }
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
  focusPanel()
}

// FAB visibility state (defaults to prop value)
const fabVisible = ref(!props.fabHide)
// The server refused the widget (401 or 403 on init): the launcher stays hidden.
const initRejected = ref(false)
const launcherShown = computed(() => fabVisible.value && !initRejected.value)

// "Chat is unavailable" notice by the launcher, after opening failed (server unreachable or erroring).
const UNAVAILABLE_NOTICE_MS = 6000
const unavailableNoticeVisible = ref(false)
let unavailableNoticeTimer: number | null = null

function showUnavailableNotice() {
  unavailableNoticeVisible.value = true
  if (unavailableNoticeTimer !== null) clearTimeout(unavailableNoticeTimer)
  unavailableNoticeTimer = later(() => {
    unavailableNoticeVisible.value = false
    unavailableNoticeTimer = null
  }, UNAVAILABLE_NOTICE_MS)
}

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

/** Sets the signed-in user; undefined, null or '' means signed out (also over the userId option). */
function setUserId(id: string | null | undefined) {
  userIdOverride.value = typeof id === 'string' ? id : ''
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
  setMessages,
  stopReply,
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
  startPageThemeTracking()
  syncWidgetLocale()

  // Initialize audio context on any page interaction
  // This allows the hello bubble sound to work even before user clicks the widget
  initAudioContextOnInteraction()

  // Adopt values stored by widget 0.1.x under un-namespaced keys (once).
  if (apiUrl.value && props.accessKey) {
    migrateLegacyKeys(storageNamespace(apiUrl.value, props.accessKey))
  }

  const storedSessionId = getStoredSessionId()
  if (storedSessionId) sessionId.value = storedSessionId

  await loadInitData()
  hasCompletedInitialInitLoad.value = true
  if (props.openOnLoad) {
    await openWidget({ focus: false })
  }
})

watch(
  resolvedLocale,
  value => {
    i18n.setLocale(value)
  },
  { immediate: true },
)

watch(
  widgetLocale,
  async (value, previousValue) => {
    if (hasCompletedInitialInitLoad.value && previousValue && value !== previousValue) {
      clearCachedInitData()
      clearStoredSessionId()
      resetChatState()
      await reloadAfterReset()
    }
  },
  { immediate: true },
)

// A different signed-in user (or signing out) gets their own conversation: the stored session is
// per user (storageKeyFor), and the server scopes chats to the user ID.
watch(currentUserId, async (value, previousValue) => {
  if (!hasCompletedInitialInitLoad.value || value === previousValue) return
  resetChatState()
  await reloadAfterReset()
})

/** After a reset: new configuration, and, with the panel open, that user's conversation. */
async function reloadAfterReset() {
  if (!apiUrl.value || !props.accessKey) return
  await loadInitData()
  if (isOpen.value && initData.value) {
    try {
      await activateChatSession()
    } catch (activationError) {
      console.warn('[ClearIdeasWidget] Session activation failed after a reset', activationError)
    }
  }
}

function syncWidgetLocale() {
  i18n.setLocale(resolvedLocale.value)
}

// Custom strings (the messages option and setMessages()).
const messagesOverride = ref<WidgetMessagesOption | undefined>(undefined)
watch(
  () => messagesOverride.value ?? props.messages,
  value => i18n.setMessages(value),
  { immediate: true },
)

function setMessages(messages: WidgetMessagesOption | undefined) {
  messagesOverride.value = messages ?? undefined
}

onUnmounted(() => {
  unmounted = true
  initRequest?.abort()
  sessionRequest?.abort()
  removeInteractionListeners?.()
  pendingTimers.forEach(id => clearTimeout(id))
  pendingTimers.clear()
  void audioContext?.close().catch(() => undefined)
  audioContext = null
  stopWidgetLocaleTracking()
  stopPageThemeTracking()
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
  cancelRecording() // also when a microphone permission prompt is still pending
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
  // The bubble background is a gradient from the accent (top) to its strong shade (bottom); the
  // arrow takes the color of the edge it sits on.
  const baseColor = 'var(--ci-widget-accent)'
  const darkerColor = 'var(--ci-widget-accent-strong)'
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
  const isFabSurfaceVisible = launcherShown.value || unavailableNoticeVisible.value
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
  // Empty when the visitor is anonymous (the header then greets without a name).
  return name ? (String(name).trim().split(/\s+/)[0] ?? '') : ''
})

function handleAction(action: WidgetAction) {
  if (action.type === 'chat') {
    startChat()
  } else if (action.type === 'link') {
    // Only http(s) URLs are opened, in a new tab without access to this page.
    if (!openExternal(action.url)) {
      console.warn('[ClearIdeasWidget] Ignored link with an unsupported URL')
    }
  }
}

async function startChat() {
  // Ensure init data is loaded before switching to chat
  if (!initData.value) {
    await loadInitData()
  }
  currentView.value = 'chat'
  focusPanel()
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
  cancelVoiceInput() // also cancels a pending microphone permission prompt
  currentView.value = 'home'
}

// Voice recording wrapper to check voiceEnabled before starting
// The last realtime failure was the microphone (denied or missing): recorded voice would fail too.
const microphoneProblem = ref(false)

async function startRecording() {
  if (!voiceEnabled.value) {
    error.value = t('chat.voiceDisabled')
    return
  }

  error.value = null
  microphoneProblem.value = false
  if (supportsRealtimeVoice.value) {
    realtimeTranscriptMessages.clear()
    realtimeUserHasSpoken.value = false
    realtimeVoiceModeOpen.value = true
    try {
      await connectRealtimeVoice()
      return
    } catch (realtimeError) {
      // 403: this site has no realtime voice (protocol README §2), so record instead of failing.
      if (errorStatus(realtimeError) === 403 && supportsVoiceRecording.value) {
        debugLog('[ClearIdeasWidget] Realtime voice not enabled; using recorded voice')
        realtimeVoiceModeOpen.value = false
        disconnectRealtimeVoice()
        await startVoiceRecording()
        return
      }
      // Keep the live-call failure visible. The user can explicitly choose the
      // legacy recorded flow from the dedicated voice screen.
      debugWarn('[ClearIdeasWidget] Realtime voice unavailable', {
        error: realtimeError instanceof Error ? realtimeError.message : String(realtimeError),
      })
      const kind = microphoneErrorKind(realtimeError, 'unavailable')
      microphoneProblem.value = kind === 'microphone-denied' || kind === 'microphone-missing'
      error.value =
        realtimeError instanceof ServerMessageError
          ? realtimeError.message
          : t(VOICE_ERROR_KEYS[kind])
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

  const request = beginReply()

  loading.value = true
  error.value = null
  streamingContent.value = ''
  streamingAssistantIndex.value = -1

  // Use chatId if available to continue conversation
  const requestUrl = chatId.value
    ? `${apiUrl.value}/public/chat/voice/${encodeURIComponent(chatId.value)}/stream`
    : `${apiUrl.value}/public/chat/voice/stream`

  try {
    const headers = new Headers()
    headers.set('Authorization', `Bearer ${props.accessKey}`)
    headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'text/event-stream')
    headers.set('Accept-Language', widgetLocale.value)
    for (const [name, value] of Object.entries(userIdHeaders())) headers.set(name, value)

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
      signal: request.controller.signal,
    })
    keepReplyAlive(request)

    if (!response.ok) throw await errorFromResponse(response)
    if (!response.body) throw new Error('Response has no body')

    // The assistant message is created when the transcript and content arrive.
    await readReplyStream(request, response, data => processStreamData(data, true))

    // Switch to chat view if not already there
    if (currentView.value !== 'chat') {
      currentView.value = 'chat'
    }
  } catch (err) {
    if (isAbortError(err) && endAbortedReply(request)) return

    if (request.reason === 'timeout') {
      console.warn('[ClearIdeasWidget] No voice reply data for the reply timeout.')
      error.value = t('chat.replyTimeout')
    } else {
      console.error('[ClearIdeasWidget] Voice message failed:', err)
      error.value = requestErrorMessage(err, 'chat.sendVoiceFailed')
    }

    if (streamingAssistantIndex.value >= 0) {
      messages.value.splice(streamingAssistantIndex.value, 1)
      streamingAssistantIndex.value = -1
    }
    streamingContent.value = ''
  } finally {
    endReply(request)
    if (!activeReply) loading.value = false
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

  // Start MediaSource when we receive the initialization segment (chunk 0 with isInitSegment flag)
  // Only start if MediaSource is not already initialized
  let shouldStart = false
  if (isInitSegment || (isChunk0 && state.initSegmentReceived)) {
    // We have the initialization segment, start MediaSource
    shouldStart = !state.mediaSource && !state.isUsingProgressivePlayback
  }

  if (shouldStart) {
    // Start MediaSource-based progressive playback
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
    try {
      // Create source buffer for WebM/Opus
      const sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs="opus"')
      state.sourceBuffer = sourceBuffer

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
            .then(() => {})
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

        endProgressiveStreamIfComplete(state)
      })

      // Start by appending the first available chunk (chunk 0)
      if (chunks.length > 0) {
        appendNextAvailableChunk()
      } else {
        console.warn('[ClearIdeasWidget] No chunks available to append', {
          messageIndex,
        })
      }
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
  mediaSource.addEventListener('sourceended', () => {})

  mediaSource.addEventListener('sourceclose', () => {})
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
        } catch (e) {
          console.error('[ClearIdeasWidget] Error appending chunk:', e)
        }
      }
    }
  }
  // If sourceBuffer is updating, the updateend listener will handle it automatically
}

/**
 * Ends a progressive (MediaSource) stream once the complete audio has arrived and every chunk is
 * appended. Without endOfStream() the element waits for more data and never fires `ended`.
 */
function endProgressiveStreamIfComplete(state: MessageAudioState) {
  const { mediaSource, sourceBuffer, audioChunks } = state
  if (!state.completeAudioReceived || !mediaSource || !sourceBuffer || !audioChunks) return
  const chunkCount = audioChunks.filter(Boolean).length
  if (
    (state.appendedChunksCount ?? 0) >= chunkCount &&
    !sourceBuffer.updating &&
    mediaSource.readyState === 'open'
  ) {
    try {
      mediaSource.endOfStream()
    } catch (e) {
      console.warn('[ClearIdeasWidget] Error ending MediaSource stream:', e)
    }
  }
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

// Move the session ID between sessionStorage and localStorage when consent changes.
watch(resolvedConsentGranted, async (granted, wasGranted) => {
  if (!resolvedConsentRequired.value || granted === wasGranted) return
  clearCachedInitData()
  const key = storageKeyFor('session')
  const local = getBrowserStorage('local')
  const session = getBrowserStorage('session')

  if (granted) {
    const stored = readItem(session, key)
    if (stored && stored === sessionId.value) {
      writeItem(local, key, stored)
      removeItem(session, key)
      // Re-initialize so the server can set its cookie for this session.
      await loadInitData()
    }
  } else {
    // Consent revoked: nothing may remain in persistent storage.
    const stored = readItem(local, key)
    if (stored && stored === sessionId.value) writeItem(session, key, stored)
    removeItem(local, key)
  }
})

// Auto-scroll to bottom when messages update
const messagesContainer = ref<HTMLElement | null>(null)
watch(
  () => [messages.value.length, streamingContent.value],
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  },
)

// Show or hide the disclaimer dialog when the view changes
watch(currentView, newView => {
  nextTick(() => {
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
    :lang="widgetLocale"
    :dir="widgetDir"
    :class="[positionClass, { 'ci-widget-dark': isDarkMode }]"
    :style="{ ...accentStyle, ...absoluteStyle, ...widgetContainerStyle }"
    @keydown="handleKeydown"
  >
    <!-- lang and dir above make screen readers, fonts and layout follow the widget language. -->
    <Transition name="ci-widget-scale-fade">
      <!-- A non-modal dialog: the page stays usable while the chat is open. -->
      <div
        v-if="isOpen"
        :id="panelId"
        ref="panelRef"
        class="ci-widget-panel ci-widget-card"
        role="dialog"
        :aria-label="widgetChatName"
        :style="panelStyle"
      >
        <!-- Disclaimer Dialog Overlay -->
        <Transition name="ci-widget-fade">
          <div
            v-if="disclaimerDialogVisible"
            class="ci-widget-disclaimer-dialog-overlay"
            @click.self="dismissDisclaimerDialog"
          >
            <div
              class="ci-widget-disclaimer-dialog"
              role="dialog"
              aria-modal="true"
              :aria-label="t('disclaimerDialog.label')"
            >
              <!-- Focusable so keyboard users can scroll it (the button needs a full read). -->
              <div
                ref="disclaimerDialogContentRef"
                class="ci-widget-disclaimer-dialog__content"
                tabindex="0"
                @scroll="checkDisclaimerDialogScroll"
              >
                <div class="ci-widget-disclaimer-dialog__text" dir="auto">
                  {{ initData?.disclaimerDialogText }}
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
          :inert="disclaimerDialogVisible || undefined"
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
        />
        <div
          ref="messagesContainer"
          class="ci-widget-panel__body"
          :inert="disclaimerDialogVisible || undefined"
        >
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
              :error="error"
              :can-use-recorded="supportsVoiceRecording && !microphoneProblem"
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
              <div class="ci-widget-messages">
                <!--
                  The conversation is a polite live region: screen readers announce new messages.
                  It is busy while a reply streams, so the finished reply is announced once.
                -->
                <div
                  class="ci-widget-log"
                  role="log"
                  aria-live="polite"
                  :aria-label="t('chat.conversation')"
                  :aria-busy="replyInProgress ? 'true' : 'false'"
                >
                  <!-- AI Disclaimer -->
                  <div class="ci-widget-disclaimer">
                    <span
                      class="ci-widget-icon"
                      v-html="getIconSVG('triangleExclamation', 14)"
                    ></span>
                    <span dir="auto">
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
                  />
                  <!-- Show generating indicator throughout entire stream -->
                  <div
                    v-if="replyInProgress"
                    class="ci-widget-message ci-widget-message--assistant"
                    aria-hidden="true"
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
                </div>
                <div v-if="error" class="ci-widget-message ci-widget-message--error" role="alert">
                  <div class="ci-widget-message__content">
                    <span
                      class="ci-widget-icon"
                      v-html="getIconSVG('triangleExclamation', 16)"
                    ></span>
                    <span dir="auto">{{ error }}</span>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
          <!-- Announces that a reply is on its way (the animated dots are hidden from screen readers). -->
          <div class="ci-sr-only" role="status">
            {{ replyInProgress ? t('chat.typing') : '' }}
          </div>
        </div>
        <div
          v-if="!realtimeVoiceModeOpen"
          class="ci-widget-panel__footer"
          :inert="disclaimerDialogVisible || undefined"
        >
          <template v-if="currentView === 'chat'">
            <ChatInput
              ref="chatInputRef"
              v-model="chatInputContent"
              :loading="loading"
              :is-recording="voiceInputActive"
              :recording-duration="voiceInputDuration"
              :waveform-data="voiceInputWaveform"
              :voice-enabled="voiceEnabled"
              :supports-voice-recording="supportsAnyVoice"
              :expanded="chatInputExpanded"
              @send="trySendChatInput"
              @stop="stopReply"
              @start-recording="startRecording"
              @stop-recording="completeVoiceInput"
              @cancel-recording="cancelVoiceInput"
              @focus="chatInputFocused = true"
              @blur="chatInputFocused = false"
            />
            <div v-if="chatId && messages.length > 0" class="ci-widget-new-chat-wrapper">
              <button
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
      v-if="launcherShown"
      ref="fabRef"
      :expanded="isOpen"
      :controls="panelId"
      :is-open="isOpen"
      :widget-color="widgetColor"
      :fab-size="props.fabSize"
      @toggle="toggleWidget"
      :tooltip-placement="currentWidgetPosition.endsWith('left') ? 'right' : 'left'"
    />

    <!-- Shown after opening failed; announced to screen readers. -->
    <Transition name="hello-bubble">
      <div
        v-if="unavailableNoticeVisible"
        class="ci-widget-notice"
        :style="{ ...helloBubbleStyle, width: 'max-content', maxWidth: '280px' }"
        role="alert"
        dir="auto"
      >
        {{ t('chat.unavailable') }}
      </div>
    </Transition>

    <!-- Hello Bubble -->
    <Transition name="hello-bubble">
      <div
        v-if="isHelloBubbleVisible && helloBubbleText"
        class="ci-widget-hello-bubble"
        :style="helloBubbleStyle"
        @click="hideHelloBubble"
      >
        <div class="ci-widget-hello-bubble__content">
          <div v-if="initData?.iconUrl" class="ci-widget-hello-bubble__icon">
            <img
              :src="initData.iconUrl"
              alt=""
              width="24"
              height="24"
              style="object-fit: contain"
            />
          </div>
          <div v-else class="ci-widget-hello-bubble__icon" v-html="getIconSVG('ciIcon', 24)"></div>
          <div class="ci-widget-hello-bubble__text" dir="auto">{{ helloBubbleText }}</div>
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
  /* Not set by the base variables above: error and secondary tones. */
  --ci-widget-error: 229, 57, 53;
  /* Error text: darker than the error tone so it meets 4.5:1 on its tinted background. */
  --ci-widget-error-text: 183, 28, 28;
  --ci-widget-secondary: 163, 177, 198;
  /*
   * Own typography instead of inheriting the page's (in Shadow DOM the page's inherited styles stop
   * at the host). Pages can set --ci-widget-font-family to match their font.
   */
  font-family: var(
    --ci-widget-font-family,
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif
  );
  font-size: 16px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: normal;
  text-align: start;
  text-transform: none;
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
/* "Chat is unavailable" notice, placed like the hello bubble. */
.ci-widget-notice {
  position: absolute;
  z-index: 2200;
  box-sizing: border-box;
  padding: 10px 14px;
  border: 1px solid rgba(var(--ci-widget-on-surface), 0.12);
  border-radius: 12px;
  background: rgb(var(--ci-widget-surface));
  color: rgb(var(--ci-widget-on-surface));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  line-height: 1.4;
}

.ci-widget-hello-bubble {
  position: absolute;
  /* Positioning is set dynamically via inline styles based on widget position */
  z-index: 2200;
  pointer-events: auto;
  animation: helloBubblePulse 2s ease-in-out infinite;
}

.ci-widget-hello-bubble__content {
  background: linear-gradient(
    135deg,
    var(--ci-widget-accent) 0%,
    var(--ci-widget-accent-strong) 100%
  );
  box-shadow:
    0 8px 24px rgba(var(--ci-widget-accent-rgb), 0.4),
    0 4px 12px rgba(0, 0, 0, 0.15);
  color: var(--ci-widget-on-accent);
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
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 500;
  color: inherit;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.ci-widget-hello-bubble__close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: inherit;
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
  --ci-widget-error: 211, 47, 47;
  --ci-widget-error-text: 255, 138, 128;
  --ci-widget-secondary: 107, 124, 145;
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
  background: var(--ci-widget-accent) !important;
  background-color: var(--ci-widget-accent) !important;
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
  border-inline-start: 1px solid rgba(234, 234, 234, 0.12) !important;
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

/* Views slide the other way in right-to-left languages. */
.ci-widget[dir='rtl'] .ci-widget-view-fade-enter-from {
  transform: translateX(-10px);
}

.ci-widget[dir='rtl'] .ci-widget-view-fade-leave-to {
  transform: translateX(10px);
}

/* Home view and action styles moved to WidgetHeader.vue and WidgetHomeView.vue components */

/* Messages container styling */
.ci-widget-log {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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
  color: rgba(var(--ci-widget-on-surface), 0.7);
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

/* Dark mode disclaimer (on-surface is light in dark mode) */
.ci-widget.ci-widget-dark .ci-widget-disclaimer,
.ci-widget.ci-widget-dark .ci-widget-disclaimer .ci-widget-icon {
  color: rgba(var(--ci-widget-on-surface), 0.7) !important;
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
  color: var(--ci-widget-on-accent);
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
  background: rgba(var(--ci-widget-accent-rgb), 0.8);
  animation: dotWave 1.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  box-shadow: 0 0 0 rgba(var(--ci-widget-accent-rgb), 0);
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
    box-shadow: 0 0 0 rgba(var(--ci-widget-accent-rgb), 0);
    opacity: 0.6;
  }
  25% {
    transform: translateY(-6px) scale(1);
    box-shadow: 0 0 3px rgba(var(--ci-widget-accent-rgb), 0.6);
    opacity: 1;
  }
  50% {
    transform: translateY(0) scale(0.9);
    box-shadow: 0 0 0 rgba(var(--ci-widget-accent-rgb), 0);
    opacity: 0.6;
  }
  75% {
    transform: translateY(3px) scale(0.85);
    box-shadow: 0 0 3px rgba(var(--ci-widget-accent-rgb), 0.3);
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
/* Arrows point the other way in right-to-left languages (icons are v-html, so unscoped). */
.ci-widget[dir='rtl'] .ci-widget-icon--mirror svg {
  transform: scaleX(-1);
}

/* Visually hidden, but read by screen readers. */
.ci-widget .ci-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Visible keyboard focus on every control. */
.ci-widget :is(button, a, [tabindex]):focus-visible {
  outline: 2px solid var(--ci-widget-accent-text, #2866cf);
  outline-offset: 2px;
}

/* Respect the system "reduce motion" setting. */
@media (prefers-reduced-motion: reduce) {
  .ci-widget *,
  .ci-widget *::before,
  .ci-widget *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/*
 * Tooltips: CSS only. Elements opt in with data-tooltip="text" and optionally
 * data-tooltip-placement="top|bottom|left|right" and data-tooltip-align="start|end"
 * (keeps tooltips on edge buttons inside the panel). The text is an attribute value rendered with
 * attr(), so it is never interpreted as markup.
 */
.ci-widget [data-tooltip] {
  position: relative;
}

.ci-widget .ci-widget-fab[data-tooltip] {
  position: absolute;
}

.ci-widget [data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  z-index: 10;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(33, 33, 33, 0.92);
  color: #fff;
  font:
    500 12px/1.3 system-ui,
    -apple-system,
    sans-serif;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.15s ease,
    visibility 0.15s;
}

.ci-widget [data-tooltip]:hover::after,
.ci-widget [data-tooltip]:focus-visible::after {
  opacity: 1;
  visibility: visible;
  transition-delay: 0.3s;
}

.ci-widget [data-tooltip-placement='bottom']::after {
  bottom: auto;
  top: calc(100% + 6px);
}

.ci-widget [data-tooltip-placement='left']::after,
.ci-widget [data-tooltip-placement='right']::after {
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
}

.ci-widget [data-tooltip-placement='left']::after {
  left: auto;
  right: calc(100% + 8px);
}

.ci-widget [data-tooltip-placement='right']::after {
  left: calc(100% + 8px);
}

/* Start and end follow the text direction, so edge tooltips stay inside the panel in RTL too. */
.ci-widget [data-tooltip-align='start']::after {
  left: auto;
  inset-inline-start: 0;
  transform: none;
}

.ci-widget [data-tooltip-align='end']::after {
  left: auto;
  inset-inline-end: 0;
  transform: none;
}

.ci-widget [data-tooltip]:not(:hover):not(:focus-visible)::after {
  transition-delay: 0s;
}
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
  color: rgb(var(--ci-widget-error-text));
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
