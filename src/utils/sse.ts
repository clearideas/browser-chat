// Incremental Server-Sent Events parser (WHATWG HTML "event stream interpretation").
//
// Accepts `data:` with or without a space, multi-line `data:` fields, comments, the `event:`,
// `id:` and `retry:` fields (ignored by this protocol), and LF, CRLF or CR line endings, including
// a CRLF split across network chunks. Each complete event's data is passed to `onData`.

export interface SseParser {
  /** Feeds decoded text; may contain any part of one or more lines. */
  push(text: string): void
  /** Ends the stream. Data of a final event without a closing blank line is still delivered. */
  end(): void
}

export function createSseParser(onData: (data: string) => void): SseParser {
  let buffer = ''
  let dataLines: string[] = []

  function dispatch() {
    if (dataLines.length > 0) onData(dataLines.join('\n'))
    dataLines = []
  }

  function processLine(line: string) {
    if (line === '') {
      dispatch()
      return
    }
    if (line.startsWith(':')) return // comment (keep-alive)
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') dataLines.push(value)
    // `event`, `id` and `retry` carry nothing this protocol uses; unknown fields are ignored.
  }

  function drain(final: boolean) {
    let start = 0
    for (let index = 0; index < buffer.length; index += 1) {
      const char = buffer[index]
      if (char !== '\n' && char !== '\r') continue
      // A CR at the very end may be the first half of a CRLF split across chunks.
      if (char === '\r' && index === buffer.length - 1 && !final) break
      processLine(buffer.slice(start, index))
      if (char === '\r' && buffer[index + 1] === '\n') index += 1
      start = index + 1
    }
    buffer = buffer.slice(start)
  }

  return {
    push(text: string) {
      buffer += text
      drain(false)
    },
    end() {
      drain(true)
      if (buffer) processLine(buffer)
      buffer = ''
      dispatch()
    },
  }
}
