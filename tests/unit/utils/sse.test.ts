import { describe, expect, it } from 'vitest'

import { createSseParser } from '@/utils/sse'

function parse(chunks: string[]): string[] {
  const events: string[] = []
  const parser = createSseParser(data => events.push(data))
  for (const chunk of chunks) parser.push(chunk)
  parser.end()
  return events
}

describe('createSseParser', () => {
  it('parses data lines with and without the optional space', () => {
    expect(parse(['data: {"a":1}\n\ndata:{"b":2}\n\n'])).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('removes only one leading space from a value', () => {
    expect(parse(['data:  two spaces\n\n'])).toEqual([' two spaces'])
  })

  it('joins multi-line data with newlines', () => {
    expect(parse(['data: {\ndata:   "a": 1\ndata: }\n\n'])).toEqual(['{\n  "a": 1\n}'])
  })

  it('accepts CRLF and CR line endings', () => {
    expect(parse(['data: one\r\n\r\ndata: two\r\rdata: three\n\n'])).toEqual([
      'one',
      'two',
      'three',
    ])
  })

  it('handles a CRLF split across chunks without an empty event', () => {
    expect(parse(['data: one\r', '\n\r', '\ndata: two\r\n\r\n'])).toEqual(['one', 'two'])
  })

  it('reassembles lines split across arbitrary chunks', () => {
    const stream = 'data: {"type":"content","content":"héllo"}\n\n: ping\n\ndata: {"x":1}\n\n'
    const chunks = [...stream].map(char => char) // one character per chunk
    expect(parse(chunks)).toEqual(['{"type":"content","content":"héllo"}', '{"x":1}'])
  })

  it('ignores comments, event, id, retry and unknown fields', () => {
    expect(
      parse([': keep-alive\nevent: message\nid: 7\nretry: 1000\nfoo: bar\ndata: x\n\n']),
    ).toEqual(['x'])
  })

  it('does not dispatch an event without data', () => {
    expect(parse(['event: ping\n\n: comment\n\n'])).toEqual([])
  })

  it('delivers a final event that has no closing blank line', () => {
    expect(parse(['data: last'])).toEqual(['last'])
    expect(parse(['data: last\r'])).toEqual(['last'])
  })

  it('treats a field name without a colon as a field with an empty value', () => {
    expect(parse(['data\n\n'])).toEqual([''])
  })
})
