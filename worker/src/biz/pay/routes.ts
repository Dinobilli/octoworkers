import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { bodyLimit } from 'hono/body-limit'
import type { AppBindings } from '../../com/bindings'
import { currentMember } from '../mbr/service'
import { eventSchema, eventTypes, verifyWebhook, recordEvent, memberOrders } from './service'

export const paymentRoutes = new Hono<{ Bindings: AppBindings }>()
paymentRoutes.use('*', async (c, next) => {
  if (c.env.ENABLE_GROBLE !== 'true') return c.json({ message: 'Payment module disabled' }, 404)
  await next()
})
paymentRoutes.get('/products', async (c) => c.json((await c.env.DB.prepare('SELECT id, name, amount, currency, payment_type FROM products WHERE is_active = 1').all()).results))
paymentRoutes.post('/checkout', zValidator('json', z.object({ productId: z.string().min(1).max(100) })), async (c) => {
  const member = await currentMember(c)
  if (!member) return c.json({ message: '로그인이 필요합니다.' }, 401)
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').bind(c.req.valid('json').productId)
    .first<{ id: string; groble_content_id: string; checkout_url: string; amount: number; currency: string; payment_type: string }>()
  if (!product) return c.json({ message: '상품을 찾을 수 없습니다.' }, 404)
  const url = safeCheckoutUrl(product.checkout_url)
  if (!url || !c.env.GROBLE_WEBHOOK_SECRET) return c.json({ message: '결제가 아직 설정되지 않았습니다.' }, 503)
  const id = `ord_${crypto.randomUUID()}`
  await c.env.DB.prepare('INSERT INTO orders (id, member_id, product_id, groble_content_id, amount, currency, payment_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, member.id, product.id, product.groble_content_id, product.amount, product.currency, product.payment_type, new Date().toISOString()).run()
  url.searchParams.set('ref', id)
  return c.json({ orderId: id, checkoutUrl: url.href }, 201)
})
paymentRoutes.get('/orders', async (c) => {
  const member = await currentMember(c)
  if (!member) return c.json({ message: '로그인이 필요합니다.' }, 401)
  return c.json(await memberOrders(c.env, member.id))
})
export function safeCheckoutUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['groble.im', 'www.groble.im'].includes(url.hostname) && !url.username && !url.password && !url.port && /^\/payment\/[^/]+\/?$/.test(url.pathname) ? url : null
  } catch { return null }
}
const productSchema = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/), name: z.string().min(1).max(150), grobleContentId: z.string().min(1).max(200), checkoutUrl: z.string().refine(v => Boolean(safeCheckoutUrl(v)), 'Use an HTTPS Groble payment URL'), amount: z.number().int().nonnegative(), paymentType: z.enum(['ONE_TIME', 'SUBSCRIPTION']).default('ONE_TIME'), active: z.boolean().default(true) })
export const commerceAdminRoutes = new Hono<{ Bindings: AppBindings }>()
commerceAdminRoutes.use('*', async (c, next) => { if (c.env.ENABLE_GROBLE !== 'true') return c.json({ message: 'Module disabled' }, 404); await next() })
commerceAdminRoutes.get('/products', async c => c.json((await c.env.DB.prepare('SELECT * FROM products ORDER BY name').all()).results))
commerceAdminRoutes.post('/products', zValidator('json', productSchema), async c => {
  const p = c.req.valid('json')
  await c.env.DB.prepare(`INSERT INTO products (id, name, groble_content_id, checkout_url, amount, payment_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, groble_content_id = excluded.groble_content_id, checkout_url = excluded.checkout_url, amount = excluded.amount, payment_type = excluded.payment_type, is_active = excluded.is_active`)
    .bind(p.id, p.name, p.grobleContentId, p.checkoutUrl, p.amount, p.paymentType, Number(p.active)).run()
  return c.json({ ok: true })
})
commerceAdminRoutes.get('/events', async c => c.json((await c.env.DB.prepare('SELECT id, type, seller_reference, merchant_uid, content_id, amount, occurred_at, received_at FROM payment_events ORDER BY received_at DESC LIMIT 100').all()).results))
export const webhookRoutes = new Hono<{ Bindings: AppBindings }>()
webhookRoutes.use('*', bodyLimit({ maxSize: 256 * 1024 }))
webhookRoutes.post('/groble', async c => {
  if (c.env.ENABLE_GROBLE !== 'true') return c.json({ message: 'Module disabled' }, 404)
  if (!c.env.GROBLE_WEBHOOK_SECRET) return c.json({ message: 'Webhook not configured' }, 503)
  const raw = new Uint8Array(await c.req.arrayBuffer())
  if (!(await verifyWebhook(raw, c.req.raw.headers, c.env))) return c.json({ message: 'Invalid webhook signature' }, 401)
  const key = c.req.header('X-Groble-Idempotency-Key')
  if (!key || key.length > 200) return c.json({ message: 'Invalid idempotency key' }, 400)
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) } catch { return c.json({ message: 'Invalid payload' }, 400) }
  const event = eventSchema.safeParse(parsed)
  if (!event.success) return c.json({ message: 'Invalid event schema' }, 400)
  if (!eventTypes.has(event.data.type)) return c.json({ ok: true, ignored: true }, 202)
  const object = event.data.data.object
  if (event.data.type.endsWith('.completed') && (!object.merchantUid || !object.pricing)) return c.json({ message: 'Missing payment fields' }, 400)
  if (event.data.type.endsWith('.refunded') && (!object.merchantUid || !object.refund)) return c.json({ message: 'Missing refund fields' }, 400)
  try { await recordEvent(c.env, event.data, raw, key) } catch (error) {
    if (String(error).includes('event_conflict')) return c.json({ message: 'Conflicting event identity' }, 409)
    return c.json({ message: 'Retry webhook later' }, 503)
  }
  return c.json({ ok: true })
})
