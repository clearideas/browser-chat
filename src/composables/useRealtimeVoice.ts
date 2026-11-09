import { computed, getCurrentInstance, onUnmounted, type Ref, ref } from 'vue'

import type { RealtimeTranscriptIdentity } from '../utils/realtimeTranscript'

const DEFAULT_WAVEFORM_BARS = 25
const XAI_SAMPLE_RATE = 24000

export type RealtimeVoiceConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed'

interface RealtimeVoiceSessionBase {
  provider: 'openai' | 'xai'
  realtimeSessionId: string
  chatId?: string
  initialGreeting?: string
}

interface WebRTCRealtimeVoiceSession extends RealtimeVoiceSessionBase {
  provider: 'openai'
  transport: 'webrtc'
  sdp: string
}

interface WebSocketRealtimeVoiceSession extends RealtimeVoiceSessionBase {
  provider: 'xai'
  transport: 'websocket'
  websocketPath: string
  websocketProtocol: string
  sampleRate: number
}

export type RealtimeVoiceSessionResponse =
  WebRTCRealtimeVoiceSession | WebSocketRealtimeVoiceSession

export interface RealtimeVoiceOptions {
  apiUrl: Ref<string>
  accessKey: Ref<string>
  chatId: Ref<string | null>
  publicSessionId: Ref<string | null>
  locale: Ref<string>
  includeCredentials: Ref<boolean>
  waveformBars?: Ref<number>
  onChatId?: (chatId: string) => void
  onUserTranscript?: (transcript: string, identity: RealtimeTranscriptIdentity) => void
  onAssistantTranscriptDelta?: (delta: string, identity: RealtimeTranscriptIdentity) => void
  onAssistantTranscriptDone?: (transcript: string, identity: RealtimeTranscriptIdentity) => void
  onError?: (message: string) => void
}

/**
 * Owns a native speech-to-speech session. OpenAI audio uses WebRTC; xAI audio
 * uses a server-relayed WebSocket. Both providers own end-of-turn detection and
 * barge-in. Microphone amplitude is sampled only to animate the voice UI.
 */
export function useRealtimeVoice(options: RealtimeVoiceOptions) {
  const connectionState = ref<RealtimeVoiceConnectionState>('idle')
  const realtimeSessionId = ref<string | null>(null)
  const isListening = ref(false)
  const isResponding = ref(false)
  const isMuted = ref(false)
  const liveUserTranscript = ref('')
  const recordingDuration = ref(0)
  const numBars = computed(() => options.waveformBars?.value ?? DEFAULT_WAVEFORM_BARS)
  const waveformData = ref<number[]>(Array(numBars.value).fill(0))

  let peerConnection: RTCPeerConnection | null = null
  let eventChannel: RTCDataChannel | null = null
  let providerSocket: WebSocket | null = null
  let microphoneStream: MediaStream | null = null
  let remoteStream: MediaStream | null = null
  let remoteAudio: HTMLAudioElement | null = null
  let audioContext: AudioContext | null = null
  let microphoneSource: MediaStreamAudioSourceNode | null = null
  let analyserNode: AnalyserNode | null = null
  let processorNode: ScriptProcessorNode | null = null
  let animationFrameId: number | null = null
  let durationTimer: number | null = null
  let assistantTranscript = ''
  let pendingOpenAIGreeting: string | null = null
  let greetingResponsePending = false
  let greetingResponseId: string | null = null
  let nextPlaybackTime = 0
  const playbackSources = new Set<AudioBufferSourceNode>()

  const supportsRealtimeVoice = computed(
    () =>
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      (typeof RTCPeerConnection !== 'undefined' ||
        (typeof WebSocket !== 'undefined' &&
          typeof (window.AudioContext || (window as any).webkitAudioContext) !== 'undefined')),
  )

  const isActive = computed(
    () => connectionState.value === 'connecting' || connectionState.value === 'connected',
  )

  function sendEvent(event: Record<string, unknown>): boolean {
    const serialized = JSON.stringify(event)
    if (typeof WebSocket !== 'undefined' && providerSocket?.readyState === WebSocket.OPEN) {
      providerSocket.send(serialized)
      return true
    }
    if (eventChannel?.readyState === 'open') {
      eventChannel.send(serialized)
      return true
    }
    return false
  }

  function beginGreetingTranscriptSuppression() {
    greetingResponsePending = true
    greetingResponseId = null
    assistantTranscript = ''
  }

  function sendPendingOpenAIGreeting() {
    if (!pendingOpenAIGreeting) return
    const greeting = pendingOpenAIGreeting
    const sent = sendEvent({
      type: 'response.create',
      response: {
        instructions: `Begin the conversation by speaking this welcome message exactly as written, without adding, removing, or changing any words: ${JSON.stringify(greeting)}`,
        tools: [],
        tool_choice: 'none',
      },
    })
    if (sent) {
      pendingOpenAIGreeting = null
      beginGreetingTranscriptSuppression()
    }
  }

  function getEventResponseId(event: Record<string, any>): string | null {
    if (typeof event.response_id === 'string') return event.response_id
    if (typeof event.response?.id === 'string') return event.response.id
    return null
  }

  function isGreetingResponseEvent(event: Record<string, any>): boolean {
    if (!greetingResponsePending) return false
    const responseId = getEventResponseId(event)
    return !greetingResponseId || !responseId || responseId === greetingResponseId
  }

  function updateWaveform() {
    if (!analyserNode || !isListening.value) return
    const bufferLength = analyserNode.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyserNode.getByteTimeDomainData(dataArray)
    const bars = numBars.value
    const samplesPerBar = Math.max(1, Math.floor(bufferLength / bars))
    const nextWaveform: number[] = []

    for (let bar = 0; bar < bars; bar += 1) {
      const start = bar * samplesPerBar
      const end = Math.min(start + samplesPerBar, bufferLength)
      let sumSquares = 0
      for (let sample = start; sample < end; sample += 1) {
        const normalized = (dataArray[sample] - 128) / 128
        sumSquares += normalized * normalized
      }
      nextWaveform.push(end > start ? Math.min(1, Math.sqrt(sumSquares / (end - start)) * 2) : 0)
    }
    waveformData.value = nextWaveform

    if (isListening.value && typeof requestAnimationFrame === 'function') {
      animationFrameId = requestAnimationFrame(updateWaveform)
    }
  }

  function stopPlayback() {
    for (const source of playbackSources) {
      try {
        source.stop()
      } catch {
        // It may already have ended between the event and this cleanup.
      }
    }
    playbackSources.clear()
    nextPlaybackTime = audioContext?.currentTime ?? 0
  }

  function playPcmChunk(base64: string, sampleRate: number) {
    if (!audioContext || !base64) return
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => undefined)
    }
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    const samples = new Int16Array(bytes.buffer)
    const buffer = audioContext.createBuffer(1, samples.length, sampleRate)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index] / 32768

    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    source.onended = () => playbackSources.delete(source)
    const startsAt = Math.max(audioContext.currentTime + 0.01, nextPlaybackTime)
    source.start(startsAt)
    nextPlaybackTime = startsAt + buffer.duration
    playbackSources.add(source)
  }

  function handleRealtimeEventData(raw: string) {
    let event: Record<string, any>
    try {
      event = JSON.parse(raw)
    } catch {
      return
    }

    const transcriptIdentity: RealtimeTranscriptIdentity = {
      ...(typeof event.item_id === 'string' ? { itemId: event.item_id } : {}),
      ...(typeof event.response_id === 'string' ? { responseId: event.response_id } : {}),
    }

    switch (event.type) {
      case 'conversation.item.input_audio_transcription.updated':
        // xAI sends a cumulative transcript that may correct earlier fragments.
        // Keep it out of chat history until the provider declares it complete.
        if (event.transcript || event.text) {
          liveUserTranscript.value = event.transcript || event.text
        }
        break
      case 'conversation.item.input_audio_transcription.completed':
      case 'input_audio_transcription.completed':
        if (event.transcript) {
          liveUserTranscript.value = event.transcript
          options.onUserTranscript?.(event.transcript, transcriptIdentity)
        }
        break
      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
        if (event.delta) {
          liveUserTranscript.value = ''
          if (!isGreetingResponseEvent(event)) {
            assistantTranscript += event.delta
            options.onAssistantTranscriptDelta?.(event.delta, transcriptIdentity)
          }
        }
        break
      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done': {
        if (!isGreetingResponseEvent(event)) {
          const transcript = event.transcript || assistantTranscript
          if (transcript) options.onAssistantTranscriptDone?.(transcript, transcriptIdentity)
        }
        assistantTranscript = ''
        break
      }
      case 'response.audio.delta':
      case 'response.output_audio.delta':
        if (event.delta) {
          liveUserTranscript.value = ''
          playPcmChunk(event.delta, XAI_SAMPLE_RATE)
        }
        break
      case 'input_audio_buffer.speech_started':
        // The provider—not microphone amplitude—declared a barge-in. Stop any
        // already queued relay audio so the UI matches the provider's interruption.
        stopPlayback()
        liveUserTranscript.value = ''
        isResponding.value = false
        break
      case 'response.created':
        if (greetingResponsePending && !greetingResponseId) {
          greetingResponseId = getEventResponseId(event)
        }
        isResponding.value = true
        break
      case 'response.done':
        isResponding.value = false
        liveUserTranscript.value = ''
        if (assistantTranscript && !isGreetingResponseEvent(event)) {
          options.onAssistantTranscriptDone?.(assistantTranscript, transcriptIdentity)
        }
        assistantTranscript = ''
        if (isGreetingResponseEvent(event)) {
          greetingResponsePending = false
          greetingResponseId = null
        }
        break
      case 'clearideas.chat.updated':
        if (event.chatId) options.onChatId?.(event.chatId)
        break
      case 'error':
        options.onError?.(event.error?.message || event.message || 'Realtime voice error')
        break
    }
  }

  function handleDataChannelEvent(event: MessageEvent<string>) {
    handleRealtimeEventData(event.data)
  }

  async function waitForIceGathering(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === 'complete') return
    await new Promise<void>(resolve => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        pc.removeEventListener('icegatheringstatechange', listener)
        resolve()
      }
      const listener = () => {
        if (pc.iceGatheringState === 'complete') finish()
      }
      const timeout = window.setTimeout(finish, 1500)
      pc.addEventListener('icegatheringstatechange', listener)
    })
  }

  function ensureAudioContext(sampleRate?: number): AudioContext | null {
    if (audioContext) return audioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return null
    audioContext = new AudioContextClass(sampleRate ? { sampleRate } : undefined)
    return audioContext
  }

  function beginAnalyser(stream: MediaStream, sampleRate?: number) {
    const context = ensureAudioContext(sampleRate)
    if (!context) return
    microphoneSource = context.createMediaStreamSource(stream)
    analyserNode = context.createAnalyser()
    analyserNode.fftSize = 2048
    analyserNode.smoothingTimeConstant = 0.8
    microphoneSource.connect(analyserNode)
    animationFrameId = requestAnimationFrame(updateWaveform)
  }

  function float32ToBase64Pcm16(samples: Float32Array): string {
    const pcm = new Int16Array(samples.length)
    for (let index = 0; index < samples.length; index += 1) {
      const value = Math.max(-1, Math.min(1, samples[index]))
      pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff
    }
    const bytes = new Uint8Array(pcm.buffer)
    let binary = ''
    for (let index = 0; index < bytes.length; index += 1)
      binary += String.fromCharCode(bytes[index])
    return btoa(binary)
  }

  function resampleAudio(
    samples: Float32Array,
    sourceRate: number,
    targetRate: number,
  ): Float32Array {
    if (sourceRate === targetRate) return samples
    const outputLength = Math.max(1, Math.round((samples.length * targetRate) / sourceRate))
    const output = new Float32Array(outputLength)
    const ratio = sourceRate / targetRate
    for (let index = 0; index < outputLength; index += 1) {
      const sourcePosition = index * ratio
      const before = Math.floor(sourcePosition)
      const after = Math.min(before + 1, samples.length - 1)
      const fraction = sourcePosition - before
      output[index] = samples[before] * (1 - fraction) + samples[after] * fraction
    }
    return output
  }

  function beginXaiMicrophone(stream: MediaStream, sampleRate: number) {
    beginAnalyser(stream, sampleRate)
    if (!audioContext || !microphoneSource)
      throw new Error('Browser audio processing is unavailable')
    processorNode = audioContext.createScriptProcessor(2048, 1, 1)
    processorNode.onaudioprocess = event => {
      if (isMuted.value || providerSocket?.readyState !== WebSocket.OPEN) return
      const samples = resampleAudio(
        event.inputBuffer.getChannelData(0),
        audioContext?.sampleRate || sampleRate,
        sampleRate,
      )
      const audio = float32ToBase64Pcm16(samples)
      sendEvent({ type: 'input_audio_buffer.append', audio })
    }
    microphoneSource.connect(processorNode)
    processorNode.connect(audioContext.destination)
  }

  async function connectXai(session: WebSocketRealtimeVoiceSession) {
    peerConnection?.close()
    peerConnection = null
    eventChannel?.close()
    eventChannel = null
    if (remoteAudio) {
      remoteAudio.pause()
      remoteAudio.srcObject = null
    }
    remoteAudio = null
    remoteStream = null

    const socketBase = options.apiUrl.value.replace(/^http/i, 'ws')
    providerSocket = new WebSocket(`${socketBase}${session.websocketPath}`, [
      session.websocketProtocol,
    ])
    providerSocket.addEventListener('message', event => {
      if (typeof event.data === 'string') handleRealtimeEventData(event.data)
    })
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Timed out connecting voice relay')),
        8000,
      )
      providerSocket?.addEventListener(
        'open',
        () => {
          window.clearTimeout(timeout)
          resolve()
        },
        { once: true },
      )
      providerSocket?.addEventListener(
        'error',
        () => {
          window.clearTimeout(timeout)
          reject(new Error('Could not connect voice relay'))
        },
        { once: true },
      )
    })
    providerSocket.addEventListener('close', () => {
      if (connectionState.value === 'connected') connectionState.value = 'closed'
    })
    beginXaiMicrophone(microphoneStream!, session.sampleRate || XAI_SAMPLE_RATE)
    connectionState.value = 'connected'
  }

  async function connect() {
    if (connectionState.value === 'connected') return
    if (!supportsRealtimeVoice.value) throw new Error('Realtime voice is not supported')
    if (!options.apiUrl.value || !options.accessKey.value) {
      throw new Error('Realtime voice configuration is missing')
    }

    cleanup('idle')
    connectionState.value = 'connecting'

    try {
      // Construct the context while the call button's user activation is still
      // available. xAI audio arrives later over WebSocket and reuses it.
      const context = ensureAudioContext()
      if (context?.state === 'suspended') void context.resume().catch(() => undefined)
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      isMuted.value = false

      let offerSdp: string | undefined
      if (typeof RTCPeerConnection !== 'undefined') {
        peerConnection = new RTCPeerConnection()
        remoteStream = new MediaStream()
        remoteAudio = new Audio()
        remoteAudio.autoplay = true
        remoteAudio.srcObject = remoteStream
        for (const track of microphoneStream.getTracks())
          peerConnection.addTrack(track, microphoneStream)
        peerConnection.addEventListener('track', event => {
          for (const track of event.streams[0]?.getTracks() || [event.track])
            remoteStream?.addTrack(track)
          void remoteAudio?.play().catch(() => undefined)
        })
        peerConnection.addEventListener('connectionstatechange', () => {
          if (!peerConnection) return
          if (peerConnection.connectionState === 'connected') connectionState.value = 'connected'
          else if (peerConnection.connectionState === 'failed') {
            connectionState.value = 'failed'
            options.onError?.('Realtime voice connection failed')
          } else if (peerConnection.connectionState === 'disconnected') {
            connectionState.value = 'reconnecting'
          } else if (peerConnection.connectionState === 'closed') connectionState.value = 'closed'
        })
        eventChannel = peerConnection.createDataChannel('oai-events')
        eventChannel.addEventListener('message', handleDataChannelEvent)
        eventChannel.addEventListener('open', sendPendingOpenAIGreeting)
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        await waitForIceGathering(peerConnection)
        offerSdp = peerConnection.localDescription?.sdp || offer.sdp
      }

      const headers = new Headers({
        Authorization: `Bearer ${options.accessKey.value}`,
        'Content-Type': 'application/json',
        'Accept-Language': options.locale.value,
      })
      if (options.publicSessionId.value) {
        headers.set('x-clearideas-public-chat-session', options.publicSessionId.value)
      }
      const response = await fetch(`${options.apiUrl.value}/public/chat/realtime/session`, {
        method: 'POST',
        headers,
        credentials: options.includeCredentials.value ? 'include' : 'omit',
        body: JSON.stringify({
          ...(offerSdp ? { sdp: offerSdp } : {}),
          chatId: options.chatId.value || undefined,
          locale: options.locale.value,
        }),
      })
      if (!response.ok) {
        const details = await response.json().catch(() => null)
        throw new Error(details?.message || `Realtime voice is unavailable (${response.status})`)
      }

      const session = (await response.json()) as RealtimeVoiceSessionResponse
      if (!session.realtimeSessionId || !session.transport) {
        throw new Error('Realtime voice returned an invalid session')
      }
      realtimeSessionId.value = session.realtimeSessionId
      if (session.chatId) options.onChatId?.(session.chatId)

      if (session.transport === 'websocket') {
        if (!session.websocketPath || !session.websocketProtocol) {
          throw new Error('Realtime voice returned an invalid WebSocket session')
        }
        if (session.initialGreeting?.trim()) beginGreetingTranscriptSuppression()
        await connectXai(session)
      } else {
        if (!peerConnection || !session.sdp) {
          throw new Error('This browser cannot use the configured WebRTC voice provider')
        }
        pendingOpenAIGreeting = session.initialGreeting?.trim() || null
        await peerConnection.setRemoteDescription({ type: 'answer', sdp: session.sdp })
        sendPendingOpenAIGreeting()
        beginAnalyser(microphoneStream)
      }

      isListening.value = true
      recordingDuration.value = 0
      durationTimer = window.setInterval(() => {
        recordingDuration.value += 1
      }, 1000)
    } catch (error) {
      cleanup('failed')
      throw error
    }
  }

  function cleanup(finalState: RealtimeVoiceConnectionState = 'closed') {
    isListening.value = false
    isResponding.value = false
    isMuted.value = false
    liveUserTranscript.value = ''
    assistantTranscript = ''
    pendingOpenAIGreeting = null
    greetingResponsePending = false
    greetingResponseId = null
    stopPlayback()

    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
    if (durationTimer !== null) window.clearInterval(durationTimer)
    animationFrameId = null
    durationTimer = null
    processorNode?.disconnect()
    processorNode = null
    microphoneSource?.disconnect()
    microphoneSource = null
    analyserNode?.disconnect()
    analyserNode = null
    void audioContext?.close().catch(() => undefined)
    audioContext = null

    eventChannel?.removeEventListener('message', handleDataChannelEvent)
    eventChannel?.removeEventListener('open', sendPendingOpenAIGreeting)
    eventChannel?.close()
    eventChannel = null
    providerSocket?.close()
    providerSocket = null
    peerConnection?.close()
    peerConnection = null
    microphoneStream?.getTracks().forEach(track => track.stop())
    remoteStream?.getTracks().forEach(track => track.stop())
    microphoneStream = null
    remoteStream = null
    if (remoteAudio) {
      remoteAudio.pause()
      remoteAudio.srcObject = null
    }
    remoteAudio = null
    waveformData.value = Array(numBars.value).fill(0)
    recordingDuration.value = 0
    realtimeSessionId.value = null
    connectionState.value = finalState
  }

  function disconnect() {
    cleanup('closed')
  }

  function toggleMuted() {
    if (!microphoneStream) return
    isMuted.value = !isMuted.value
    microphoneStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted.value
    })
  }

  if (getCurrentInstance()) onUnmounted(disconnect)

  return {
    connectionState,
    realtimeSessionId,
    isActive,
    isListening,
    isResponding,
    isMuted,
    liveUserTranscript,
    recordingDuration,
    waveformData,
    supportsRealtimeVoice,
    connect,
    toggleMuted,
    disconnect,
  }
}
