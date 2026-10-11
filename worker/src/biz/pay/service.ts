import { z } from 'zod'
import type { AppBindings } from '../../com/bindings'
import type { MemberOrder, OrderStatus } from '@octoworkers/com'
import { hashToken } from '../../com/session'
export const eventSchema = z.object({
  id: z.string().min(1).max(200), type: z.string().max(100), version: z.string().max(50), occurredAt: z.string().datetime({ offset: true }),
  data: z.object({ object: z.object({
    merchantUid: z.string().max(200).optional(), sellerReference: z.string().max(128).optional(),
    content: z.object({ id: z.string().max(200), paymentType: z.enum(['ONE_TIME', 'SUBSCRIPTION']) }),
    pricing: z.object({ finalAmount: z.number().int().nonnegative(), currency: z.literal('KRW') }).optional(),
    refund: z.object({ amount: z.number().int().nonnegative(), partialRefund: z.boolean(), refundedAt: z.string().datetime({ offset: true }) }).optional(),
    serviceEndsAt: z.string().datetime({ offset: true }).optional(),
    subscription: z.object({ nextBillingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional(),
    termination: z.object({ terminatedAt: z.string().datetime({ offset: true }) }).optional(),
  }) }),
})
export const eventTypes = new Set(['payment.completed', 'payment.cancel_requested', 'payment.refunded', 'subscription_payment.completed', 'subscription_payment.refunded', 'subscription_payment.failed', 'subscription.cancel_requested', 'subscription.terminated'])
export async function verifyWebhook(raw: Uint8Array, headers: Headers, env: AppBindings) {
  const timestamp = headers.get('X-Groble-Timestamp') ?? ''
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const prefix = new TextEncoder().encode(`${timestamp}.`)
  const message = new Uint8Array(prefix.length + raw.length); message.set(prefix); message.set(raw, prefix.length)
  const signatures = [headers.get('X-Groble-Signature'), headers.get('X-Groble-Signature-Previous')].filter((v): v is string => Boolean(v && /^[a-f0-9]{64}$/i.test(v)))
  if (!headers.get('X-Groble-Signature')) return false
  for (const secret of [env.GROBLE_WEBHOOK_SECRET, env.GROBLE_WEBHOOK_SECRET_PREVIOUS].filter((v): v is string => Boolean(v))) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    for (const signature of signatures) {
      const bytes = Uint8Array.from(signature.match(/../g)!, v => parseInt(v, 16))
      if (await crypto.subtle.verify('HMAC', key, bytes, message)) return true
    }
  }
  return false
}
export async function recordEvent(env: AppBindings, event: z.infer<typeof eventSchema>, raw: Uint8Array, key: string) {
  const object = event.data.object
  const digest = await hashToken(raw)
  await env.DB.prepare(`INSERT OR IGNORE INTO payment_events
    (id, idempotency_key, body_hash, type, occurred_at, merchant_uid, seller_reference, content_id, amount, currency, payment_type, partial_refund, refund_amount, refunded_at, service_ends_at, next_billing_date, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(event.id, key, digest, event.type, Date.parse(event.occurredAt), object.merchantUid ?? null, object.sellerReference ?? null,
      object.content.id, object.pricing?.finalAmount ?? null, object.pricing?.currency ?? null, object.content.paymentType,
      object.refund ? Number(object.refund.partialRefund) : null, object.refund?.amount ?? null, object.refund?.refundedAt ?? null,
      object.termination?.terminatedAt ?? object.serviceEndsAt ?? null, object.subscription?.nextBillingDate ?? null, new Date().toISOString()).run()
  const stored = await env.DB.prepare('SELECT id, body_hash FROM payment_events WHERE id = ? OR idempotency_key = ?').bind(event.id, key).all<{ id: string; body_hash: string }>()
  if (stored.results.length !== 1 || stored.results[0].id !== event.id || stored.results[0].body_hash !== digest) throw new Error('event_conflict')
}
export type OrderRow = { id: string; product_id: string; name: string; groble_content_id: string; amount: number; currency: string; payment_type: string; created_at: string }
export type EventRow = { id: string; type: string; occurred_at: number; merchant_uid: string | null; seller_reference: string | null; content_id: string; amount: number | null; currency: string | null; payment_type: string; partial_refund: number | null; refund_amount: number | null; refunded_at: string | null; service_ends_at: string | null; next_billing_date: string | null }
// Reading immutable facts makes retries and out-of-order delivery converge without granting twice.
export function summarizeOrder(order: OrderRow, events: EventRow[]): MemberOrder {
  const matching = events.filter(e => e.content_id === order.groble_content_id && e.payment_type === order.payment_type)
  const completions = matching.filter(e => e.type.endsWith('_payment.completed') || e.type === 'payment.completed')
    .filter(e => e.seller_reference === order.id && e.amount === order.amount && e.currency === order.currency)
  const latest = (xs: EventRow[]) => xs.reduce<EventRow | undefined>((last, e) => !last || e.occurred_at > last.occurred_at ? e : last, undefined)
  const completion = latest(completions)
  let status: OrderStatus = events.length ? 'review_required' : 'pending'
  let hasAccess = false
  if (completion) {
    status = order.payment_type === 'SUBSCRIPTION' ? 'active' : 'paid'; hasAccess = true
    if (order.payment_type === 'ONE_TIME') {
      const refunds = matching.filter(e => e.type === 'payment.refunded' && e.merchant_uid === completion.merchant_uid)
      const uniqueRefunds = [...new Map(refunds.map(e => [e.refunded_at, e])).values()]
      const total = uniqueRefunds.reduce((sum, e) => sum + (e.refund_amount ?? 0), 0)
      if (refunds.some(e => e.partial_refund === 0) || (refunds.length > 0 && total >= order.amount)) { status = 'refunded'; hasAccess = false }
      else if (refunds.length) { status = 'partially_refunded'; hasAccess = false }
      else if (matching.some(e => e.type === 'payment.cancel_requested' && e.merchant_uid === completion.merchant_uid)) status = 'cancel_requested'
    } else {
      const life = latest(matching.filter(e => e.seller_reference === order.id && ['subscription.terminated', 'subscription.cancel_requested', 'subscription_payment.failed'].includes(e.type)))
      if (life && life.occurred_at >= completion.occurred_at) {
        if (life.type === 'subscription.terminated') { status = 'terminated'; hasAccess = false }
        if (life.type === 'subscription_payment.failed') { status = 'past_due'; hasAccess = false }
        if (life.type === 'subscription.cancel_requested') { status = 'cancel_requested'; if (life.service_ends_at && Date.parse(life.service_ends_at) <= Date.now()) hasAccess = false }
      }
      // A round refund is not a subscription cancellation. Missing/expired paid period fails closed.
      const end = completion.next_billing_date && Date.parse(`${completion.next_billing_date}T00:00:00+09:00`)
      if (!end || end <= Date.now()) hasAccess = false
    }
  }
  return { id: order.id, productId: order.product_id, name: order.name, amount: order.amount, status, hasAccess, createdAt: order.created_at }
}
export async function memberOrders(env: AppBindings, memberId: string) {
  const { results } = await env.DB.prepare('SELECT o.*, p.name FROM orders o JOIN products p ON p.id = o.product_id WHERE o.member_id = ? ORDER BY o.created_at DESC LIMIT 100').bind(memberId).all<OrderRow>()
  return Promise.all(results.map(async order => {
    const events = await env.DB.prepare(`SELECT * FROM payment_events WHERE seller_reference = ? OR merchant_uid IN
      (SELECT merchant_uid FROM payment_events WHERE seller_reference = ? AND merchant_uid IS NOT NULL)`)
      .bind(order.id, order.id).all<EventRow>()
    return summarizeOrder(order, events.results)
  }))
}
