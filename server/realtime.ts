// Realtime voice over the WebSocket relay transport (protocol README §12.1), with a canned
// conversation instead of a speech-to-speech provider.
//
// `POST /public/chat/realtime/session` creates a one-time relay token; the browser then opens
// `ws://…/public/chat/realtime/relay/<token>` with subprotocol REALTIME_PROTOCOL and streams
// microphone audio as `input_audio_buffer.append` events (base64 PCM16). This relay:
// - speaks the greeting when a new chat starts (the widget keeps its transcript out of the chat);
// - after every TURN_SECONDS of received audio, acts as if the visitor finished a sentence:
//   `input_audio_buffer.speech_started`, the user transcript, then a spoken reply (transcript
//   deltas and PCM16 audio), `response.done`, and `clearideas.chat.updated` with the chat ID;
// - saves both sides of each turn to the chat, so the conversation can be restored and continued.
//
// A real server connects the same socket to a provider (for example xAI's realtime API) and
// forwards events both ways, saving transcripts as they complete.

import { randomBytes, randomUUID } from 'node:crypto'

import { serverMessage } from './i18n.ts'
import type { Chat, MemoryStore } from './store.ts'
import { pcmToneChunks } from './voice-audio.ts'
import type { WebSocketConnection } from './websocket.ts'

export const REALTIME_PROTOCOL = 'clearideas-test-realtime.v1'
export const REALTIME_SAMPLE_RATE = 24_000
/** Seconds of visitor audio that count as one spoken message. */
export const TURN_SECONDS = 2
const TOKEN_TTL_MS = 60_000
const MAX_PENDING = 1000
const MAX_TURNS = 50

/** What a relay token stands for: who may connect, and to which chat. */
export interface RelayGrant {
  realtimeSessionId: string
  siteId: string
  visitorId: string
  userId: string | null
  chatId: string | null
  language: string
  /** Spoken first in a new chat. */
  greeting: string | null
  expiresAt: number
}

/** One-time relay tokens, issued by the session endpoint and used by the WebSocket upgrade. */
export class RelayGrants {
  private grants = new Map<string, RelayGrant>()

  issue(grant: Omit<RelayGrant, 'realtimeSessionId' | 'expiresAt'>): {
    token: string
    grant: RelayGrant
  } {
    const token = randomBytes(24).toString('hex')
    const issued = {
      ...grant,
      realtimeSessionId: randomUUID(),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    }
    this.grants.set(token, issued)
    while (this.grants.size > MAX_PENDING) {
      this.grants.delete(this.grants.keys().next().value as string)
    }
    return { token, grant: issued }
  }

  /** Returns the grant once; expired and used tokens give null. */
  redeem(token: string): RelayGrant | null {
    const grant = this.grants.get(token)
    this.grants.delete(token)
    if (!grant || grant.expiresAt < Date.now()) return null
    return grant
  }
}

export interface RelayContext {
  connection: WebSocketConnection
  grant: RelayGrant
  store: MemoryStore
  /** Pause between events, so the widget's states are visible (0 in tests). */
  delayMs: number
}

/** Runs the canned conversation on an accepted relay connection. */
export function runRelay({ connection, grant, store, delayMs }: RelayContext): void {
  const bytesPerTurn = TURN_SECONDS * REALTIME_SAMPLE_RATE * 2
  let received = 0
  let turns = 0
  let responding = false
  let chat: Chat | null = grant.chatId
    ? store.getOwnedChat(grant.chatId, grant.siteId, grant.visitorId, grant.userId)
    : null

  const send = (event: Record<string, unknown>) => connection.send(JSON.stringify(event))
  const pause = () =>
    delayMs > 0 ? new Promise(resolve => setTimeout(resolve, delayMs)) : Promise.resolve()

  /** A spoken response: transcript deltas interleaved with audio, then done. */
  async function speak(text: string): Promise<void> {
    const responseId = `resp_${randomBytes(6).toString('hex')}`
    const itemId = `item_${randomBytes(6).toString('hex')}`
    send({ type: 'response.created', response: { id: responseId } })
    const words = text.split(/(?<=\s)/)
    const audio = pcmToneChunks(0.6, REALTIME_SAMPLE_RATE)
    for (let index = 0; index < Math.max(words.length, audio.length); index += 1) {
      if (!connection.open) return
      if (words[index]) {
        send({
          type: 'response.output_audio_transcript.delta',
          response_id: responseId,
          item_id: itemId,
          delta: words[index],
        })
      }
      if (audio[index]) {
        send({ type: 'response.output_audio.delta', response_id: responseId, delta: audio[index] })
      }
      await pause()
    }
    send({
      type: 'response.output_audio_transcript.done',
      response_id: responseId,
      item_id: itemId,
      transcript: text,
    })
    send({ type: 'response.done', response: { id: responseId } })
  }

  async function turn(): Promise<void> {
    responding = true
    turns += 1
    const itemId = `item_${randomBytes(6).toString('hex')}`
    const transcript = serverMessage('realtimeTranscript', grant.language, { number: turns })
    const reply = serverMessage('realtimeReply', grant.language)
    send({ type: 'input_audio_buffer.speech_started', item_id: itemId })
    await pause()
    send({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: itemId,
      transcript,
    })
    chat ??= store.createChat(grant.siteId, grant.visitorId, grant.greeting, grant.userId)
    store.appendMessage(chat, 'user', transcript)
    await speak(reply)
    if (!connection.open) return
    store.appendMessage(chat, 'assistant', reply)
    send({ type: 'clearideas.chat.updated', chatId: chat.id })
    received = 0 // audio sent while the reply played does not count
    responding = false
  }

  connection.onMessage(text => {
    let event: { type?: unknown; audio?: unknown }
    try {
      event = JSON.parse(text)
    } catch {
      send({ type: 'error', error: { message: 'Invalid JSON event' } })
      return
    }
    if (event.type !== 'input_audio_buffer.append' || typeof event.audio !== 'string') return
    if (responding || turns >= MAX_TURNS) return
    received += Buffer.from(event.audio, 'base64').length
    if (received >= bytesPerTurn) void turn()
  })

  if (grant.greeting && !grant.chatId) {
    responding = true
    void speak(grant.greeting).then(() => {
      responding = false
    })
  }
}
