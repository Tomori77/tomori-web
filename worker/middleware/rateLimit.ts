import type { Context, Next } from 'hono'
import type { AppContext } from '../types'

type Entry = { count: number; resetAt: number }

const buckets = new Map<string, Entry>()

function clientKey(c: Context<AppContext>) {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0].trim() || 'unknown'
}

export function rateLimit(options: { limit: number; windowMs: number }) {
  return async (c: Context<AppContext>, next: Next) => {
    const now = Date.now()
    const key = `${c.req.path}:${clientKey(c)}`
    const current = buckets.get(key)
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : current

    entry.count += 1
    buckets.set(key, entry)

    if (buckets.size > 1000) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey)
      }
    }

    if (entry.count > options.limit) {
      const response = c.json({ error: 'Too many requests' }, 429)
      response.headers.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return response
    }

    await next()
  }
}
