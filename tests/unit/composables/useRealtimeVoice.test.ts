import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useRealtimeVoice } from '@/composables/useRealtimeVoice'

describe('useRealtimeVoice', () => {
  let channel: any
  let peer: any
  let analyser: any
  let localTrack: any
  let rafCallbacks: FrameRequestCallback[]

  beforeEach(() => {
    rafCallbacks = []
    global.requestAnimationFrame = vi.fn(callback => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    }) as any
    global.cancelAnimationFrame = vi.fn()

    localTrack = { enabled: true, stop: vi.fn() }
    const localStream = {
      getTracks: vi.fn(() => [localTrack]),
      getAudioTracks: vi.fn(() => [localTrack]),
    }
    ;(global.navigator.mediaDevices.getUserMedia as any).mockResolvedValue(localStream)

    class MockMediaStream {
      tracks: any[] = []
      addTrack(track: any) {
        this.tracks.push(track)
      }
      getTracks() {
        return this.tracks
      }
    }
    global.MediaStream = MockMediaStream as any
    global.Audio = vi.fn(function () {
      return {
        autoplay: false,
        srcObject: null,
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
      }
    }) as any

    const channelListeners: Record<string, Function> = {}
    channel = {
      readyState: 'open',
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((name: string, callback: Function) => {
        channelListeners[name] = callback
      }),
      removeEventListener: vi.fn(),
      emitMessage(event: Record<string, unknown>) {
        channelListeners.message?.({ data: JSON.stringify(event) })
      },
    }

    const peerListeners: Record<string, Function> = {}
    peer = {
      iceGatheringState: 'complete',
      connectionState: 'new',
      localDescription: null,
      addTrack: vi.fn(),
      addEventListener: vi.fn((name: string, callback: Function) => {
        peerListeners[name] = callback
      }),
      removeEventListener: vi.fn(),
      createDataChannel: vi.fn(() => channel),
      createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'browser-offer' })),
      setLocalDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        peer.localDescription = description
      }),
      setRemoteDescription: vi.fn(async () => {
        peer.connectionState = 'connected'
        peerListeners.connectionstatechange?.()
      }),
      close: vi.fn(),
    }
    global.RTCPeerConnection = vi.fn(function () {
      return peer
    }) as any

    analyser = {
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      frequencyBinCount: 32,
      sample: 128,
      getByteTimeDomainData: vi.fn((values: Uint8Array) => values.fill(analyser.sample)),
      disconnect: vi.fn(),
    }
    global.AudioContext = vi.fn(function () {
      return {
        state: 'running',
        resume: vi.fn(async () => undefined),
        createAnalyser: vi.fn(() => analyser),
        createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
        close: vi.fn(async () => undefined),
      }
    }) as any

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          provider: 'openai',
          transport: 'webrtc',
          sdp: 'gateway-answer',
          realtimeSessionId: 'rt-session-1',
          chatId: 'chat-1',
        }),
      })) as any,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function createVoice(overrides: Record<string, any> = {}) {
    return useRealtimeVoice({
      apiUrl: ref('https://api.clearideas.local'),
      accessKey: ref('public-key'),
      chatId: ref<string | null>(null),
      publicSessionId: ref<string | null>('public-session'),
      locale: ref('en-CA'),
      includeCredentials: ref(false),
      ...overrides,
    })
  }

  it('negotiates a credential-free WebRTC session through the Clear Ideas API', async () => {
    const onChatId = vi.fn()
    const voice = createVoice({ onChatId })

    await voice.connect()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.clearideas.local/public/chat/realtime/session',
      expect.objectContaining({ method: 'POST', credentials: 'omit' }),
    )
    const request = (global.fetch as any).mock.calls[0][1]
    expect(request.headers.get('Authorization')).toBe('Bearer public-key')
    expect(request.headers.get('x-clearideas-public-chat-session')).toBe('public-session')
    expect(JSON.parse(request.body)).toEqual({
      sdp: 'browser-offer',
      locale: 'en-CA',
    })
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'gateway-answer',
    })
    expect(voice.connectionState.value).toBe('connected')
    expect(voice.realtimeSessionId.value).toBe('rt-session-1')
    expect(onChatId).toHaveBeenCalledWith('chat-1')

    voice.disconnect()
  })

  it('uses microphone energy only for visuals and never commits turns client-side', async () => {
    const voice = createVoice()
    await voice.connect()

    analyser.sample = 255
    rafCallbacks.shift()?.(1_000)
    analyser.sample = 128
    rafCallbacks.shift()?.(4_500)
    channel.emitMessage({ type: 'response.created' })
    channel.emitMessage({ type: 'input_audio_buffer.speech_started' })

    expect(channel.send).not.toHaveBeenCalled()
    expect(voice.isResponding.value).toBe(false)

    voice.disconnect()
  })

  it('emits user and assistant transcripts from realtime events', async () => {
    const onUserTranscript = vi.fn()
    const onAssistantTranscriptDelta = vi.fn()
    const onAssistantTranscriptDone = vi.fn()
    const voice = createVoice({
      onUserTranscript,
      onAssistantTranscriptDelta,
      onAssistantTranscriptDone,
    })
    await voice.connect()

    channel.emitMessage({
      type: 'conversation.item.input_audio_transcription.updated',
      item_id: 'user-item-1',
      transcript: 'Can you',
    })
    expect(voice.liveUserTranscript.value).toBe('Can you')
    expect(onUserTranscript).not.toHaveBeenCalled()

    channel.emitMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'user-item-1',
      transcript: 'Can you help?',
    })
    channel.emitMessage({
      type: 'response.audio_transcript.delta',
      item_id: 'assistant-item-1',
      response_id: 'response-1',
      delta: 'Of course',
    })
    channel.emitMessage({
      type: 'response.audio_transcript.done',
      item_id: 'assistant-item-1',
      response_id: 'response-1',
      transcript: 'Of course.',
    })

    expect(onUserTranscript).toHaveBeenCalledWith('Can you help?', { itemId: 'user-item-1' })
    expect(onAssistantTranscriptDelta).toHaveBeenCalledWith('Of course', {
      itemId: 'assistant-item-1',
      responseId: 'response-1',
    })
    expect(voice.liveUserTranscript.value).toBe('')
    expect(onAssistantTranscriptDone).toHaveBeenCalledWith('Of course.', {
      itemId: 'assistant-item-1',
      responseId: 'response-1',
    })

    voice.disconnect()
  })

  it('speaks the existing welcome message without adding it to the transcript again', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        provider: 'openai',
        transport: 'webrtc',
        sdp: 'gateway-answer',
        realtimeSessionId: 'rt-session-1',
        chatId: 'chat-1',
        initialGreeting: 'Hi, I am the Acme assistant. How can I help?',
      }),
    })
    const onAssistantTranscriptDelta = vi.fn()
    const onAssistantTranscriptDone = vi.fn()
    const voice = createVoice({ onAssistantTranscriptDelta, onAssistantTranscriptDone })

    await voice.connect()

    expect(channel.send).toHaveBeenCalledOnce()
    expect(JSON.parse(channel.send.mock.calls[0][0])).toEqual({
      type: 'response.create',
      response: {
        instructions: expect.stringContaining(
          JSON.stringify('Hi, I am the Acme assistant. How can I help?'),
        ),
        tools: [],
        tool_choice: 'none',
      },
    })

    channel.emitMessage({ type: 'response.created', response: { id: 'welcome-response' } })
    channel.emitMessage({
      type: 'response.output_audio_transcript.delta',
      response_id: 'welcome-response',
      item_id: 'welcome-item',
      delta: 'Hi, I am the Acme assistant.',
    })
    channel.emitMessage({
      type: 'response.output_audio_transcript.done',
      response_id: 'welcome-response',
      item_id: 'welcome-item',
      transcript: 'Hi, I am the Acme assistant. How can I help?',
    })
    channel.emitMessage({ type: 'response.done', response: { id: 'welcome-response' } })

    expect(onAssistantTranscriptDelta).not.toHaveBeenCalled()
    expect(onAssistantTranscriptDone).not.toHaveBeenCalled()

    channel.emitMessage({ type: 'response.created', response: { id: 'answer-response' } })
    channel.emitMessage({
      type: 'response.output_audio_transcript.done',
      response_id: 'answer-response',
      item_id: 'answer-item',
      transcript: 'How can I help you today?',
    })
    expect(onAssistantTranscriptDone).toHaveBeenCalledWith('How can I help you today?', {
      itemId: 'answer-item',
      responseId: 'answer-response',
    })

    voice.disconnect()
  })

  it('uses the private Clear Ideas WebSocket relay for xAI audio', async () => {
    let socket: any
    const socketListeners: Record<string, Function[]> = {}
    class MockWebSocket {
      static OPEN = 1
      readyState = 0
      send = vi.fn()
      close = vi.fn()
      constructor(
        public url: string,
        public protocols: string[],
      ) {
        socket = this
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN
          for (const listener of socketListeners.open || []) listener({})
        })
      }
      addEventListener(name: string, callback: Function) {
        socketListeners[name] ||= []
        socketListeners[name].push(callback)
      }
    }
    vi.stubGlobal('WebSocket', MockWebSocket)

    const processor = {
      onaudioprocess: null as Function | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    global.AudioContext = vi.fn(function () {
      return {
        destination: {},
        currentTime: 0,
        state: 'running',
        resume: vi.fn(async () => undefined),
        createAnalyser: vi.fn(() => analyser),
        createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
        createScriptProcessor: vi.fn(() => processor),
        close: vi.fn(async () => undefined),
      }
    }) as any
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        provider: 'xai',
        transport: 'websocket',
        realtimeSessionId: 'xai-session-1',
        websocketPath: '/public/chat/realtime/socket?session=xai-session-1',
        websocketProtocol: 'clearideas-realtime.secret',
        sampleRate: 24000,
        chatId: 'chat-1',
      }),
    })

    const voice = createVoice()
    await voice.connect()

    expect(socket.url).toBe(
      'wss://api.clearideas.local/public/chat/realtime/socket?session=xai-session-1',
    )
    expect(socket.protocols).toEqual(['clearideas-realtime.secret'])
    expect(peer.close).toHaveBeenCalled()
    processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array([0, 0.5, -0.5]) },
    })
    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"input_audio_buffer.append"'),
    )

    voice.disconnect()
  })

  it('mutes and unmutes the live microphone track', async () => {
    const voice = createVoice()
    await voice.connect()

    voice.toggleMuted()
    expect(voice.isMuted.value).toBe(true)
    expect(localTrack.enabled).toBe(false)

    voice.toggleMuted()
    expect(voice.isMuted.value).toBe(false)
    expect(localTrack.enabled).toBe(true)

    voice.disconnect()
  })

  it('cleans up and rejects when the realtime endpoint is unavailable', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not enabled' }),
    })
    const voice = createVoice()

    await expect(voice.connect()).rejects.toThrow('Not enabled')
    expect(voice.connectionState.value).toBe('failed')
    expect(peer.close).toHaveBeenCalled()
  })
  describe('cancellation', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>(done => (resolve = done))
      return { promise, resolve }
    }

    it('releases the microphone and stops if ended while the permission prompt is open', async () => {
      const permission = deferred<any>()
      ;(global.navigator.mediaDevices.getUserMedia as any).mockReturnValue(permission.promise)
      const voice = createVoice()

      const connecting = voice.connect()
      voice.disconnect()
      permission.resolve({
        getTracks: () => [localTrack],
        getAudioTracks: () => [localTrack],
      })
      await expect(connecting).resolves.toBeUndefined()

      expect(localTrack.stop).toHaveBeenCalled()
      expect(global.RTCPeerConnection).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
      expect(voice.connectionState.value).toBe('closed')
    })

    it('aborts the session request and never answers the offer if ended meanwhile', async () => {
      const response = deferred<any>()
      let signal: AbortSignal | undefined
      ;(global.fetch as any).mockImplementation((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined
        return response.promise
      })
      const voice = createVoice()

      const connecting = voice.connect()
      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled())
      voice.disconnect()
      expect(signal?.aborted).toBe(true)
      response.resolve({
        ok: true,
        json: async () => ({
          provider: 'openai',
          transport: 'webrtc',
          sdp: 'late-answer',
          realtimeSessionId: 'late',
        }),
      })
      await expect(connecting).resolves.toBeUndefined()

      expect(peer.setRemoteDescription).not.toHaveBeenCalled()
      expect(peer.close).toHaveBeenCalled()
      expect(localTrack.stop).toHaveBeenCalled()
      expect(voice.connectionState.value).toBe('closed')
    })

    it('does not let an abandoned attempt tear down a newer connection', async () => {
      const firstPermission = deferred<any>()
      const firstTrack = { enabled: true, stop: vi.fn() }
      ;(global.navigator.mediaDevices.getUserMedia as any).mockReturnValueOnce(
        firstPermission.promise,
      )
      const voice = createVoice()

      const first = voice.connect()
      voice.disconnect()
      await voice.connect() // second attempt connects normally
      expect(voice.connectionState.value).toBe('connected')

      firstPermission.resolve({ getTracks: () => [firstTrack], getAudioTracks: () => [firstTrack] })
      await first
      expect(firstTrack.stop).toHaveBeenCalled() // the late stream is released
      expect(localTrack.stop).not.toHaveBeenCalled() // the live call keeps its microphone
      expect(voice.connectionState.value).toBe('connected')
    })
  })
})
