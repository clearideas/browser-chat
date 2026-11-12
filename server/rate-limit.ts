// Fixed-window rate limiter (protocol README §9).
//
// In-memory, so limits are per process. A real deployment with several instances needs a shared
// store (for example Redis) so visitors cannot spread requests across instances.

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Seconds until the window resets. */
  resetSeconds: number
}

export class FixedWindowRateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>()
  private limit: number
  private windowMs: number

  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }

  /** Counts one request for `key` and reports whether it is allowed. */
  hit(key: string, now = Date.now()): RateLimitResult {
    let window = this.windows.get(key)
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs }
      this.windows.set(key, window)
      this.prune(now)
    }
    window.count += 1
    return {
      allowed: window.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - window.count),
      resetSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    }
  }

  /** Reports the current state for `key` without counting a request. */
  peek(key: string, now = Date.now()): RateLimitResult {
    const window = this.windows.get(key)
    const count = window && window.resetAt > now ? window.count : 0
    const resetAt = window && window.resetAt > now ? window.resetAt : now + this.windowMs
    return {
      allowed: count < this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - count),
      resetSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    }
  }

  private prune(now: number): void {
    if (this.windows.size < 10_000) return
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(result.resetSeconds),
  }
  if (!result.allowed) headers['Retry-After'] = String(result.resetSeconds)
  return headers
}
