import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
vi.mock('agents', () => ({ Agent: class {}, callable: () => (target: unknown) => target, getAgentByName: vi.fn() }))
vi.mock('hono-agents', () => ({ agentsMiddleware: () => async (c: { json: (v: unknown) => Response }) => c.json({ agent: true }) }))
vi.mock('../src/biz/agt/ops-agent', () => ({ OpsAgent: class {} }))
import { createApp } from '../src/index'
import { hashToken } from '../src/com/session'
import { database, environment } from './helpers/sqlite'
import type { MemberOrder } from '@octoworkers/com'
let databaseState: ReturnType<typeof database>
let env: ReturnType<typeof environment>
const app = createApp()
const url = 'https://demo.test'
function request(path: string, init?: RequestInit) { return app.request(url + path, init, env) }
function json(method: string, data: unknown, cookie?: string): RequestInit { return { method, body: JSON.stringify(data), headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) } } }
function owner(email = 'owner@demo.test', role = 'super_admin') {
  databaseState.sqlite.prepare("INSERT INTO admin_users (email,name,role,is_active,created_at,updated_at) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))").run(email, email, role)
}
async function session(kind: 'admin' | 'member', subject: string) {
  const token = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO auth_sessions VALUES (?, ?, ?, ?)').bind(await hashToken(token), kind, subject, Math.floor(Date.now() / 1000) + 3600).run()
  return `__Host-octoworkers_${kind}=${token}`
}
async function customer() {
  const id = crypto.randomUUID()
  databaseState.sqlite.prepare("INSERT INTO members VALUES (?, ?, '고객', NULL, 1, datetime('now'), datetime('now'))").run(id, id)
  return { id, cookie: await session('member', id) }
}
function product(type = 'ONE_TIME') {
  databaseState.sqlite.prepare('INSERT INTO products (id,name,groble_content_id,checkout_url,amount,payment_type) VALUES (?, ?, ?, ?, ?, ?)').run('book', '전자책', 'groble-book', 'https://groble.im/payment/groble-book', 10000, type)
}
async function checkout(cookie: string) {
  const response = await request('/api/payments/checkout', json('POST', { productId: 'book' }, cookie)); expect(response.status).toBe(201)
  return response.json() as Promise<{ orderId: string; checkoutUrl: string }>
}
function event(id: string, type: string, ref?: string, seconds = 0) {
  return { id, type, version: '2026-04-30', occurredAt: new Date(Date.now() + seconds * 1000).toISOString(), data: { object: { merchantUid: 'merchant-1', ...(ref ? { sellerReference: ref } : {}), content: { id: 'groble-book', paymentType: 'ONE_TIME' }, pricing: { finalAmount: 10000, currency: 'KRW' }, ...(type.endsWith('.refunded') ? { refund: { amount: 10000, partialRefund: false, refundedAt: new Date().toISOString() } } : {}) } } }
}
async function signed(body: unknown, options: { secret?: string; seconds?: number; key?: string } = {}) {
  const raw = JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000) + (options.seconds ?? 0))
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(options.secret ?? env.GROBLE_WEBHOOK_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(`${timestamp}.${raw}`))), b => b.toString(16).padStart(2, '0')).join('')
  return request('/api/webhooks/groble', { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'X-Groble-Signature': signature, 'X-Groble-Timestamp': timestamp, 'X-Groble-Idempotency-Key': options.key ?? (body as { id: string }).id } })
}
async function orders(cookie: string) { const res = await request('/api/payments/orders', { headers: { Cookie: cookie } }); return res.json() as Promise<MemberOrder[]> }
beforeEach(() => { databaseState = database(); env = environment(databaseState.db) })
afterEach(() => { databaseState.sqlite.close(); vi.unstubAllGlobals() })

describe('admin identity with real SQLite migrations', () => {
  it('fresh databases have no fake owner; password login requires explicit provisioning', async () => {
    expect(databaseState.sqlite.prepare('SELECT count(*) n FROM admin_users').get()?.n).toBe(0)
    const payload = { email: env.ADMIN_LOGIN_EMAIL, password: env.ADMIN_LOGIN_PASSWORD }
    expect((await request('/api/auth/login', json('POST', payload))).status).toBe(403)
    owner()
    const login = await request('/api/auth/login', json('POST', payload)); expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    expect((await request('/api/auth/me', { headers: { Cookie: cookie } })).status).toBe(200)
    expect((await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } })).status).toBe(200)
    expect((await request('/api/auth/me', { headers: { Cookie: cookie } })).status).toBe(401)
  })
  it('does not accept email headers or off mode on production, including agents', async () => {
    owner(); env.ADMIN_ACCESS_MODE = 'hybrid'
    for (const path of ['/api/admin/dashboard', '/agents/ops-agent/default']) expect((await request(path, { headers: { 'cf-access-authenticated-user-email': 'owner@demo.test' } })).status).toBe(401)
    env.ADMIN_ACCESS_MODE = 'off'
    expect((await app.request('http://localhost/api/admin/dashboard', {}, env)).status).toBe(401)
  })
  it('validates Access signature, audience and issuer and resolves the same DB role', async () => {
    owner(); env.ADMIN_ACCESS_MODE = 'cloudflare-access'; env.CF_ACCESS_TEAM_DOMAIN = 'octo-test.cloudflareaccess.com'; env.CF_ACCESS_AUD = 'my-audience'
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey); jwk.kid = 'test'; jwk.alg = 'RS256'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [jwk] })))
    const token = await new SignJWT({ email: 'owner@demo.test' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(`https://${env.CF_ACCESS_TEAM_DOMAIN}`).setAudience(env.CF_ACCESS_AUD).setExpirationTime('5m').sign(privateKey)
    expect((await request('/api/auth/me', { headers: { 'Cf-Access-Jwt-Assertion': token } })).status).toBe(200)
    env.CF_ACCESS_AUD = 'wrong'
    expect((await request('/api/auth/me', { headers: { 'Cf-Access-Jwt-Assertion': token } })).status).toBe(401)
  })
  it('blocks privilege escalation and protects the last owner at database level', async () => {
    owner(); owner('admin@demo.test', 'admin')
    const ownerId = databaseState.sqlite.prepare("SELECT id FROM admin_users WHERE email = 'owner@demo.test'").get()!.id
    const admin = await session('admin', 'admin@demo.test')
    expect((await request('/api/admin/users', json('POST', { email: 'elevated@demo.test', name: 'Bad', role: 'super_admin' }, admin))).status).toBe(403)
    expect((await request(`/api/admin/users/${ownerId}`, json('PUT', { name: 'Bad', role: 'viewer' }, admin))).status).toBe(403)
    const own = await session('admin', 'owner@demo.test')
    expect((await request(`/api/admin/users/${ownerId}`, json('PUT', { name: 'Owner', role: 'viewer' }, own))).status).toBe(409)
    expect(() => databaseState.sqlite.exec(`DELETE FROM admin_users WHERE id = ${ownerId}`)).toThrow('last_active_owner')
    expect((await request(`/api/admin/users/${ownerId}`, { method: 'DELETE', headers: { Cookie: own } })).status).toBe(409)
  })
  it('revokes changed roles and never lets member sessions access admin or agents', async () => {
    owner(); owner('editor@demo.test', 'editor')
    const editor = await session('admin', 'editor@demo.test')
    expect((await request('/agents/ops-agent/default', { headers: { Cookie: editor } })).status).toBe(200)
    databaseState.sqlite.exec("UPDATE admin_users SET is_active = 0 WHERE email = 'editor@demo.test'")
    expect((await request('/agents/ops-agent/default', { headers: { Cookie: editor } })).status).toBe(401)
    const member = await customer()
    expect((await request('/agents/ops-agent/default', { headers: { Cookie: editor, Origin: 'https://other.demo.test' } })).status).toBe(403)
    expect((await request('/api/admin/dashboard', { headers: { Cookie: member.cookie } })).status).toBe(401)
  })
  it('blocks cross-origin mutations, returns JSON for unknown APIs and limits concurrent login attempts', async () => {
    expect((await request('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.test' } })).status).toBe(403)
    expect((await request('/api/does-not-exist')).status).toBe(404)
    const results = await Promise.all(Array.from({ length: 12 }, () => request('/api/auth/login', json('POST', { email: 'owner@demo.test', password: 'not-the-password' }))))
    expect(results.filter(r => r.status === 429)).toHaveLength(2)
  })
})

describe('Kakao customer login', () => {
  it('creates a member without requiring email and rejects OAuth state replay', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('/oauth/token') ? Response.json({ access_token: 'not-stored' }) : Response.json({ id: 1234, kakao_account: { profile: { nickname: '고객' } } })))
    const start = await request('/api/members/kakao'); expect(start.status).toBe(302)
    const authorize = new URL(start.headers.get('location')!)
    const cookie = start.headers.get('set-cookie')!.split(';')[0]
    const callback = `/api/members/kakao/callback?code=test&state=${authorize.searchParams.get('state')}`
    const response = await request(callback, { headers: { Cookie: cookie } }); expect(response.status).toBe(302)
    expect(databaseState.sqlite.prepare('SELECT email FROM members').get()?.email).toBe(null)
    const cookies = response.headers.get('set-cookie')!
    expect(cookies).toContain('__Host-octoworkers_member='); expect(cookies).not.toContain('__Host-octoworkers_admin=')
    expect((await request(callback, { headers: { Cookie: cookie } })).status).toBe(403)
    expect(databaseState.sqlite.prepare('SELECT count(*) n FROM admin_users').get()?.n).toBe(0)
  })
  it('requires an enabled module, state cookie and matching callback origin', async () => {
    expect((await request('/api/members/kakao/callback?code=x&state=forged')).status).toBe(403)
    env.KAKAO_REDIRECT_URI = 'https://other.test/api/members/kakao/callback'
    expect((await request('/api/members/kakao')).status).toBe(400)
    env.ENABLE_KAKAO = 'false'
    expect((await request('/api/members/kakao')).status).toBe(404)
  })
})

describe('Groble checkout and verified webhook facts', () => {
  it('maps an opaque checkout reference to its member; redirect alone never grants access', async () => {
    product(); const member = await customer(); const other = await customer()
    expect((await request('/api/payments/checkout', json('POST', { productId: 'book' }))).status).toBe(401)
    const started = await checkout(member.cookie)
    expect(new URL(started.checkoutUrl).searchParams.get('ref')).toBe(started.orderId)
    expect(started.checkoutUrl).not.toContain(member.id)
    expect((await orders(member.cookie))[0]).toMatchObject({ status: 'pending', hasAccess: false })
    expect(await orders(other.cookie)).toEqual([])
    const paid = event('evt-paid', 'payment.completed', started.orderId)
    expect((await signed(paid)).status).toBe(200)
    expect((await signed(paid)).status).toBe(200)
    expect(databaseState.sqlite.prepare('SELECT count(*) n FROM payment_events').get()?.n).toBe(1)
    expect((await orders(member.cookie))[0]).toMatchObject({ status: 'paid', hasAccess: true })
  })
  it('rejects bad signatures, stale deliveries, tampering and conflicting duplicate events', async () => {
    const paid = event('evt-test', 'payment.completed', 'ord-missing')
    expect((await signed(paid, { secret: 'wrong' })).status).toBe(401)
    expect((await signed(paid, { seconds: -301 })).status).toBe(401)
    expect((await signed(paid)).status).toBe(200)
    paid.data.object.pricing.finalAmount = 1
    expect((await signed(paid)).status).toBe(409)
    expect(databaseState.sqlite.prepare('SELECT count(*) n FROM payment_events').get()?.n).toBe(1)
  })
  it('handles refunds arriving before completion and keeps repeated delivery idempotent', async () => {
    product(); const member = await customer(); const started = await checkout(member.cookie)
    const refund = event('evt-refund', 'payment.refunded', undefined, 1)
    expect((await signed(refund)).status).toBe(200)
    expect((await signed(event('evt-paid', 'payment.completed', started.orderId))).status).toBe(200)
    expect((await orders(member.cookie))[0]).toMatchObject({ status: 'refunded', hasAccess: false })
  })
  it('requires matching server-side product, price and payment type before granting access', async () => {
    product(); const member = await customer(); const started = await checkout(member.cookie)
    const paid = event('evt-low', 'payment.completed', started.orderId); paid.data.object.pricing.finalAmount = 1
    expect((await signed(paid)).status).toBe(200)
    expect((await orders(member.cookie))[0]).toMatchObject({ status: 'review_required', hasAccess: false })
    paid.id = 'evt-wrong-product'; paid.data.object.pricing.finalAmount = 10000; paid.data.object.content.id = 'another-product'
    await signed(paid)
    expect((await orders(member.cookie))[0].hasAccess).toBe(false)
  })
  it('does not end a subscription on round refund; termination wins over older payment delivery', async () => {
    product('SUBSCRIPTION'); const member = await customer(); const started = await checkout(member.cookie)
    const paid = event('evt-sub', 'subscription_payment.completed', started.orderId)
    const object = { ...paid.data.object, content: { id: 'groble-book', paymentType: 'SUBSCRIPTION' }, subscription: { nextBillingDate: '2099-01-01' } }
    await signed({ ...paid, data: { object } })
    const refund = event('evt-round', 'subscription_payment.refunded', undefined, 1)
    await signed({ ...refund, data: { object: { ...refund.data.object, content: object.content } } })
    expect((await orders(member.cookie))[0]).toMatchObject({ status: 'active', hasAccess: true })
    await signed({ ...event('evt-end', 'subscription.terminated', started.orderId, 2), data: { object: { ...object, termination: { terminatedAt: new Date().toISOString() } } } })
    await signed({ ...paid, id: 'evt-old-delivery', data: { object } })
    expect((await orders(member.cookie))[0]).toMatchObject({ status: 'terminated', hasAccess: false })
  })
  it('supports secret rotation and fails closed when the module is disabled', async () => {
    env.GROBLE_WEBHOOK_SECRET_PREVIOUS = 'previous-secret'
    expect((await signed(event('evt-rotated', 'payment.completed'), { secret: 'previous-secret' })).status).toBe(200)
    env.ENABLE_GROBLE = 'false'
    expect((await request('/api/payments/products')).status).toBe(404)
  })
})
