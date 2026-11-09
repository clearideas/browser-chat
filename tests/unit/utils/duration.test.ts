import { describe, expect, it } from 'vitest'

import { formatDuration } from '@/utils/duration'

describe('formatDuration', () => {
  it('formats zero seconds correctly', () => {
    expect(formatDuration(0)).toBe('00:00')
  })

  it('formats seconds less than 60', () => {
    expect(formatDuration(5)).toBe('00:05')
    expect(formatDuration(30)).toBe('00:30')
    expect(formatDuration(59)).toBe('00:59')
  })

  it('formats minutes correctly', () => {
    expect(formatDuration(60)).toBe('01:00')
    expect(formatDuration(125)).toBe('02:05')
    expect(formatDuration(3661)).toBe('61:01')
  })

  it('handles large durations', () => {
    expect(formatDuration(3600)).toBe('60:00')
    expect(formatDuration(7200)).toBe('120:00')
  })

  it('pads single digit minutes and seconds', () => {
    expect(formatDuration(61)).toBe('01:01')
    expect(formatDuration(366)).toBe('06:06')
  })
})
