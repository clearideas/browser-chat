import { vi } from 'vitest'

/**
 * Mock MediaRecorder with controllable behavior
 */
export function createMockMediaRecorder(
  options: {
    onDataAvailable?: (event: { data: Blob }) => void
    onStop?: () => void
    state?: 'inactive' | 'recording' | 'paused'
  } = {},
): any {
  const chunks: Blob[] = []
  let state: 'inactive' | 'recording' | 'paused' = options.state || 'inactive'

  return {
    start: vi.fn(() => {
      state = 'recording'
    }),
    stop: vi.fn(() => {
      state = 'inactive'
      if (options.onStop) {
        options.onStop()
      }
    }),
    pause: vi.fn(() => {
      state = 'paused'
    }),
    resume: vi.fn(() => {
      state = 'recording'
    }),
    state,
    mimeType: 'audio/webm',
    ondataavailable: null,
    onstop: null,
    onerror: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    _chunks: chunks,
  }
}

/**
 * Mock AudioContext with controllable behavior
 */
export function createMockAudioContext(): any {
  const analyser = {
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    frequencyBinCount: 2048,
    getByteTimeDomainData: vi.fn((array: Uint8Array) => {
      // Fill with mock waveform data
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 128) + 128
      }
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }

  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  }

  return {
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => source),
    close: vi.fn(() => Promise.resolve()),
    _analyser: analyser,
    _source: source,
  }
}

/**
 * Mock Audio element with controllable behavior
 */
export function createMockAudio(): any {
  let paused = true
  let currentTime = 0
  let duration = 0
  const listeners: Record<string, Function[]> = {}

  return {
    play: vi.fn(() => {
      paused = false
      return Promise.resolve()
    }),
    pause: vi.fn(() => {
      paused = true
    }),
    load: vi.fn(),
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) {
        listeners[event] = []
      }
      listeners[event].push(handler)
    }),
    removeEventListener: vi.fn((event: string, handler: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler)
      }
    }),
    dispatchEvent: vi.fn((event: string) => {
      if (listeners[event]) {
        listeners[event].forEach(handler => handler())
      }
    }),
    get paused() {
      return paused
    },
    set paused(value: boolean) {
      paused = value
    },
    get currentTime() {
      return currentTime
    },
    set currentTime(value: number) {
      currentTime = value
    },
    get duration() {
      return duration
    },
    set duration(value: number) {
      duration = value
    },
    onloadedmetadata: null,
    ontimeupdate: null,
    onended: null,
    onerror: null,
    _listeners: listeners,
  }
}

/**
 * Mock MediaSource with controllable behavior
 */
export function createMockMediaSource(): any {
  const sourceBuffers: any[] = []
  let readyState: 'closed' | 'open' | 'ended' = 'closed'
  const listeners: Record<string, Function[]> = {}

  const sourceBuffer = {
    appendBuffer: vi.fn(),
    updating: false,
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!listeners[`sb_${event}`]) {
        listeners[`sb_${event}`] = []
      }
      listeners[`sb_${event}`].push(handler)
    }),
    removeEventListener: vi.fn(),
  }

  return {
    addSourceBuffer: vi.fn((_mimeType: string) => {
      sourceBuffers.push(sourceBuffer)
      readyState = 'open'
      return sourceBuffer
    }),
    get readyState() {
      return readyState
    },
    set readyState(value: 'closed' | 'open' | 'ended') {
      readyState = value
    },
    get sourceBuffers() {
      return sourceBuffers
    },
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) {
        listeners[event] = []
      }
      listeners[event].push(handler)
    }),
    removeEventListener: vi.fn(),
    endOfStream: vi.fn(() => {
      readyState = 'ended'
    }),
    _sourceBuffer: sourceBuffer,
    _listeners: listeners,
  }
}
