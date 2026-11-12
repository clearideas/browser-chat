// Reader for protocol v1 event streams (docs/protocol/README.md §6.1), independent of the widget's
// parser so each checks the other.
//
// Parses per the Server-Sent Events standard (data with or without a space, multi-line data, LF or
// CRLF line endings, comments, event/id/retry fields) and records what a conformance test should
// flag: event data that is not a JSON object, unknown fields, and a final event with no closing
// blank line.

export interface ParsedStream {
  events: Array<Record<string, any>>
  comments: string[]
  violations: string[]
  /** Number of network chunks received (useful for split-frame tests). */
  chunkCount: number
}

const KNOWN_FIELDS = new Set(['data', 'event', 'id', 'retry'])

export async function readEventStream(response: Response): Promise<ParsedStream> {
  const result: ParsedStream = { events: [], comments: [], violations: [], chunkCount: 0 }
  if (!response.body) {
    result.violations.push('response has no body')
    return result
  }

  let dataLines: string[] = []
  const dispatch = () => {
    if (dataLines.length === 0) return
    const data = dataLines.join('\n')
    dataLines = []
    try {
      const event = JSON.parse(data)
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        result.violations.push(`event is not a JSON object: ${data.slice(0, 80)}`)
        return
      }
      result.events.push(event)
    } catch {
      result.violations.push(`event data is not JSON: ${data.slice(0, 80)}`)
    }
  }
  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') return dispatch()
    if (line.startsWith(':')) {
      result.comments.push(line.slice(1).trim())
      return
    }
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (!KNOWN_FIELDS.has(field)) {
      result.violations.push(`unknown field "${field}": ${line.slice(0, 80)}`)
      return
    }
    if (field === 'data') dataLines.push(value)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result.chunkCount += 1
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        processLine(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
      }
    }
  } catch (error) {
    // A dropped connection is a valid outcome for some scenarios; record it for assertions.
    result.violations.push(`stream ended with error: ${(error as Error).message}`)
  }
  buffer += decoder.decode()
  if (buffer) processLine(buffer)
  if (dataLines.length > 0) {
    result.violations.push('final event has no closing blank line')
    dispatch()
  }
  return result
}
