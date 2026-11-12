// Keeps test output meaningful:
// - console.log/info/debug chatter from the widget is silenced;
// - console.warn/error fail the test unless the test declared them with expectConsole().
//
// A test that exercises an error path declares the log it expects:
//
//   expectConsole('error', /Request failed/)
//
// The test then also fails if that log never happens, so error paths are verified, not just
// tolerated. Install with installConsoleGuard() in a setup file.

import { format } from 'node:util'

import { afterEach, beforeEach, vi } from 'vitest'

type Level = 'warn' | 'error'

interface Expectation {
  level: Level
  pattern: RegExp
  seen: boolean
}

let expectations: Expectation[] = []
let recorded: Array<{ level: Level; message: string }> = []

/** Declares a console.warn/console.error call the current test is expected to produce. */
export function expectConsole(level: Level, pattern: RegExp): void {
  expectations.push({ level, pattern, seen: false })
}

export function installConsoleGuard(): void {
  // Some modules log when they are imported, before any test hook runs.
  vi.spyOn(console, 'log').mockImplementation(() => {})

  beforeEach(() => {
    expectations = []
    recorded = []
    for (const method of ['log', 'info', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation(() => {})
    }
    for (const level of ['warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        recorded.push({ level, message: format(...args) })
      })
    }
  })

  afterEach(() => {
    const unexpected = recorded.filter(entry => {
      const match = expectations.find(
        expectation => expectation.level === entry.level && expectation.pattern.test(entry.message),
      )
      if (match) match.seen = true
      return !match
    })
    const missing = expectations.filter(expectation => !expectation.seen)
    expectations = []
    recorded = []

    const problems = [
      ...unexpected.map(entry => `unexpected console.${entry.level}: ${firstLines(entry.message)}`),
      ...missing.map(
        expectation => `expected console.${expectation.level} matching ${expectation.pattern}`,
      ),
    ]
    if (problems.length > 0) throw new Error(problems.join('\n'))
  })
}

function firstLines(message: string): string {
  return message.split('\n').slice(0, 3).join('\n    ')
}
