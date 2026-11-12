// Browser storage for the widget, namespaced per server and site.
//
// Keys include a hash of the API base URL and access key, so a session ID or cached configuration
// from one server or site is never sent to, or shown for, another.

export const STORAGE_KEYS = {
  session: 'clearideasPublicChatSessionId',
  initCache: 'clearideasPublicChatInitData',
  helloBubbleShown: 'clearideas_hello_bubble_shown',
  disclaimerDismissed: 'clearideas_disclaimer_dialog_dismissed',
} as const

export type StorageKeyName = keyof typeof STORAGE_KEYS

/**
 * Short, stable namespace for a server, site and signed-in user (FNV-1a; not a security boundary).
 * Each user ID gets its own sessions; without one the namespace is the same as before user IDs.
 */
export function storageNamespace(
  apiUrl: string,
  accessKey: string,
  userId?: string | null,
): string {
  let hash = 0x811c9dc5
  const input = userId ? `${apiUrl}|${accessKey}|${userId}` : `${apiUrl}|${accessKey}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function storageKey(name: StorageKeyName, namespace: string): string {
  return `${STORAGE_KEYS[name]}:${namespace}`
}

/**
 * Returns localStorage or sessionStorage, or null where storage is unavailable (server rendering,
 * sandboxed iframes, or browsers that throw when cookies are blocked).
 */
export function getBrowserStorage(kind: 'local' | 'session'): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readItem(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeItem(storage: Storage | null, key: string, value: string): boolean {
  try {
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch {
    return false // quota exceeded or storage disabled
  }
}

export function removeItem(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // storage disabled
  }
}

/**
 * Widget 0.1.x stored values under un-namespaced keys. Move them into `namespace` once, in the
 * same storage, so existing visitors keep their session. The cached configuration is dropped.
 */
export function migrateLegacyKeys(namespace: string): void {
  for (const storage of [getBrowserStorage('local'), getBrowserStorage('session')]) {
    for (const name of ['session', 'helloBubbleShown', 'disclaimerDismissed'] as const) {
      const legacy = readItem(storage, STORAGE_KEYS[name])
      if (legacy === null) continue
      const key = storageKey(name, namespace)
      if (readItem(storage, key) === null) writeItem(storage, key, legacy)
      removeItem(storage, STORAGE_KEYS[name])
    }
    removeItem(storage, STORAGE_KEYS.initCache)
  }
}
