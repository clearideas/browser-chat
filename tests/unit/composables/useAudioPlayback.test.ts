import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAudioPlayback } from '@/composables/useAudioPlayback'

import { mockBase64Audio } from '../../fixtures/mock-data'
import { createMockAudio } from '../../helpers/mocks'

describe('useAudioPlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates audio element for message', () => {
    const mockAudio = createMockAudio()
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { getMessageAudio, messageAudioState } = useAudioPlayback()

    const audio = getMessageAudio(0, mockBase64Audio)

    expect(audio).toBeDefined()
    expect(messageAudioState.value.get(0)).toBeDefined()
    // Check that the audio is stored in state (composable caches it)
    expect(messageAudioState.value.get(0)?.audio).toBeDefined()
    expect(messageAudioState.value.get(0)?.audio).toEqual(audio)
  })

  it('reuses existing audio element', () => {
    const mockAudio = createMockAudio()
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { getMessageAudio, messageAudioState } = useAudioPlayback()

    const audio1 = getMessageAudio(0, mockBase64Audio)
    const audio2 = getMessageAudio(0, mockBase64Audio)

    // Should return the same cached instance
    expect(audio1).toEqual(audio2)
    expect(messageAudioState.value.get(0)?.audio).toEqual(audio1)
  })

  it('plays audio for message', async () => {
    const mockAudio = createMockAudio()
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { playMessageAudio, messageAudioState } = useAudioPlayback()

    playMessageAudio(0, mockBase64Audio)

    expect(mockAudio.play).toHaveBeenCalled()
    expect(messageAudioState.value.get(0)?.isPlaying).toBe(true)
  })

  it('stops all audio when playing new audio', async () => {
    const mockAudio1 = createMockAudio()
    const mockAudio2 = createMockAudio()
    mockAudio1.paused = false // Simulate playing

    let audioCallCount = 0
    ;(global.Audio as any).mockImplementation(function () {
      return audioCallCount++ === 0 ? mockAudio1 : mockAudio2
    })

    const { playMessageAudio } = useAudioPlayback()

    playMessageAudio(0, mockBase64Audio)
    playMessageAudio(1, mockBase64Audio)

    expect(mockAudio1.pause).toHaveBeenCalled()
    expect(mockAudio2.play).toHaveBeenCalled()
  })

  it('pauses audio', () => {
    const mockAudio = createMockAudio()
    mockAudio.paused = false
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { pauseMessageAudio, playMessageAudio, messageAudioState } = useAudioPlayback()

    // First create and play
    playMessageAudio(0, mockBase64Audio)

    pauseMessageAudio(0)

    expect(mockAudio.pause).toHaveBeenCalled()
    expect(messageAudioState.value.get(0)?.isPlaying).toBe(false)
  })

  it('toggles audio play/pause', () => {
    const mockAudio = createMockAudio()
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { toggleMessageAudio, messageAudioState } = useAudioPlayback()

    // First toggle should play
    toggleMessageAudio(0, mockBase64Audio)
    expect(mockAudio.play).toHaveBeenCalled()
    expect(messageAudioState.value.get(0)?.isPlaying).toBe(true)

    // Second toggle should pause
    mockAudio.paused = false
    toggleMessageAudio(0, mockBase64Audio)
    expect(mockAudio.pause).toHaveBeenCalled()
    expect(messageAudioState.value.get(0)?.isPlaying).toBe(false)
  })

  it('sets audio current time', () => {
    const mockAudio = createMockAudio()
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { setMessageAudioTime, getMessageAudio, messageAudioState } = useAudioPlayback()

    // Create audio first
    getMessageAudio(0, mockBase64Audio)

    setMessageAudioTime(0, 30.5)

    expect(mockAudio.currentTime).toBe(30.5)
    expect(messageAudioState.value.get(0)?.currentTime).toBe(30.5)
  })

  it('calculates audio progress', () => {
    const mockAudio = createMockAudio()
    mockAudio.duration = 100
    mockAudio.currentTime = 25
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { getMessageAudioProgress, getMessageAudio, messageAudioState } = useAudioPlayback()

    getMessageAudio(0, mockBase64Audio)
    // Update state to reflect the currentTime
    const state = messageAudioState.value.get(0)
    if (state) {
      state.currentTime = 25
      state.duration = 100
    }
    const progress = getMessageAudioProgress(0)

    expect(progress).toBe(25)
  })

  it('returns 0 progress for zero duration', () => {
    const mockAudio = createMockAudio()
    mockAudio.duration = 0
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { getMessageAudioProgress, getMessageAudio } = useAudioPlayback()

    getMessageAudio(0, mockBase64Audio)
    const progress = getMessageAudioProgress(0)

    expect(progress).toBe(0)
  })

  it('stops all audio', () => {
    const mockAudio1 = createMockAudio()
    const mockAudio2 = createMockAudio()
    mockAudio1.paused = false
    mockAudio2.paused = false

    let audioCallCount = 0
    ;(global.Audio as any).mockImplementation(function () {
      return audioCallCount++ === 0 ? mockAudio1 : mockAudio2
    })

    const { playMessageAudio, stopAllAudio } = useAudioPlayback()

    playMessageAudio(0, mockBase64Audio)
    playMessageAudio(1, mockBase64Audio)

    stopAllAudio()

    expect(mockAudio1.pause).toHaveBeenCalled()
    expect(mockAudio2.pause).toHaveBeenCalled()
    expect(mockAudio1.currentTime).toBe(0)
    expect(mockAudio2.currentTime).toBe(0)
  })

  it('checks if message audio is playing', () => {
    const mockAudio = createMockAudio()
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { isMessageAudioPlaying, playMessageAudio } = useAudioPlayback()

    expect(isMessageAudioPlaying(0)).toBe(false)

    playMessageAudio(0, mockBase64Audio)

    expect(isMessageAudioPlaying(0)).toBe(true)
  })

  it('updates duration when metadata loads', () => {
    const mockAudio = createMockAudio()
    mockAudio.duration = 120
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { getMessageAudio, messageAudioState } = useAudioPlayback()

    getMessageAudio(0, mockBase64Audio)

    // Simulate metadata loaded
    if (mockAudio.onloadedmetadata) {
      mockAudio.onloadedmetadata()
    }

    expect(messageAudioState.value.get(0)?.duration).toBe(120)
  })

  it('updates current time during playback', () => {
    const mockAudio = createMockAudio()
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { getMessageAudio, messageAudioState } = useAudioPlayback()

    getMessageAudio(0, mockBase64Audio)

    // Simulate time update
    mockAudio.currentTime = 45.5
    if (mockAudio.ontimeupdate) {
      mockAudio.ontimeupdate()
    }

    expect(messageAudioState.value.get(0)?.currentTime).toBe(45.5)
  })

  it('resets state when audio ends', () => {
    const mockAudio = createMockAudio()
    ;(global.Audio as any).mockImplementation(function () {
      return mockAudio
    })

    const { getMessageAudio, messageAudioState } = useAudioPlayback()

    getMessageAudio(0, mockBase64Audio)
    messageAudioState.value.get(0)!.isPlaying = true
    messageAudioState.value.get(0)!.currentTime = 50

    // Simulate audio ended
    if (mockAudio.onended) {
      mockAudio.onended()
    }

    expect(messageAudioState.value.get(0)?.isPlaying).toBe(false)
    expect(messageAudioState.value.get(0)?.currentTime).toBe(0)
  })
})
