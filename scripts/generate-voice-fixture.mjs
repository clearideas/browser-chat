#!/usr/bin/env node
// Regenerates server/fixtures/voice-reply.webm, the spoken reply of the test server's recorded-voice
// endpoints: a short two-note tone, recorded by Chromium's MediaRecorder, so it is WebM/Opus exactly
// as browsers produce it (the format the widget plays). The test server has no audio encoder; it
// only splits this file into an initialization segment and clusters for streaming.
//
//   node scripts/generate-voice-fixture.mjs
//
// Uses Playwright's Chromium, or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (scripts/chromium-from-npm.mjs).

import { writeFileSync } from 'node:fs'

import { chromium } from '@playwright/test'

const OUTPUT = new URL('../server/fixtures/voice-reply.webm', import.meta.url)

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
const base64 = await page.evaluate(async () => {
  const context = new AudioContext()
  await context.resume()
  const destination = context.createMediaStreamDestination()
  const gain = context.createGain()
  gain.gain.value = 0
  gain.connect(destination)
  // Two soft notes (E5, then A5) with short fades, 1.2 s in total.
  const start = context.currentTime + 0.1
  for (const [frequency, offset] of [
    [659.25, 0],
    [880, 0.6],
  ]) {
    const oscillator = context.createOscillator()
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    oscillator.start(start + offset)
    oscillator.stop(start + offset + 0.55)
    gain.gain.setValueAtTime(0, start + offset)
    gain.gain.linearRampToValueAtTime(0.3, start + offset + 0.05)
    gain.gain.linearRampToValueAtTime(0, start + offset + 0.55)
  }
  const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' })
  const chunks = []
  recorder.ondataavailable = event => chunks.push(event.data)
  const stopped = new Promise(resolve => (recorder.onstop = resolve))
  recorder.start(200) // several clusters, like a streamed reply
  await new Promise(resolve => setTimeout(resolve, 1400))
  recorder.stop()
  await stopped
  const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
})
await browser.close()

const file = Buffer.from(base64, 'base64')
writeFileSync(OUTPUT, file)
console.log(`Wrote ${file.length} bytes to ${OUTPUT.pathname}`)
