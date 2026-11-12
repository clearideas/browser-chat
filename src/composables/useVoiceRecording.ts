import { computed, type Ref, ref, watch } from 'vue'

import { microphoneErrorKind, type VoiceErrorKind } from '../utils/errors'

const DEFAULT_WAVEFORM_BARS = 25 // Default number of bars to display in waveform

// Silence detection configuration
const SILENCE_THRESHOLD = 0.02 // RMS amplitude threshold (0-1 range, lower = more sensitive)
const SILENCE_DURATION_MS = 3000 // Duration of silence before auto-submit (3 seconds)
const MIN_RECORDING_DURATION_MS = 500 // Minimum recording duration before auto-submit (0.5 seconds)
// Enable debug logging only when window.__ClearIdeasWidgetDebug is set
const DEBUG_SILENCE =
  typeof window !== 'undefined' && (window as any).__ClearIdeasWidgetDebug === true

export function useVoiceRecording(
  maxDuration: Ref<number>,
  onRecorded: (audioBase64: string, format: string) => Promise<void>,
  onError: (kind: VoiceErrorKind) => void,
  waveformBars?: Ref<number>,
) {
  const isRecording = ref<boolean>(false)
  const recordingDuration = ref<number>(0)
  const mediaRecorder = ref<MediaRecorder | null>(null)
  // Container actually recorded: WebM where supported, MP4 (sent as "m4a") on Safari.
  let recordedMimeType = 'audio/webm'
  // Each recording is an attempt; cancelRecording() supersedes it. Work that
  // resumes after an await (the permission prompt, encoding) checks it is still current.
  let attempt = 0
  const audioStream = ref<MediaStream | null>(null)
  const recordingTimer = ref<number | null>(null)
  const audioChunks = ref<Blob[]>([])

  // Web Audio API for waveform visualization
  const audioContext = ref<AudioContext | null>(null)
  const analyserNode = ref<AnalyserNode | null>(null)
  const animationFrameId = ref<number | null>(null)
  const numBars = computed(() => waveformBars?.value ?? DEFAULT_WAVEFORM_BARS)
  const waveformData = ref<number[]>(Array(numBars.value).fill(0))

  // Watch for changes to numBars and resize the waveform data array
  watch(
    numBars,
    newNumBars => {
      const currentLength = waveformData.value.length
      if (newNumBars > currentLength) {
        // Add more bars
        waveformData.value = [...waveformData.value, ...Array(newNumBars - currentLength).fill(0)]
      } else if (newNumBars < currentLength) {
        // Remove bars
        waveformData.value = waveformData.value.slice(0, newNumBars)
      }
    },
    { immediate: false },
  )

  // Silence detection state
  const silenceStartTime = ref<number | null>(null)
  const recordingStartTime = ref<number | null>(null)
  const lastDebugLogTime = ref<number>(0)

  function scheduleAnimationFrame(callback: FrameRequestCallback): number | null {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      return globalThis.requestAnimationFrame(callback)
    }

    return null
  }

  function cancelScheduledAnimationFrame(id: number | null) {
    if (id === null) return

    if (typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(id)
    }
  }

  const supportsVoiceRecording = computed(() => {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia !== 'undefined'
    )
  })

  const supportsWebAudio = computed(() => {
    return (
      typeof AudioContext !== 'undefined' ||
      typeof (window as any).webkitAudioContext !== 'undefined'
    )
  })

  function updateWaveform() {
    if (!analyserNode.value || !isRecording.value) {
      return
    }

    try {
      // Get time-domain data (amplitude samples)
      const bufferLength = analyserNode.value.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      analyserNode.value.getByteTimeDomainData(dataArray)

      // Calculate overall RMS amplitude for silence detection
      let sumSquares = 0
      for (let i = 0; i < bufferLength; i++) {
        // Convert from 0-255 range to -1 to 1 range, then square
        const normalized = (dataArray[i] - 128) / 128
        sumSquares += normalized * normalized
      }
      const overallRms = Math.sqrt(sumSquares / bufferLength)
      const overallAmplitude = Math.min(1, overallRms * 2) // Scale up and clamp to 0-1

      // Sample the buffer into segments for each bar
      const bars = numBars.value
      const samplesPerBar = Math.max(1, Math.floor(bufferLength / bars))
      const newWaveformData: number[] = []

      for (let i = 0; i < bars; i++) {
        const startIndex = i * samplesPerBar
        const endIndex = Math.min(startIndex + samplesPerBar, bufferLength)

        if (endIndex <= startIndex) {
          newWaveformData.push(0)
          continue
        }

        // Calculate RMS (root mean square) amplitude for this segment
        let sumSquares = 0
        for (let j = startIndex; j < endIndex; j++) {
          // Convert from 0-255 range to -1 to 1 range, then square
          const normalized = (dataArray[j] - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / (endIndex - startIndex))

        // Convert to 0-1 range and apply smoothing
        const amplitude = Math.min(1, rms * 2) // Scale up and clamp
        newWaveformData.push(amplitude)
      }

      waveformData.value = newWaveformData

      // Silence detection logic
      const currentTime = Date.now()
      const isSilent = overallAmplitude < SILENCE_THRESHOLD

      // Throttle debug logging to once per second to avoid spam
      if (DEBUG_SILENCE && currentTime - lastDebugLogTime.value > 1000) {
        lastDebugLogTime.value = currentTime
      }

      if (isSilent) {
        // Start tracking silence if not already tracking
        if (silenceStartTime.value === null) {
          silenceStartTime.value = currentTime
          if (DEBUG_SILENCE) {
          }
        } else {
          // Check if silence duration exceeds threshold
          const silenceDurationMs = currentTime - silenceStartTime.value
          const totalRecordingDurationMs = recordingStartTime.value
            ? currentTime - recordingStartTime.value
            : 0

          if (DEBUG_SILENCE) {
          }

          // Auto-submit if:
          // 1. Silence duration exceeds threshold
          // 2. Recording has been active for minimum duration (to avoid immediate auto-submit)
          if (
            silenceDurationMs >= SILENCE_DURATION_MS &&
            totalRecordingDurationMs >= MIN_RECORDING_DURATION_MS
          ) {
            if (DEBUG_SILENCE) {
            }
            stopRecordingAndSend()
            return // Exit early since we're stopping recording
          }
        }
      } else {
        // Sound detected - reset silence tracking
        if (silenceStartTime.value !== null && DEBUG_SILENCE) {
        }
        silenceStartTime.value = null
      }
    } catch (err) {
      console.error('[ClearIdeasWidget] Error updating waveform:', err)
    }

    // Continue animation loop
    if (isRecording.value) {
      animationFrameId.value = scheduleAnimationFrame(updateWaveform)
    }
  }

  async function startRecording() {
    const current = ++attempt
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (current !== attempt) {
        // Cancelled while the permission prompt was open: release the microphone.
        stream.getTracks().forEach(track => track.stop())
        return
      }
      audioStream.value = stream

      // Reset state
      audioChunks.value = []
      recordingDuration.value = 0
      waveformData.value = Array(numBars.value).fill(0)
      isRecording.value = true
      silenceStartTime.value = null
      recordingStartTime.value = Date.now()
      lastDebugLogTime.value = 0

      // Set up Web Audio API for waveform visualization
      if (supportsWebAudio.value) {
        try {
          const AudioContextClass =
            (window as any).AudioContext || (window as any).webkitAudioContext
          const context = new AudioContextClass()
          audioContext.value = context

          const analyser = context.createAnalyser()
          analyser.fftSize = 2048
          analyser.smoothingTimeConstant = 0.8
          analyserNode.value = analyser

          const source = context.createMediaStreamSource(stream)
          source.connect(analyser)

          // Start waveform animation loop
          animationFrameId.value = scheduleAnimationFrame(updateWaveform)
          if (DEBUG_SILENCE) {
          }
        } catch (err) {
          console.warn(
            '[ClearIdeasWidget] Web Audio API not available, waveform will not update:',
            err,
          )
          if (DEBUG_SILENCE) {
            console.warn('[SilenceDetection] Web Audio API failed, silence detection disabled')
          }
        }
      } else {
        if (DEBUG_SILENCE) {
          console.warn('[SilenceDetection] Web Audio API not supported, silence detection disabled')
        }
      }

      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      recordedMimeType = mimeType
      const recorder = new MediaRecorder(stream, {
        mimeType,
      })

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.value.push(event.data)
        }
      }

      recorder.onstop = () => {
        // Will be handled by stopRecordingAndSend or cancelRecording
      }

      mediaRecorder.value = recorder
      recorder.start()

      // Start timer
      recordingTimer.value = window.setInterval(() => {
        recordingDuration.value += 1
        if (recordingDuration.value >= maxDuration.value) {
          stopRecordingAndSend()
        }
      }, 1000)
    } catch (err) {
      if (current !== attempt) return // cancelled meanwhile; nothing to report
      console.error('[ClearIdeasWidget] Failed to start recording:', err)
      onError(microphoneErrorKind(err, 'recording-failed'))
      cleanupRecording()
    }
  }

  function stopRecordingAndSend() {
    if (!mediaRecorder.value || !isRecording.value) return

    mediaRecorder.value.stop()
    isRecording.value = false
    silenceStartTime.value = null
    recordingStartTime.value = null

    if (recordingTimer.value !== null) {
      clearInterval(recordingTimer.value)
      recordingTimer.value = null
    }

    // Wait for recorder to stop and process chunks
    const current = attempt
    setTimeout(() => {
      if (current !== attempt) return // cancelled before the audio was sent
      if (audioChunks.value.length === 0) {
        onError('no-audio')
        cleanupRecording()
        return
      }

      // Combine chunks into single blob
      const audioBlob = new Blob(audioChunks.value, { type: recordedMimeType })

      // Convert to base64
      const reader = new FileReader()
      reader.onloadend = () => {
        if (current !== attempt) return
        const base64Audio = (reader.result as string).split(',')[1]
        // Protocol formats: webm, mp3, wav, m4a, ogg (docs/protocol/openapi.yaml VoiceRequest).
        onRecorded(base64Audio, recordedMimeType === 'audio/mp4' ? 'm4a' : 'webm')
      }
      reader.onerror = () => {
        console.error('[ClearIdeasWidget] Failed to read the recording:', reader.error)
        onError('recording-failed')
        cleanupRecording()
      }
      reader.readAsDataURL(audioBlob)
    }, 100)
  }

  function cancelRecording() {
    attempt += 1
    if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
      mediaRecorder.value.stop()
    }
    isRecording.value = false
    audioChunks.value = []
    recordingDuration.value = 0
    silenceStartTime.value = null
    recordingStartTime.value = null
    cleanupRecording()
  }

  function cleanupRecording() {
    // Stop animation loop
    if (animationFrameId.value !== null) {
      cancelScheduledAnimationFrame(animationFrameId.value)
      animationFrameId.value = null
    }

    // Clean up Web Audio API
    if (analyserNode.value) {
      analyserNode.value.disconnect()
      analyserNode.value = null
    }

    if (audioContext.value) {
      audioContext.value
        .close()
        .catch(err => console.warn('[ClearIdeasWidget] Error closing AudioContext:', err))
      audioContext.value = null
    }

    // Reset waveform data
    waveformData.value = Array(numBars.value).fill(0)

    // Reset silence detection state
    silenceStartTime.value = null
    recordingStartTime.value = null

    if (recordingTimer.value !== null) {
      clearInterval(recordingTimer.value)
      recordingTimer.value = null
    }

    if (audioStream.value) {
      audioStream.value.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      audioStream.value = null
    }

    mediaRecorder.value = null
    recordingDuration.value = 0
  }

  return {
    isRecording,
    recordingDuration,
    waveformData,
    supportsVoiceRecording,
    startRecording,
    stopRecordingAndSend,
    cancelRecording,
    cleanupRecording,
  }
}
