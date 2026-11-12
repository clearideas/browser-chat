// Errors shown to visitors. Technical details go to the console; visitors see a localized message.

/** An error message from the server's error body, which the server may have localized. */
export class ServerMessageError extends Error {
  override name = 'ServerMessageError'
  constructor(
    message: string,
    /** HTTP status of the response, when known. */
    readonly status?: number,
  ) {
    super(message)
  }
}

/** HTTP status carried by a request error, if any. */
export function errorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : undefined
}

/** What went wrong with voice input, for choosing the visitor-facing message. */
export type VoiceErrorKind =
  'microphone-denied' | 'microphone-missing' | 'recording-failed' | 'no-audio' | 'unavailable'

/** Classifies a getUserMedia failure; other failures get the fallback kind. */
export function microphoneErrorKind(error: unknown, fallback: VoiceErrorKind): VoiceErrorKind {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'microphone-denied'
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return 'microphone-missing'
  }
  return fallback
}

/** Message key for each kind of voice error. */
export const VOICE_ERROR_KEYS: Record<VoiceErrorKind, string> = {
  'microphone-denied': 'voice.microphoneDenied',
  'microphone-missing': 'voice.microphoneMissing',
  'recording-failed': 'voice.recordingFailed',
  'no-audio': 'voice.noAudio',
  unavailable: 'voice.unavailable',
}
