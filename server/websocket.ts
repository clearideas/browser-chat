// A minimal WebSocket server connection (RFC 6455) on node:net, for the realtime voice relay. Text
// messages only; enough for a test server, with the limits a public endpoint needs (masked client
// frames, a message size cap, close handling). A production server would use a maintained library.

import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

const HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export interface WebSocketConnection {
  send(text: string): void
  close(code?: number, reason?: string): void
  onMessage(listener: (text: string) => void): void
  onClose(listener: () => void): void
  readonly open: boolean
}

/** Answers an upgrade request that cannot be accepted, and closes the socket. */
export function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  const body = JSON.stringify({ message })
  socket.end(
    `HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : 'Bad Request'}\r\n` +
      'Content-Type: application/json; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  )
}

/**
 * Completes the handshake for `protocol` (which the client must request) and returns the
 * connection, or answers 400 and returns null.
 */
export function acceptWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  protocol: string,
  options: { maxMessageBytes: number },
): WebSocketConnection | null {
  const key = req.headers['sec-websocket-key']
  const requested = String(req.headers['sec-websocket-protocol'] ?? '')
    .split(',')
    .map(value => value.trim())
  if (
    typeof key !== 'string' ||
    req.headers['sec-websocket-version'] !== '13' ||
    String(req.headers.upgrade).toLowerCase() !== 'websocket' ||
    !requested.includes(protocol)
  ) {
    rejectUpgrade(socket, 400, 'Invalid WebSocket upgrade')
    return null
  }

  const accept = createHash('sha1')
    .update(key + HANDSHAKE_GUID)
    .digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      `Sec-WebSocket-Protocol: ${protocol}\r\n\r\n`,
  )

  const messageListeners: ((text: string) => void)[] = []
  const closeListeners: (() => void)[] = []
  let open = true
  let buffered: Buffer = head.length ? Buffer.from(head) : Buffer.alloc(0)
  let fragments: Buffer[] = []
  let fragmentBytes = 0

  function writeFrame(opcode: number, payload: Buffer) {
    const length = payload.length
    const header =
      length < 126
        ? Buffer.from([0x80 | opcode, length])
        : length < 65536
          ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 0xff])
          : Buffer.concat([
              Buffer.from([0x80 | opcode, 127]),
              (() => {
                const size = Buffer.alloc(8)
                size.writeBigUInt64BE(BigInt(length))
                return size
              })(),
            ])
    socket.write(Buffer.concat([header, payload]))
  }

  function finish() {
    if (!open) return
    open = false
    closeListeners.forEach(listener => listener())
  }

  function close(code = 1000, reason = '') {
    if (!open) return
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason))
    payload.writeUInt16BE(code)
    payload.write(reason, 2)
    writeFrame(0x8, payload)
    socket.end()
    finish()
  }

  function handleFrame(opcode: number, fin: boolean, payload: Buffer) {
    if (opcode === 0x8) return close(1000)
    if (opcode === 0x9) return writeFrame(0xa, payload) // ping → pong
    if (opcode === 0xa) return // pong
    if (opcode === 0x2) return close(1003, 'Text messages only')
    if (opcode !== 0x1 && opcode !== 0x0) return close(1002, 'Unknown opcode')
    fragmentBytes += payload.length
    if (fragmentBytes > options.maxMessageBytes) return close(1009, 'Message too large')
    fragments.push(payload)
    if (!fin) return
    const text = Buffer.concat(fragments).toString('utf8')
    fragments = []
    fragmentBytes = 0
    messageListeners.forEach(listener => listener(text))
  }

  function parse() {
    while (open && buffered.length >= 2) {
      const fin = (buffered[0] & 0x80) !== 0
      const opcode = buffered[0] & 0x0f
      const masked = (buffered[1] & 0x80) !== 0
      let length = buffered[1] & 0x7f
      let offset = 2
      if (length === 126) {
        if (buffered.length < 4) return
        length = buffered.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (buffered.length < 10) return
        const big = buffered.readBigUInt64BE(2)
        if (big > BigInt(options.maxMessageBytes)) return close(1009, 'Message too large')
        length = Number(big)
        offset = 10
      }
      if (!masked) return close(1002, 'Client frames must be masked')
      if (length > options.maxMessageBytes) return close(1009, 'Message too large')
      if (buffered.length < offset + 4 + length) return
      const mask = buffered.subarray(offset, offset + 4)
      const payload = Buffer.from(buffered.subarray(offset + 4, offset + 4 + length))
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
      buffered = buffered.subarray(offset + 4 + length)
      handleFrame(opcode, fin, payload)
    }
  }

  socket.on('data', (chunk: Buffer) => {
    buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk
    parse()
  })
  socket.on('close', finish)
  socket.on('error', finish)
  if (buffered.length) queueMicrotask(parse)

  return {
    send(text) {
      if (open) writeFrame(0x1, Buffer.from(text, 'utf8'))
    },
    close,
    onMessage(listener) {
      messageListeners.push(listener)
    },
    onClose(listener) {
      closeListeners.push(listener)
    },
    get open() {
      return open
    },
  }
}
