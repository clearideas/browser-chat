import { expect, type Page, test } from '@playwright/test'

import { axeViolations } from './helpers/axe'
import { API_URL } from './helpers/ports'

// Voice against the test server in Chromium with a fake microphone (a tone; see
// playwright.config.ts): realtime voice over the WebSocket relay and recorded voice, including
// the reply audio actually playing. The relay treats every TURN_SECONDS (2 s) of microphone audio
// as one spoken message (server/realtime.ts).

const VOICE_SITE = '/dev.html?key=voice-public-key'
const RECORDED_SITE = '/dev.html?key=recorded-voice-public-key'
const REPLY = 'This is a canned spoken reply from the test server.'

/** Records what audio elements do, so a test can tell that reply audio really played. */
async function recordAudioPlayback(page: Page) {
  await page.addInitScript(() => {
    const events: string[] = []
    ;(window as any).__audioEvents = events
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!(this as any).__recorded) {
        ;(this as any).__recorded = true
        for (const type of ['playing', 'ended', 'error']) {
          this.addEventListener(type, () => events.push(`${type} ${this.duration}`))
        }
      }
      return play.call(this)
    }
  })
}

const audioEvents = (page: Page) => page.evaluate(() => (window as any).__audioEvents as string[])

/** Console errors and warnings, except the browser's ScriptProcessorNode deprecation notice. */
function collectProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', message => {
    if (message.type() !== 'error' && message.type() !== 'warning') return
    if (message.text().includes('ScriptProcessorNode is deprecated')) return
    problems.push(message.text())
  })
  page.on('pageerror', error => problems.push(error.message))
  return problems
}

async function openChat(page: Page, url: string) {
  await page.goto(url)
  await page.locator('.ci-widget-fab').click()
  await page.locator('.ci-widget-action--chat').click()
  await expect(page.locator('.ci-widget-panel textarea')).toBeVisible()
}

const startVoice = (page: Page) =>
  page.getByRole('button', { name: 'Start live voice conversation' }).click()

const voiceView = (page: Page) => page.getByRole('region', { name: 'Live voice conversation' })
const voiceStatus = (page: Page) => page.locator('.realtime-voice__state strong')
const chatTexts = (page: Page) => page.locator('.ci-widget-message__text')

test.describe('realtime voice', () => {
  test('talks over the relay and saves the conversation, which text chat continues', async ({
    page,
  }) => {
    const problems = collectProblems(page)
    await openChat(page, VOICE_SITE)
    await startVoice(page)

    await expect(voiceView(page)).toBeVisible()
    await expect(voiceStatus(page)).toHaveText('Listening')
    // After two seconds of microphone audio the relay answers; the caption shows the reply.
    await expect(page.locator('.realtime-voice__caption')).toHaveText(REPLY, { timeout: 10_000 })

    await page.getByRole('button', { name: 'End', exact: true }).click()
    await expect(voiceView(page)).toHaveCount(0)
    await expect(chatTexts(page).filter({ hasText: 'Spoken message 1' })).toHaveCount(1)
    await expect(chatTexts(page).filter({ hasText: REPLY }).first()).toBeVisible()

    // The chat continues in text, and the server restores it after a reload.
    const input = page.locator('.ci-widget-panel textarea')
    await input.fill('typed after speaking')
    await input.press('Enter')
    await expect(chatTexts(page).last()).toHaveText('You said: typed after speaking')
    await page.reload()
    await page.locator('.ci-widget-fab').click()
    await page.locator('.ci-widget-action--chat').click()
    await expect(chatTexts(page).filter({ hasText: 'Spoken message 1' })).toHaveCount(1)
    await expect(chatTexts(page).last()).toHaveText('You said: typed after speaking')
    expect(problems).toEqual([])
  })

  test('mute stops sending audio; unmute resumes', async ({ page }) => {
    await openChat(page, VOICE_SITE)
    await startVoice(page)
    await expect(voiceStatus(page)).toHaveText('Listening')

    const mute = page.getByRole('button', { name: 'Mute' })
    await mute.click()
    const unmute = page.getByRole('button', { name: 'Unmute' })
    await expect(unmute).toHaveAttribute('aria-pressed', 'true')
    await expect(voiceStatus(page)).toHaveText('Microphone muted')
    await page.waitForTimeout(3000) // longer than one turn of audio: nothing may be sent
    await expect(page.locator('.realtime-voice__caption')).not.toHaveText(REPLY)

    await unmute.click()
    await expect(page.getByRole('button', { name: 'Mute' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(page.locator('.realtime-voice__caption')).toHaveText(REPLY, { timeout: 10_000 })
    await page.getByRole('button', { name: 'End', exact: true }).click()
    await expect(chatTexts(page).filter({ hasText: 'Spoken message 1' })).toHaveCount(1)
  })

  test('offers recorded voice when the realtime session fails', async ({ page }) => {
    await page.route(`${API_URL}/public/chat/realtime/session`, route =>
      route.fulfill({ status: 500, json: { message: 'Realtime voice failed' } }),
    )
    await openChat(page, VOICE_SITE)
    await startVoice(page)
    await expect(voiceStatus(page)).toHaveText('Could not connect')
    await page.getByRole('button', { name: 'Use recorded voice instead' }).click()
    await expect(page.getByRole('button', { name: 'Send recording' })).toBeVisible()
  })
})

test.describe('recorded voice', () => {
  test('records, sends, shows transcript and reply, and plays the reply audio', async ({
    page,
  }) => {
    const problems = collectProblems(page)
    await recordAudioPlayback(page)
    await openChat(page, RECORDED_SITE)
    await startVoice(page)

    // This site has no realtime voice (403), so recording starts at once.
    await expect(voiceView(page)).toHaveCount(0)
    const send = page.getByRole('button', { name: 'Send recording' })
    await expect(send).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel recording' })).toBeVisible()
    await page.waitForTimeout(1000)
    await send.click()

    await expect(chatTexts(page).filter({ hasText: /^Voice message \(\d+ KB\)$/ })).toHaveCount(1)
    await expect(chatTexts(page).last()).toHaveText(
      'I received your voice message. This test server does not recognize speech, so this reply is canned.',
    )
    // The streamed WebM/Opus reply plays to its end (about 1.4 s), then can be replayed.
    await expect
      .poll(() => audioEvents(page), { timeout: 10_000 })
      .toContainEqual(expect.stringMatching(/^ended 1\.\d+$/))
    const play = page.getByRole('button', { name: 'Play audio' })
    await expect(play).toBeVisible()
    await play.click()
    await expect
      .poll(
        async () => (await audioEvents(page)).filter(event => event.startsWith('ended')).length,
        {
          timeout: 10_000,
        },
      )
      .toBeGreaterThanOrEqual(2)
    // The 403 for realtime voice is the only failed request.
    expect(problems.filter(problem => !problem.includes('403'))).toEqual([])
  })

  test('cancelling a recording sends nothing', async ({ page }) => {
    const voiceRequests: string[] = []
    page.on('request', request => {
      if (request.url().includes('/public/chat/voice')) voiceRequests.push(request.url())
    })
    await openChat(page, RECORDED_SITE)
    await startVoice(page)
    await page.getByRole('button', { name: 'Cancel recording' }).click()
    await expect(page.locator('.ci-widget-panel textarea')).toBeVisible()
    await page.waitForTimeout(500)
    expect(voiceRequests).toEqual([])
  })
})

test.describe('microphone problems', () => {
  for (const [name, message] of [
    [
      'NotAllowedError',
      'Microphone access was denied. Allow it in your browser to use voice chat.',
    ],
    ['NotFoundError', 'No microphone was found. Connect one to use voice chat.'],
  ]) {
    test(`explains a ${name}`, async ({ page }) => {
      await page.addInitScript(errorName => {
        navigator.mediaDevices.getUserMedia = () =>
          Promise.reject(new DOMException('Microphone unavailable', errorName))
      }, name)
      await openChat(page, VOICE_SITE)
      await startVoice(page)
      await expect(page.getByRole('alert')).toHaveText(message)
      // Recording needs the microphone too, so it is not offered.
      await expect(page.getByRole('button', { name: 'Use recorded voice instead' })).toHaveCount(0)
    })
  }
})

test.describe('voice in other languages, and accessibility', () => {
  /** Visible strings and accessible names inside the widget. */
  const widgetStrings = (page: Page) =>
    page.evaluate(() => {
      const shadow = document.querySelector('[data-clearideas-widget-host]')!.shadowRoot!
      const strings: string[] = []
      const walker = document.createTreeWalker(shadow, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim()
        if (text && !node.parentElement?.closest('style')) strings.push(text)
      }
      for (const element of shadow.querySelectorAll(
        '[aria-label], [data-tooltip], [placeholder]',
      )) {
        for (const name of ['aria-label', 'data-tooltip', 'placeholder']) {
          const value = element.getAttribute(name)
          if (value) strings.push(value)
        }
      }
      return strings
    })

  // English voice strings that must not appear in the French voice screens.
  const ENGLISH = [
    'Live voice conversation',
    'Live',
    'Listening',
    'Just start speaking',
    'Mute',
    'Unmute',
    'End',
    'Cancel recording',
    'Send recording',
    'Spoken message 1',
    REPLY,
  ]

  test('the voice screens are in French for a French page', async ({ page }) => {
    await openChat(page, `${VOICE_SITE}&lang=fr`)
    await page.getByRole('button', { name: 'Démarrer une conversation vocale en direct' }).click()
    await expect(page.getByRole('region', { name: 'Conversation vocale en direct' })).toBeVisible()
    await expect(voiceStatus(page)).toHaveText('Écoute')
    await expect(page.locator('.realtime-voice__caption')).toHaveText(
      'Ceci est une réponse parlée préenregistrée du serveur de test.',
      { timeout: 10_000 },
    )
    const live = await widgetStrings(page)
    expect(live).toEqual(expect.arrayContaining(['Couper le micro', 'Terminer', 'En direct']))
    expect(live.filter(text => ENGLISH.includes(text))).toEqual([])
    await page.getByRole('button', { name: 'Terminer' }).click()
    await expect(chatTexts(page).filter({ hasText: 'Message parlé 1' })).toHaveCount(1)

    await openChat(page, `${RECORDED_SITE}&lang=fr`)
    await page.getByRole('button', { name: 'Démarrer une conversation vocale en direct' }).click()
    await expect(page.getByRole('button', { name: "Envoyer l'enregistrement" })).toBeVisible()
    const recording = await widgetStrings(page)
    expect(recording).toContain("Annuler l'enregistrement")
    expect(recording.filter(text => ENGLISH.includes(text))).toEqual([])
  })

  test('the live voice screen and the recording controls pass axe checks', async ({ page }) => {
    await openChat(page, VOICE_SITE)
    await startVoice(page)
    await expect(voiceStatus(page)).toHaveText('Listening')
    expect(await axeViolations(page)).toEqual([])
    await page.getByRole('button', { name: 'End', exact: true }).click()

    await openChat(page, RECORDED_SITE)
    await startVoice(page)
    await expect(page.getByRole('button', { name: 'Send recording' })).toBeVisible()
    // The previous voice view remains in the DOM during Vue's leave transition.
    // Audit the settled recording UI, rather than its temporarily faded sibling.
    await expect(voiceView(page)).toBeHidden()
    expect(await axeViolations(page)).toEqual([])
  })
})
