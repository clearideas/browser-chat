// Splits a WebM file into the pieces a recorded-voice stream sends (protocol README §6.3): an
// initialization segment (everything before the first cluster) and one chunk per cluster, which a
// browser can append to a MediaSource in order. Handles the unknown-size segments and clusters that
// browsers' MediaRecorder writes. Not a general WebM parser.

const CLUSTER_ID = 0x1f43b675
const SEGMENT_ID = 0x18538067
/** Elements that may follow a cluster at the segment level; they end an unknown-size cluster. */
const SEGMENT_LEVEL_IDS = new Set([
  CLUSTER_ID,
  0x1c53bb6b, // Cues
  0x1254c367, // Tags
  0x1941a469, // Attachments
  0x1043a770, // Chapters
  0x114d9b74, // SeekHead
  0x1549a966, // Info
  0x1654ae6b, // Tracks
])

interface Element {
  id: number
  /** Offset of the element's data. */
  dataStart: number
  /** Data size in bytes, or null when unknown ("live" WebM). */
  size: number | null
}

/** Reads a variable-length integer; `keepMarker` keeps the length bits (element IDs). */
function readVint(
  bytes: Uint8Array,
  offset: number,
  keepMarker: boolean,
): { value: number; length: number; allOnes: boolean } {
  const first = bytes[offset]
  if (first === undefined || first === 0) throw new Error(`Invalid WebM data at byte ${offset}`)
  let length = 1
  while (!(first & (0x80 >> (length - 1)))) length += 1
  let value = keepMarker ? first : first & (0xff >> length)
  let allOnes = value === 0xff >> length
  for (let index = 1; index < length; index += 1) {
    const byte = bytes[offset + index]
    if (byte === undefined) throw new Error('Truncated WebM data')
    value = value * 256 + byte
    if (byte !== 0xff) allOnes = false
  }
  return { value, length, allOnes }
}

function readElement(bytes: Uint8Array, offset: number): Element {
  const id = readVint(bytes, offset, true)
  const size = readVint(bytes, offset + id.length, false)
  return {
    id: id.value,
    dataStart: offset + id.length + size.length,
    size: size.allOnes ? null : size.value,
  }
}

/** End of an unknown-size cluster: the next segment-level element, or the end of the data. */
function unknownClusterEnd(bytes: Uint8Array, dataStart: number): number {
  let offset = dataStart
  while (offset < bytes.length) {
    const child = readElement(bytes, offset)
    if (SEGMENT_LEVEL_IDS.has(child.id)) return offset
    if (child.size === null) throw new Error('Nested unknown-size element in a WebM cluster')
    offset = child.dataStart + child.size
  }
  return bytes.length
}

export interface WebmParts {
  initSegment: Uint8Array
  clusters: Uint8Array[]
}

export function splitWebm(bytes: Uint8Array): WebmParts {
  const header = readElement(bytes, 0)
  if (header.id !== 0x1a45dfa3 || header.size === null) throw new Error('Not a WebM file')
  const segment = readElement(bytes, header.dataStart + header.size)
  if (segment.id !== SEGMENT_ID) throw new Error('WebM segment not found')
  const segmentEnd = segment.size === null ? bytes.length : segment.dataStart + segment.size

  const clusters: Uint8Array[] = []
  let firstCluster: number | null = null
  let offset = segment.dataStart
  while (offset < segmentEnd) {
    const element = readElement(bytes, offset)
    const end =
      element.size !== null
        ? element.dataStart + element.size
        : element.id === CLUSTER_ID
          ? unknownClusterEnd(bytes, element.dataStart)
          : segmentEnd
    if (element.id === CLUSTER_ID) {
      firstCluster ??= offset
      clusters.push(bytes.subarray(offset, end))
    }
    offset = end
  }
  if (firstCluster === null) throw new Error('WebM file has no clusters')
  return { initSegment: bytes.subarray(0, firstCluster), clusters }
}
