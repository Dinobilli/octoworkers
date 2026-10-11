import type { Context } from 'hono'
import type { AppBindings } from './bindings'
import { developmentBypass } from './admin-identity'
import { hashToken } from './session'
export function rateLimit(opts: { maxRequests: number; windowSeconds: number }) {
  return async (c: Context<{ Bindings: AppBindings }>, next: () => Promise<void>) => {
    if (developmentBypass(c)) { await next(); return }
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds)
    const key = await hashToken(`${c.req.header('cf-connecting-ip') ?? 'local'}:${c.req.path}:${window}`)
    try {
      const row = await c.env.DB.prepare(`INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`)
        .bind(key, (window + 1) * opts.windowSeconds).first<{ count: number }>()
      if (!row) return c.json({ message: 'Rate limiter unavailable' }, 503)
      if (row.count > opts.maxRequests) { c.header('Retry-After', String(opts.windowSeconds)); return c.json({ message: 'Too many requests' }, 429) }
    } catch { return c.json({ message: 'Rate limiter unavailable' }, 503) }
    await next()
  }
}
