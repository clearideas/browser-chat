import { beforeAll, vi } from 'vitest'

function createStorageMock() {
  return {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  }
}

const localStorageMock = createStorageMock()
const sessionStorageMock = createStorageMock()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
})

// Initialize MSW server after storage globals exist
await import('./helpers/server')

// Mock global APIs before tests run
beforeAll(() => {
  global.ResizeObserver = class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  } as any
  // Mock MediaRecorder
  global.MediaRecorder = vi.fn().mockImplementation(function () {
    return {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      state: 'inactive',
      ondataavailable: null,
      onstop: null,
      onerror: null,
      mimeType: 'audio/webm',
    }
  }) as any

  // Mock MediaRecorder.isTypeSupported
  ;(MediaRecorder as any).isTypeSupported = vi.fn(() => true)

  // Mock AudioContext
  global.AudioContext = vi.fn().mockImplementation(function () {
    return {
      createAnalyser: vi.fn(() => ({
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        frequencyBinCount: 2048,
        getByteTimeDomainData: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
      })),
      close: vi.fn(() => Promise.resolve()),
    }
  }) as any

  // Mock webkitAudioContext
  ;(global as any).webkitAudioContext = global.AudioContext

  // Mock MediaSource
  global.MediaSource = vi.fn().mockImplementation(function () {
    return {
      addSourceBuffer: vi.fn(() => ({
        appendBuffer: vi.fn(),
        updating: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
      readyState: 'closed',
      sourceBuffers: [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      endOfStream: vi.fn(),
    }
  }) as any
  ;(MediaSource as any).isTypeSupported = vi.fn(() => true)

  // Mock URL.createObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = vi.fn()

  // Mock Audio
  global.Audio = vi.fn().mockImplementation(function () {
    return {
      play: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
      load: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      paused: true,
      currentTime: 0,
      duration: 0,
      onloadedmetadata: null,
      ontimeupdate: null,
      onended: null,
      onerror: null,
    }
  }) as any

  // Mock navigator.mediaDevices
  ;(global.navigator as any).mediaDevices = {
    getUserMedia: vi.fn(() =>
      Promise.resolve({
        getTracks: vi.fn(() => [
          {
            stop: vi.fn(),
          },
        ]),
      }),
    ),
  }

  // Mock requestAnimationFrame
  global.requestAnimationFrame = vi.fn(cb => {
    setTimeout(cb, 16)
    return 1
  })
  global.cancelAnimationFrame = vi.fn()

  localStorageMock.getItem.mockReset()
  localStorageMock.setItem.mockReset()
  localStorageMock.removeItem.mockReset()
  localStorageMock.clear.mockReset()
  localStorageMock.key.mockReset()
  localStorageMock.length = 0

  sessionStorageMock.getItem.mockReset()
  sessionStorageMock.setItem.mockReset()
  sessionStorageMock.removeItem.mockReset()
  sessionStorageMock.clear.mockReset()
  sessionStorageMock.key.mockReset()
  sessionStorageMock.length = 0

  // Mock matchMedia for dark mode detection
  global.matchMedia = vi.fn(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as any
})
