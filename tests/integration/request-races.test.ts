// Overlapping configuration and session requests: only the newest may change the widget's state.

import { http, HttpResponse } from 'msw/http'
import { describe, expect, it, vi } from 'vitest'

import { mockInitResponseNewChat } from '../fixtures/api-responses'
import { server } from '../helpers/server'
import { createWidgetWrapper, TEST_API_BASE_URL } from '../helpers/test-utils'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('request races', () => {
  it('ignores a late /init response after the locale changed again', async () => {
    server.use(
      http.get(`${TEST_API_BASE_URL}/public/chat/init`, async ({ request }) => {
        const language = request.headers.get('accept-language')
        if (language === 'fr') await delay(300) // slow French response
        return HttpResponse.json(
          { initialMessage: `greeting-${language}`, chatName: `bot-${language}` },
          { headers: { 'x-clearideas-public-chat-session-id': `session-${language}` } },
        )
      }),
    )
    const wrapper = createWidgetWrapper({ locale: 'en' })
    const vm = wrapper.vm as any
    await vi.waitFor(() => expect(vm.initData?.chatName).toBe('bot-en'))

    vm.setLocale('fr') // starts a slow French load
    await delay(20)
    vm.setLocale('en') // back to English before it finishes
    await delay(450)

    expect(vm.initData.chatName).toBe('bot-en')
    expect(vm.initData.initialMessage).toBe('greeting-en')
    expect(vm.sessionId).toBe('session-en')
    expect(vm.loadingInit).toBe(false)
    wrapper.unmount()
  })

  it('ignores a late /session response from an earlier open', async () => {
    let calls = 0
    server.use(
      http.get(`${TEST_API_BASE_URL}/public/chat/init`, () =>
        HttpResponse.json(mockInitResponseNewChat, {
          headers: { 'x-clearideas-public-chat-session-id': 'session-1' },
        }),
      ),
      http.post(`${TEST_API_BASE_URL}/public/chat/session`, async () => {
        calls += 1
        const call = calls
        if (call === 1) await delay(300) // the first activation is slow
        return HttpResponse.json({
          existingChat: {
            chatId: `chat-from-call-${call}`,
            messages: [{ role: 'assistant', content: `restored by call ${call}` }],
          },
        })
      }),
    )
    const wrapper = createWidgetWrapper()
    const vm = wrapper.vm as any
    await vi.waitFor(() => expect(vm.initData).toBeTruthy())

    const firstOpen = vm.openWidget() // slow activation
    await delay(20)
    vm.closeWidget()
    vm.activatedSessionId = null
    await vm.openWidget() // the visitor opens again; this activation answers first
    await firstOpen
    await delay(350)

    expect(vm.chatId).toBe('chat-from-call-2')
    expect(vm.messages.map((message: { content: string }) => message.content)).toEqual([
      'restored by call 2',
    ])
    wrapper.unmount()
  })
})
