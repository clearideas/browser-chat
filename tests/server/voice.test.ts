// The test server's voice profiles: recorded voice (protocol README §6.3) and realtime voice over
// the WebSocket relay (§12.1).

import { readFileSync } from 'node:fs'
import { request } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  REALTIME_PROTOCOL,
  REALTIME_SAMPLE_RATE,
  recordedReplyAudio,
  splitWebm,
  TURN_SECONDS,
} from '../../server/index.ts'
import { loadProtocolSchema, validate } from '../conformance/helpers/schema.ts'
import { readEventStream } from '../conformance/helpers/sse.ts'
import {
  expectErrorBody,
  startTarget,
  type Target,
  Visitor,
} from '../conformance/helpers/target.ts'

const eventSchema = loadProtocolSchema('stream-events.schema.json')
const FIXTURE = readFileSync(new URL('../../server/fixtures/voice-reply.webm', import.meta.url))
// A recording as the widget sends it (any base64 audio: this server does not decode it).
const RECORDING = FIXTURE.toString('base64')

let target: Target

beforeAll(async () => {
  target = await startTarget()
})

afterAll(async () => {
  await target.close()
})

const voiceVisitor = (options: { language?: string; accessKey?: string } = {}) =>
  new Visitor(target, { accessKey: 'voice-public-key', ...options })

async function postVoice(visitor: Visitor, path: string, body: unknown) {
  return visitor.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  })
}

describe('reply audio fixture', () => {
  it('splits into an initialization segment and clusters that add up to the file', () => {
    const { initSegment, clusters } = splitWebm(new Uint8Array(FIXTURE))
    expect([...initSegment.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]) // EBML header
    expect(clusters.length).toBeGreaterThan(1)
    for (const cluster of clusters) {
      expect([...cluster.subarray(0, 4)]).toEqual([0x1f, 0x43, 0xb6, 0x75]) // Cluster
    }
    expect(Buffer.concat([initSegment, ...clusters]).equals(FIXTURE)).toBe(true)
  })

  it('rejects data that is not WebM', () => {
    expect(() => splitWebm(new Uint8Array([1, 2, 3, 4]))).toThrow()
  })
})

describe('recorded voice', () => {
  it('advertises voice only for voice sites', async () => {
    expect((await (await voiceVisitor().init()).json()).voiceEnabled).toBe(true)
    expect((await (await new Visitor(target).init()).json()).voiceEnabled).toBeUndefined()
  })

  it('streams transcript, reply text, audio chunks, audio and done, in protocol order', async () => {
    const visitor = voiceVisitor()
    await visitor.init()
    const response = await postVoice(visitor, '/public/chat/voice/stream', {
      audio: RECORDING,
      format: 'webm',
    })
    expect(response.status).toBe(200)
    const { events } = await readEventStream(response)
    for (const event of events) expect(validate(eventSchema, event), event.type).toEqual([])

    const types = events.map(event => event.type)
    expect(types[0]).toBe('info')
    expect(types[1]).toBe('transcript')
    expect(types.at(-2)).toBe('audio')
    expect(types.at(-1)).toBe('done')
    const finalized = types.indexOf('message_finalized')
    const firstChunk = types.indexOf('audioChunk')
    expect(finalized).toBeGreaterThan(1)
    expect(firstChunk).toBeGreaterThan(finalized)

    const transcript = events[1].transcript
    expect(transcript).toMatch(/^Voice message \(\d+ KB\)$/)
    const chunks = events.filter(event => event.type === 'audioChunk')
    expect(chunks[0].isInitSegment).toBe(true)
    expect(chunks.slice(1).every(chunk => chunk.isInitSegment === false)).toBe(true)
    expect(chunks.map(chunk => chunk.audioChunkIndex)).toEqual(chunks.map((_, index) => index))
    const joined = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.audioChunk, 'base64')))
    const done = events.at(-1)!
    expect(joined.equals(Buffer.from(done.audio, 'base64'))).toBe(true)
    expect(done).toMatchObject({ transcript, response: recordedReplyText() })
    expect(done.audio).toBe(recordedReplyAudio().audio)

    // The conversation is stored like a text chat: restored on activation, continued by ID.
    const restored = await (await visitor.activate()).json()
    expect(restored.existingChat.chatId).toBe(done.chatId)
    const contents = restored.existingChat.messages.map((message: any) => message.content)
    expect(contents).toContain(transcript)
    expect(contents).toContain(recordedReplyText())
    const next = await postVoice(visitor, `/public/chat/voice/${done.chatId}/stream`, {
      audio: RECORDING,
    })
    const continued = await readEventStream(next)
    expect(continued.events[0]).toMatchObject({ type: 'info', chatId: done.chatId })
  })

  it('answers the non-streaming endpoint with the documented shape', async () => {
    const visitor = voiceVisitor()
    await visitor.init()
    const response = await postVoice(visitor, '/public/chat/voice', { audio: RECORDING })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['audio', 'chatId', 'response', 'transcript'])
  })

  it('localizes the transcript and reply', async () => {
    const visitor = voiceVisitor({ language: 'fr' })
    await visitor.init()
    const { events } = await readEventStream(
      await postVoice(visitor, '/public/chat/voice/stream', { audio: RECORDING }),
    )
    expect(events[1].transcript).toMatch(/^Message vocal \(\d+\u00a0Ko\)$/)
    expect(events.at(-1)!.response).toMatch(/^J'ai bien reçu votre message vocal/)
  })

  it.each([
    ['no audio', {}],
    ['empty audio', { audio: '' }],
    ['audio that is not base64', { audio: 'not base64!' }],
    ['an unknown format', { audio: RECORDING, format: 'flac' }],
  ])('rejects %s with 400', async (_, body) => {
    const visitor = voiceVisitor()
    await visitor.init()
    const response = await postVoice(visitor, '/public/chat/voice/stream', body)
    expect(response.status).toBe(400)
    await expectErrorBody(response)
  })

  it("returns 404 for another visitor's chat", async () => {
    const owner = voiceVisitor()
    await owner.init()
    const { events } = await readEventStream(
      await postVoice(owner, '/public/chat/voice/stream', { audio: RECORDING }),
    )
    const stranger = voiceVisitor()
    await stranger.init()
    const response = await postVoice(stranger, `/public/chat/voice/${events[0].chatId}/stream`, {
      audio: RECORDING,
    })
    expect(response.status).toBe(404)
  })

  it('is refused for sites without voice', async () => {
    const visitor = new Visitor(target)
    await visitor.init()
    const response = await postVoice(visitor, '/public/chat/voice/stream', { audio: RECORDING })
    expect(response.status).toBe(403)
  })
})

function recordedReplyText() {
  return 'I received your voice message. This test server does not recognize speech, so this reply is canned.'
}

// ---------------------------------------------------------------------------------------------
// Realtime voice over the WebSocket relay
// ---------------------------------------------------------------------------------------------

async function createRealtimeSession(visitor: Visitor, body: Record<string, unknown> = {}) {
  return visitor.request('/public/chat/realtime/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: 'en', ...body }),
  })
}

/** A relay connection that collects events and can wait for one. */
async function openRelay(session: { websocketPath: string; websocketProtocol: string }) {
  const socket = new WebSocket(`${target.baseUrl.replace(/^http/, 'ws')}${session.websocketPath}`, [
    session.websocketProtocol,
  ])
  const events: any[] = []
  const waiters: { type: string; resolve: (event: any) => void }[] = []
  socket.addEventListener('message', message => {
    const event = JSON.parse(String(message.data))
    events.push(event)
    for (const waiter of [...waiters]) {
      if (waiter.type === event.type) {
        waiters.splice(waiters.indexOf(waiter), 1)
        waiter.resolve(event)
      }
    }
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  return {
    socket,
    events,
    next(type: string, after = 0): Promise<any> {
      const existing = events.slice(after).find(event => event.type === type)
      if (existing) return Promise.resolve(existing)
      return new Promise(resolve => waiters.push({ type, resolve }))
    },
    /** Sends `seconds` of silence as the widget sends microphone audio. */
    speak(seconds: number) {
      const chunk = Buffer.alloc(4096).toString('base64') // 2048 samples of PCM16 silence
      const chunks = Math.ceil((seconds * REALTIME_SAMPLE_RATE * 2) / 4096)
      for (let index = 0; index < chunks; index += 1) {
        socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: chunk }))
      }
    },
  }
}

/** Attempts an upgrade with raw headers; resolves to the HTTP status (101 when accepted). */
function rawUpgrade(path: string, headers: Record<string, string>): Promise<number> {
  const url = new URL(path, target.baseUrl)
  return new Promise((resolve, reject) => {
    const req = request({
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.alloc(16, 1).toString('base64'),
        ...headers,
      },
    })
    req.on('upgrade', (response, socket) => {
      socket.destroy()
      resolve(response.statusCode ?? 0)
    })
    req.on('response', response => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })
}

describe('realtime voice relay', () => {
  it('returns a WebSocket session in the documented shape', async () => {
    const visitor = voiceVisitor()
    await visitor.init()
    const response = await createRealtimeSession(visitor)
    expect(response.status).toBe(200)
    const session = await response.json()
    expect(session).toMatchObject({
      provider: 'xai',
      transport: 'websocket',
      websocketProtocol: REALTIME_PROTOCOL,
      sampleRate: REALTIME_SAMPLE_RATE,
    })
    expect(session.realtimeSessionId).toEqual(expect.any(String))
    expect(session.websocketPath).toMatch(/^\/public\/chat\/realtime\/relay\/[0-9a-f]{48}$/)
    expect(session.initialGreeting).toMatch(/^Hi, I'm Ada/)
  })

  it('speaks the greeting, answers each spoken turn and saves the conversation', async () => {
    const visitor = voiceVisitor()
    await visitor.init()
    const session = await (await createRealtimeSession(visitor)).json()
    const relay = await openRelay(session)

    // Greeting: a response whose transcript is the greeting, with audio.
    const greetingDone = await relay.next('response.output_audio_transcript.done')
    expect(greetingDone.transcript).toBe(session.initialGreeting)
    await relay.next('response.done')
    expect(relay.events.some(event => event.type === 'response.output_audio.delta')).toBe(true)

    // One turn per TURN_SECONDS of audio.
    const before = relay.events.length
    relay.speak(TURN_SECONDS)
    const transcript = await relay.next(
      'conversation.item.input_audio_transcription.completed',
      before,
    )
    expect(transcript.transcript).toBe('Spoken message 1')
    const updated = await relay.next('clearideas.chat.updated', before)
    const turn = relay.events.slice(before).map(event => event.type)
    expect(turn[0]).toBe('input_audio_buffer.speech_started')
    expect(turn).toContain('response.created')
    expect(turn).toContain('response.output_audio.delta')
    expect(turn.indexOf('response.done')).toBeLessThan(turn.indexOf('clearideas.chat.updated'))
    const audio = relay.events
      .slice(before)
      .filter(event => event.type === 'response.output_audio.delta')
      .map(event => Buffer.from(event.delta, 'base64'))
    expect(Buffer.concat(audio).length % 2).toBe(0) // PCM16

    relay.socket.close()

    // The spoken turn is in the chat, which text chat can continue.
    const restored = await (await visitor.activate()).json()
    expect(restored.existingChat.chatId).toBe(updated.chatId)
    expect(restored.existingChat.messages.map((message: any) => message.content)).toEqual([
      session.initialGreeting,
      'Spoken message 1',
      'This is a canned spoken reply from the test server.',
    ])
    const { stream } = await visitor.stream('And in writing?', updated.chatId)
    expect(stream!.events[0]).toMatchObject({ type: 'info', chatId: updated.chatId })
  })

  it('continues an existing chat without a greeting', async () => {
    const visitor = voiceVisitor()
    await visitor.init()
    const { stream } = await visitor.stream('typed first')
    const chatId = stream!.events[0].chatId
    const session = await (await createRealtimeSession(visitor, { chatId })).json()
    expect(session.chatId).toBe(chatId)
    expect(session.initialGreeting).toBeUndefined()
    const stranger = voiceVisitor()
    await stranger.init()
    expect((await createRealtimeSession(stranger, { chatId })).status).toBe(404)
  })

  it('accepts each relay token once, only with its subprotocol and an allowed origin', async () => {
    const visitor = voiceVisitor()
    await visitor.init()
    const origin = { Origin: target.origin }
    const protocol = { 'Sec-WebSocket-Protocol': REALTIME_PROTOCOL }

    const badOrigin = await (await createRealtimeSession(visitor)).json()
    expect(
      await rawUpgrade(badOrigin.websocketPath, { ...protocol, Origin: target.disallowedOrigin }),
    ).toBe(403)

    const wrongProtocol = await (await createRealtimeSession(visitor)).json()
    expect(
      await rawUpgrade(wrongProtocol.websocketPath, { ...origin, 'Sec-WebSocket-Protocol': 'x' }),
    ).toBe(400)

    const once = await (await createRealtimeSession(visitor)).json()
    expect(await rawUpgrade(once.websocketPath, { ...origin, ...protocol })).toBe(101)
    expect(await rawUpgrade(once.websocketPath, { ...origin, ...protocol })).toBe(403)

    expect(
      await rawUpgrade(`/public/chat/realtime/relay/${'0'.repeat(48)}`, { ...origin, ...protocol }),
    ).toBe(403)
    expect(await rawUpgrade('/public/chat/init', { ...origin, ...protocol })).toBe(404)
  })

  it('is refused for sites without realtime voice', async () => {
    for (const accessKey of ['recorded-voice-public-key', 'demo-public-key']) {
      const visitor = new Visitor(target, { accessKey })
      await visitor.init()
      const response = await createRealtimeSession(visitor)
      expect(response.status, accessKey).toBe(403)
      await expectErrorBody(response)
    }
  })
})
