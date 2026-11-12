import { ref } from 'vue'

// Per-message audio playback state type
export type MessageAudioState = {
  audio: HTMLAudioElement | null
  isPlaying: boolean
  currentTime: number
  duration: number
  audioChunks?: (string | undefined)[] // Accumulated audio chunks for progressive playback
  audioChunkBlob?: Blob // Current blob from accumulated chunks
  mediaSource?: MediaSource // MediaSource for progressive playback
  sourceBuffer?: SourceBuffer // SourceBuffer for appending chunks
  isUsingProgressivePlayback?: boolean // Flag to track if using progressive playback
  appendedChunksCount?: number // Track how many chunks have been appended to MediaSource
  completeAudioReceived?: boolean // Flag to indicate complete audio event was received
  initSegmentReceived?: boolean // Flag to track if initialization segment has been appended
}

/** Decodes base64 audio from the server. Returns null for invalid data instead of throwing. */
export function decodeBase64Audio(base64Audio: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))
  } catch {
    return null
  }
}

export function useAudioPlayback() {
  // Per-message audio playback state
  const messageAudioState = ref<Map<number, MessageAudioState>>(new Map())

  // Get or create the audio element for a message. Null when the audio data is invalid.
  function getMessageAudio(messageIndex: number, base64Audio: string): HTMLAudioElement | null {
    const state = messageAudioState.value.get(messageIndex)
    if (state?.audio) {
      return state.audio
    }

    const bytes = decodeBase64Audio(base64Audio)
    if (!bytes) {
      console.warn('[ClearIdeasWidget] Ignored invalid audio data from the server')
      return null
    }

    // Create new audio element (WebM/Opus format)
    const audioBlob = new Blob([bytes], {
      type: 'audio/webm; codecs="opus"',
    })
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)

    // Initialize state
    const initialState: MessageAudioState = {
      audio,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    }
    messageAudioState.value.set(messageIndex, initialState)

    // Update duration when metadata loads
    audio.onloadedmetadata = () => {
      const currentState = messageAudioState.value.get(messageIndex)
      if (currentState) {
        currentState.duration = audio.duration
      }
    }

    // Update currentTime as audio plays
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

    audio.onerror = () => {
      const currentState = messageAudioState.value.get(messageIndex)
      if (currentState) {
        currentState.isPlaying = false
      }
    }

    return audio
  }

  function playMessageAudio(messageIndex: number, base64Audio: string) {
    // Stop any currently playing audio
    stopAllAudio()

    const audio = getMessageAudio(messageIndex, base64Audio)
    if (!audio) return
    const state = messageAudioState.value.get(messageIndex)
    if (state) {
      state.isPlaying = true
      // Browsers may refuse playback without a user gesture (autoplay policy).
      void audio.play()?.catch(() => {
        state.isPlaying = false
      })
    }
  }

  function pauseMessageAudio(messageIndex: number) {
    const state = messageAudioState.value.get(messageIndex)
    if (state?.audio && !state.audio.paused) {
      state.audio.pause()
      state.isPlaying = false
    }
  }

  function toggleMessageAudio(messageIndex: number, base64Audio: string) {
    const state = messageAudioState.value.get(messageIndex)
    if (state?.isPlaying) {
      pauseMessageAudio(messageIndex)
    } else {
      playMessageAudio(messageIndex, base64Audio)
    }
  }

  function setMessageAudioTime(messageIndex: number, time: number) {
    const state = messageAudioState.value.get(messageIndex)
    if (state?.audio) {
      state.audio.currentTime = time
      state.currentTime = time
    }
  }

  function getMessageAudioProgress(messageIndex: number): number {
    const state = messageAudioState.value.get(messageIndex)
    if (!state || state.duration === 0) return 0
    return (state.currentTime / state.duration) * 100
  }

  function stopAllAudio() {
    messageAudioState.value.forEach((state: MessageAudioState) => {
      if (state.audio) {
        state.audio.pause()
        state.audio.currentTime = 0
        state.isPlaying = false
      }
    })
  }

  function isMessageAudioPlaying(messageIndex: number): boolean {
    const state = messageAudioState.value.get(messageIndex)
    return state?.isPlaying || false
  }

  return {
    messageAudioState,
    playMessageAudio,
    pauseMessageAudio,
    toggleMessageAudio,
    setMessageAudioTime,
    getMessageAudioProgress,
    stopAllAudio,
    isMessageAudioPlaying,
    getMessageAudio,
  }
}
