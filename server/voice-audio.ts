// Audio the test server sends back for voice (it never calls a speech service).
// - Recorded voice replies: fixtures/voice-reply.webm, a short WebM/Opus tone made by
//   scripts/generate-voice-fixture.mjs, split into an initialization segment and clusters.
// - Realtime replies: a PCM16 tone generated here, in the relay's sample rate.

import { readFileSync } from 'node:fs'

import { splitWebm } from './webm.ts'

export interface RecordedReplyAudio {
  /** The whole file, base64 (the `audio` event and `done.audio`). */
  audio: string
  /** Initialization segment, then one chunk per cluster, base64 (`audioChunk` events). */
  chunks: string[]
}

let recordedReply: RecordedReplyAudio | null = null

export function recordedReplyAudio(): RecordedReplyAudio {
  if (!recordedReply) {
    const bytes = readFileSync(new URL('./fixtures/voice-reply.webm', import.meta.url))
    const { initSegment, clusters } = splitWebm(bytes)
    recordedReply = {
      audio: bytes.toString('base64'),
      chunks: [initSegment, ...clusters].map(part => Buffer.from(part).toString('base64')),
    }
  }
  return recordedReply
}

/**
 * A soft tone as mono PCM16 (little-endian), split into base64 chunks of `chunkMs` each, as
 * realtime `response.output_audio.delta` events carry it.
 */
export function pcmToneChunks(
  seconds: number,
  sampleRate: number,
  frequency = 523.25,
  chunkMs = 100,
): string[] {
  const total = Math.round(seconds * sampleRate)
  const samples = new Int16Array(total)
  const fade = Math.round(sampleRate * 0.03)
  for (let index = 0; index < total; index += 1) {
    const envelope = Math.min(1, index / fade, (total - index) / fade)
    samples[index] = Math.round(
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * envelope * 0.25 * 0x7fff,
    )
  }
  const bytes = Buffer.from(samples.buffer)
  const chunkBytes = Math.max(2, Math.round((sampleRate * chunkMs) / 1000) * 2)
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    chunks.push(bytes.subarray(offset, offset + chunkBytes).toString('base64'))
  }
  return chunks
}
