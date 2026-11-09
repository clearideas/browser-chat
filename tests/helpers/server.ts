import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

import { handlers, resetHandlers } from './handlers'

// Setup MSW server with handlers
export const server = setupServer(...handlers)

// Start server before all tests
beforeAll(() => {
  server.listen({
    onUnhandledFrame: 'error',
  })
})

// Reset handlers before each test
beforeEach(() => {
  resetHandlers()
  server.resetHandlers(...handlers)
})

// Clean up after each test to prevent hanging
afterEach(() => {
  server.resetHandlers()
})

// Clean up after all tests
afterAll(() => {
  server.close()
})
