/**
 * Simple in-process rate limiter.
 *
 * Works for single-instance deployments (dev, single-node VPS).
 * For multi-instance / Vercel Edge deployments, replace with Upstash Redis:
 *   @upstash/ratelimit + @upstash/redis
 *
 * Usage:
 *   const allowed = rateLimit(`check-email:${ip}`, { limit: 10, windowMs: 60_000 })
 *   if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
 */

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

// Periodically purge expired buckets to prevent memory growth
const PURGE_INTERVAL_MS = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of store) {
    if (now > bucket.resetAt) store.delete(key)
  }
}, PURGE_INTERVAL_MS)

export interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  limit: number
  /** Window duration in milliseconds */
  windowMs: number
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key  Unique identifier (e.g. `"check-email:1.2.3.4"`)
 */
export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): boolean {
  const now = Date.now()
  const bucket = store.get(key)

  if (!bucket || now > bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) return false

  bucket.count++
  return true
}

/** Extract the best available IP from a Next.js request */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}
