// Protocol v1 conformance: recorded voice profile (docs/protocol/README.md §2, §6.3). Optional: it
// runs against the test server's voice site, or against CHAT_SERVER_URL when CHAT_VOICE_ACCESS_KEY
// names a site with voice enabled. No assumptions about transcripts or reply content.

import { readFileSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadProtocolSchema, validate } from './helpers/schema.ts'
import { readEventStream } from './helpers/sse.ts'
import { IS_EXTERNAL, startTarget, type Target, Visitor } from './helpers/target.ts'

const eventSchema = loadProtocolSchema('stream-events.schema.json')
const VOICE_KEY = IS_EXTERNAL ? process.env.CHAT_VOICE_ACCESS_KEY : 'voice-public-key'
// A short WebM/Opus recording, as the widget uploads it.
const RECORDING = readFileSync(
  new URL('../../server/fixtures/voice-reply.webm', import.meta.url),
).toString('base64')

let target: Target

beforeAll(async () => {
  target = await startTarget()
})

afterAll(async () => {
  await target.close()
})

describe.skipIf(!VOICE_KEY)('Recorded voice (§6.3)', () => {
  it('advertises voice and streams a valid voice reply', async () => {
    const visitor = new Visitor(target, { accessKey: VOICE_KEY })
    const init = await (await visitor.init()).json()
    expect(init.voiceEnabled || init.voice?.enabled).toBe(true)

    const response = await visitor.request('/public/chat/voice/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ audio: RECORDING, format: 'webm' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/)
    const { events } = await readEventStream(response)
    for (const event of events) expect(validate(eventSchema, event), event.type).toEqual([])

    const types = events.map(event => event.type)
    expect(types).toContain('transcript')
    expect(types.at(-1)).toBe('done')
    expect(types.indexOf('transcript')).toBeLessThan(types.indexOf('done'))
    const done = events.at(-1)!
    expect(typeof done.chatId === 'string' || typeof done.id === 'string').toBe(true)

    const chunks = events.filter(event => event.type === 'audioChunk')
    if (chunks.length) {
      expect(chunks[0].isInitSegment).toBe(true)
      const audio = events.find(event => event.type === 'audio')?.audio ?? done.audio
      if (audio) {
        const joined = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.audioChunk, 'base64')))
        expect(joined.equals(Buffer.from(audio, 'base64'))).toBe(true)
      }
    }
  })
})
