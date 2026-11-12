import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useVoiceRecording } from '@/composables/useVoiceRecording'

import { expectConsole } from '../../helpers/console-guard'
import { createMockAudioContext, createMockMediaRecorder } from '../../helpers/mocks'

describe('useVoiceRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.navigator.mediaDevices as any).getUserMedia.mockClear()
  })

  it('detects voice recording support', () => {
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const { supportsVoiceRecording } = useVoiceRecording(maxDuration, onRecorded, onError)

    expect(supportsVoiceRecording.value).toBe(true)
  })

  it('starts recording successfully', async () => {
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const mockStream = {
      getTracks: vi.fn(() => [
        {
          stop: vi.fn(),
        },
      ]),
    }

    ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce(mockStream)

    const { startRecording, isRecording, recordingDuration } = useVoiceRecording(
      maxDuration,
      onRecorded,
      onError,
    )

    await startRecording()

    expect(isRecording.value).toBe(true)
    expect(recordingDuration.value).toBe(0)
    expect(global.navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('handles microphone permission denied', async () => {
    expectConsole('error', /Failed to start recording: .*NotAllowedError/)
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const error = new Error('Permission denied')
    ;(error as any).name = 'NotAllowedError'
    ;(global.navigator.mediaDevices as any).getUserMedia.mockRejectedValueOnce(error)

    const { startRecording, isRecording } = useVoiceRecording(maxDuration, onRecorded, onError)

    await startRecording()

    expect(isRecording.value).toBe(false)
    expect(onError).toHaveBeenCalledWith('microphone-denied')
  })

  it('handles no microphone found', async () => {
    expectConsole('error', /Failed to start recording: .*NotFoundError/)
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const error = new Error('No microphone')
    ;(error as any).name = 'NotFoundError'
    ;(global.navigator.mediaDevices as any).getUserMedia.mockRejectedValueOnce(error)

    const { startRecording, isRecording } = useVoiceRecording(maxDuration, onRecorded, onError)

    await startRecording()

    expect(isRecording.value).toBe(false)
    expect(onError).toHaveBeenCalledWith('microphone-missing')
  })

  it('tracks recording duration', async () => {
    vi.useFakeTimers()
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const mockStream = {
      getTracks: vi.fn(() => [
        {
          stop: vi.fn(),
        },
      ]),
    }

    ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce(mockStream)

    const { startRecording, recordingDuration, stopRecordingAndSend } = useVoiceRecording(
      maxDuration,
      onRecorded,
      onError,
    )

    await startRecording()

    vi.advanceTimersByTime(5000) // 5 seconds
    expect(recordingDuration.value).toBe(5)

    vi.advanceTimersByTime(3000) // 3 more seconds
    expect(recordingDuration.value).toBe(8)

    stopRecordingAndSend()
    vi.useRealTimers()
  })

  it('stops recording and sends audio', async () => {
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const mockStream = {
      getTracks: vi.fn(() => [
        {
          stop: vi.fn(),
        },
      ]),
    }

    const mockBlob = new Blob(['audio data'], { type: 'audio/webm' })
    const mockFileReader = {
      readAsDataURL: vi.fn(function (this: any) {
        setTimeout(() => {
          this.result = 'data:audio/webm;base64,dGVzdA=='
          if (this.onloadend) {
            this.onloadend()
          }
        }, 0)
      }),
      result: '',
      onloadend: null as any,
    }

    global.FileReader = vi.fn(function () {
      return mockFileReader
    }) as any
    ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce(mockStream)

    // Mock MediaRecorder to capture chunks
    const mockRecorder = createMockMediaRecorder({
      onStop: () => {
        // Simulate data available
        if (mockRecorder.ondataavailable) {
          mockRecorder.ondataavailable({ data: mockBlob })
        }
      },
    })

    ;(global.MediaRecorder as any).mockImplementation(function () {
      return mockRecorder
    })

    const { startRecording, stopRecordingAndSend, isRecording } = useVoiceRecording(
      maxDuration,
      onRecorded,
      onError,
    )

    await startRecording()
    expect(isRecording.value).toBe(true)

    stopRecordingAndSend()

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(isRecording.value).toBe(false)
    expect(onRecorded).toHaveBeenCalled()
  })

  it('cancels recording', async () => {
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const mockStream = {
      getTracks: vi.fn(() => [
        {
          stop: vi.fn(),
        },
      ]),
    }

    ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce(mockStream)

    const { startRecording, cancelRecording, isRecording, recordingDuration } = useVoiceRecording(
      maxDuration,
      onRecorded,
      onError,
    )

    await startRecording()
    expect(isRecording.value).toBe(true)

    cancelRecording()

    expect(isRecording.value).toBe(false)
    expect(recordingDuration.value).toBe(0)
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('enforces max duration', async () => {
    vi.useFakeTimers()
    const maxDuration = ref(5) // 5 seconds max
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const mockStream = {
      getTracks: vi.fn(() => [
        {
          stop: vi.fn(),
        },
      ]),
    }

    const mockBlob = new Blob(['audio data'], { type: 'audio/webm' })
    const mockFileReader = {
      readAsDataURL: vi.fn(function (this: any) {
        setTimeout(() => {
          this.result = 'data:audio/webm;base64,dGVzdA=='
          if (this.onloadend) {
            this.onloadend()
          }
        }, 0)
      }),
      result: '',
      onloadend: null as any,
    }

    global.FileReader = vi.fn(function () {
      return mockFileReader
    }) as any
    ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce(mockStream)

    const mockRecorder = createMockMediaRecorder({
      onStop: () => {
        if (mockRecorder.ondataavailable) {
          mockRecorder.ondataavailable({ data: mockBlob })
        }
      },
    })

    ;(global.MediaRecorder as any).mockImplementation(function () {
      return mockRecorder
    })

    const { startRecording, isRecording } = useVoiceRecording(maxDuration, onRecorded, onError)

    await startRecording()

    vi.advanceTimersByTime(5000) // 5 seconds - this triggers stopRecordingAndSend

    // Advance timers to process the setTimeout in stopRecordingAndSend (100ms delay)
    vi.advanceTimersByTime(200)

    expect(isRecording.value).toBe(false)
    expect(onRecorded).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('generates waveform data during recording', async () => {
    vi.useFakeTimers()
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const mockStream = {
      getTracks: vi.fn(() => [
        {
          stop: vi.fn(),
        },
      ]),
    }

    const mockAudioContext = createMockAudioContext()
    ;(global.AudioContext as any).mockImplementation(function () {
      return mockAudioContext
    })

    // Mock requestAnimationFrame to use fake timers
    let rafId = 0
    const mockRequestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      rafId++
      // Use setTimeout with fake timers instead of real requestAnimationFrame
      setTimeout(() => {
        callback(performance.now())
      }, 0)
      return rafId
    })
    const mockCancelAnimationFrame = vi.fn()
    global.requestAnimationFrame = mockRequestAnimationFrame as any
    global.cancelAnimationFrame = mockCancelAnimationFrame as any
    ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce(mockStream)

    const { startRecording, waveformData, cancelRecording } = useVoiceRecording(
      maxDuration,
      onRecorded,
      onError,
    )

    await startRecording()

    // Advance timers to trigger requestAnimationFrame callback
    vi.advanceTimersByTime(20)
    await Promise.resolve() // Let the callback execute

    expect(waveformData.value.length).toBe(25) // WAVEFORM_BARS
    expect(waveformData.value.every(val => typeof val === 'number')).toBe(true)

    // Clean up - this should cancel the animation frame
    cancelRecording()

    // Advance timers to ensure cleanup completes and any pending callbacks run
    vi.advanceTimersByTime(100)
    await Promise.resolve()

    // Ensure all pending animation frames are cancelled
    // Cancel any remaining animation frames
    if (mockCancelAnimationFrame.mock.calls.length < mockRequestAnimationFrame.mock.calls.length) {
      // If there are pending animation frames, cancel them
      const pendingRafIds = Array.from({ length: rafId }, (_, i) => i + 1)
      pendingRafIds.forEach(id => mockCancelAnimationFrame(id))
    }

    // Clear any remaining timers before switching to real timers
    vi.clearAllTimers()

    // Restore original requestAnimationFrame from setup.ts before switching to real timers
    // This prevents the unhandled error when test environment is torn down
    global.requestAnimationFrame = vi.fn(cb => {
      setTimeout(cb, 16)
      return 1
    }) as any
    global.cancelAnimationFrame = vi.fn()

    vi.useRealTimers()
  })

  it('cleans up resources on cancel', async () => {
    const maxDuration = ref(60)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const stopTrack = vi.fn()
    const mockStream = {
      getTracks: vi.fn(() => [
        {
          stop: stopTrack,
        },
      ]),
    }

    ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce(mockStream)

    const { startRecording, cancelRecording } = useVoiceRecording(maxDuration, onRecorded, onError)

    await startRecording()
    cancelRecording()

    expect(stopTrack).toHaveBeenCalled()
  })
  describe('cancellation', () => {
    it('releases the microphone and does not record if cancelled while the permission prompt is open', async () => {
      const track = { stop: vi.fn() }
      let grant!: (stream: unknown) => void
      ;(global.navigator.mediaDevices as any).getUserMedia.mockReturnValueOnce(
        new Promise(resolve => (grant = resolve)),
      )
      const onRecorded = vi.fn()
      const onError = vi.fn()
      const { startRecording, cancelRecording, isRecording } = useVoiceRecording(
        ref(60),
        onRecorded,
        onError,
      )

      const starting = startRecording()
      cancelRecording()
      grant({ getTracks: () => [track] })
      await starting

      expect(isRecording.value).toBe(false)
      expect(track.stop).toHaveBeenCalled()
      expect(global.MediaRecorder).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      expect(onRecorded).not.toHaveBeenCalled()
    })

    it('does not send audio if cancelled after stopping but before it is encoded', async () => {
      const mockBlob = new Blob(['audio'], { type: 'audio/webm' })
      const mockFileReader = {
        readAsDataURL: vi.fn(function (this: any) {
          setTimeout(() => {
            mockFileReader.result = 'data:audio/webm;base64,YXVkaW8='
            mockFileReader.onloadend?.()
          }, 10)
        }),
        result: '',
        onloadend: null as any,
        onerror: null as any,
      }
      global.FileReader = vi.fn(function () {
        return mockFileReader
      }) as any
      ;(global.navigator.mediaDevices as any).getUserMedia.mockResolvedValueOnce({
        getTracks: () => [{ stop: vi.fn() }],
      })
      const mockRecorder = createMockMediaRecorder({
        onStop: () => mockRecorder.ondataavailable?.({ data: mockBlob }),
      })
      ;(global.MediaRecorder as any).mockImplementation(function () {
        return mockRecorder
      })
      const onRecorded = vi.fn()
      const onError = vi.fn()
      const { startRecording, stopRecordingAndSend, cancelRecording } = useVoiceRecording(
        ref(60),
        onRecorded,
        onError,
      )

      await startRecording()
      stopRecordingAndSend()
      cancelRecording() // for example the visitor closed the widget
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(onRecorded).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled() // a deliberate cancel is not an error
    })
  })
})
