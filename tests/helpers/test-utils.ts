import { mount, type VueWrapper } from '@vue/test-utils'

import ClearIdeasWidgetStandalone from '@/ClearIdeasWidgetStandalone.vue'
import type { WidgetProps } from '@/types'

/**
 * Create a wrapper for the ClearIdeasWidgetStandalone component with default props
 */
export function createWidgetWrapper(
  props: Partial<WidgetProps> = {},
): VueWrapper<InstanceType<typeof ClearIdeasWidgetStandalone>> {
  const defaultProps: WidgetProps = {
    accessKey: 'test-access-key',
    apiBaseUrl: 'https://api.clearideas.local',
    openOnLoad: false,
    position: 'bottom-right',
    width: 380,
    height: 540,
    fabHide: false,
    ...props,
  }

  return mount(ClearIdeasWidgetStandalone, {
    props: defaultProps,
    attachTo: document.body,
  })
}

/**
 * Wait for a specified amount of time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait for next tick
 */
export async function nextTick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Wait for element to appear in DOM
 */
export async function waitForElement(selector: string, timeout = 5000): Promise<HTMLElement> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const element = document.querySelector(selector)
    if (element) {
      return element as HTMLElement
    }
    await wait(100)
  }
  throw new Error(`Element ${selector} not found within ${timeout}ms`)
}

/**
 * Create a mock SSE event string
 */
export function createSSEEvent(type: string, data: any): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`
}

/**
 * Create a mock SSE response stream
 */
export function createMockSSEResponse(events: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      events.forEach((event, index) => {
        setTimeout(() => {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(event))
          if (index === events.length - 1) {
            controller.close()
          }
        }, index * 10)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  })
}

/**
 * Get a reader from a response stream
 */
export async function readSSEStream(response: Response): Promise<string[]> {
  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const events: string[] = []
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          events.push(line.slice(6))
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return events
}

/**
 * Wait for component loading to complete and stream processing to finish
 */
export async function waitForStreamComplete(vm: any, timeout: number = 5000): Promise<void> {
  const start = Date.now()
  while (vm.loading && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  // Give a bit more time for stream events to be processed
  await new Promise(resolve => setTimeout(resolve, 200))
}
