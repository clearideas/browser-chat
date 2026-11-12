// In-memory storage for visitors, sessions and chats.
//
// A real server replaces this with a database (and a shared store if it runs more than one
// instance). The rules it enforces are protocol rules, not storage details:
// - session IDs are unguessable (README §5.1);
// - a chat belongs to exactly one site and visitor (README §5.4), and to the user ID it was started
//   with (README §5.5), so people sharing a browser do not see each other's chats.

import { randomBytes, randomUUID } from 'node:crypto'

export interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export interface Chat {
  id: string
  siteId: string
  visitorId: string
  /** The site's ID for the signed-in user (unverified), or null for anonymous chats. */
  userId: string | null
  messages: StoredMessage[]
  createdAt: Date
  updatedAt: Date
}

interface Session {
  visitorId: string
  lastSeen: number
}

export interface StoreLimits {
  /** Oldest entries are evicted past these sizes, keeping memory bounded. */
  maxVisitors: number
  maxSessions: number
  maxChats: number
  /** Stored messages per chat; older messages are dropped. */
  maxMessagesPerChat: number
}

export const DEFAULT_STORE_LIMITS: StoreLimits = {
  maxVisitors: 10_000,
  maxSessions: 10_000,
  maxChats: 10_000,
  maxMessagesPerChat: 200,
}

/** Who a chat belongs to: site, visitor and user ID. */
function ownerKey(chat: Pick<Chat, 'siteId' | 'visitorId' | 'userId'>): string {
  return JSON.stringify([chat.siteId, chat.visitorId, chat.userId])
}

function setBounded<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key) // re-insert so the entry becomes the newest
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value as K
    map.delete(oldest)
  }
}

export class MemoryStore {
  private limits: StoreLimits
  private visitors = new Map<string, { createdAt: number }>()
  private sessions = new Map<string, Session>()
  private chats = new Map<string, Chat>()
  /** Owner key (site, visitor, user ID) → most recently used chat ID. */
  private latestChatIds = new Map<string, string>()

  constructor(limits: Partial<StoreLimits> = {}) {
    this.limits = { ...DEFAULT_STORE_LIMITS, ...limits }
  }

  createVisitor(): string {
    const visitorId = randomUUID()
    setBounded(this.visitors, visitorId, { createdAt: Date.now() }, this.limits.maxVisitors)
    return visitorId
  }

  hasVisitor(visitorId: string): boolean {
    return this.visitors.has(visitorId)
  }

  /** Session IDs are random UUIDs (122 random bits), as README §5.1 requires. */
  createSession(visitorId: string): string {
    const sessionId = randomUUID()
    setBounded(
      this.sessions,
      sessionId,
      { visitorId, lastSeen: Date.now() },
      this.limits.maxSessions,
    )
    return sessionId
  }

  /** Returns the visitor for a session ID, or null for unknown/evicted sessions. */
  getSessionVisitor(sessionId: string): string | null {
    const session = this.sessions.get(sessionId)
    if (!session || !this.visitors.has(session.visitorId)) return null
    session.lastSeen = Date.now()
    return session.visitorId
  }

  createChat(
    siteId: string,
    visitorId: string,
    greeting: string | null,
    userId: string | null = null,
  ): Chat {
    const now = new Date()
    const chat: Chat = {
      id: randomBytes(12).toString('hex'),
      siteId,
      visitorId,
      userId,
      messages: greeting ? [{ role: 'assistant', content: greeting, createdAt: now }] : [],
      createdAt: now,
      updatedAt: now,
    }
    setBounded(this.chats, chat.id, chat, this.limits.maxChats)
    this.latestChatIds.set(ownerKey(chat), chat.id)
    return chat
  }

  /**
   * Returns the chat only if it belongs to this site, visitor and user ID. Callers answer 404 for
   * null without saying whether the chat exists (README §5.4).
   */
  getOwnedChat(
    chatId: string,
    siteId: string,
    visitorId: string,
    userId: string | null = null,
  ): Chat | null {
    const chat = this.chats.get(chatId)
    if (!chat || chat.siteId !== siteId || chat.visitorId !== visitorId) return null
    if (chat.userId !== userId) return null
    return chat
  }

  getLatestChat(siteId: string, visitorId: string, userId: string | null = null): Chat | null {
    const chatId = this.latestChatIds.get(ownerKey({ siteId, visitorId, userId }))
    if (!chatId) return null
    return this.getOwnedChat(chatId, siteId, visitorId, userId)
  }

  appendMessage(chat: Chat, role: StoredMessage['role'], content: string): StoredMessage {
    const message: StoredMessage = { role, content, createdAt: new Date() }
    chat.messages.push(message)
    if (chat.messages.length > this.limits.maxMessagesPerChat) {
      chat.messages.splice(0, chat.messages.length - this.limits.maxMessagesPerChat)
    }
    chat.updatedAt = message.createdAt
    setBounded(this.chats, chat.id, chat, this.limits.maxChats)
    this.latestChatIds.set(ownerKey(chat), chat.id)
    return message
  }

  /** Removes the last message if it is `message` (used to roll back a failed turn). */
  removeLastMessage(chat: Chat, message: StoredMessage): void {
    if (chat.messages[chat.messages.length - 1] === message) chat.messages.pop()
  }

  deleteChat(chat: Chat): void {
    this.chats.delete(chat.id)
    const key = ownerKey(chat)
    if (this.latestChatIds.get(key) === chat.id) this.latestChatIds.delete(key)
  }

  /** Counts for tests and diagnostics. */
  stats(): { visitors: number; sessions: number; chats: number } {
    return { visitors: this.visitors.size, sessions: this.sessions.size, chats: this.chats.size }
  }
}
