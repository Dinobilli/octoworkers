import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AppBindings } from './bindings'

type Ctx = Context<{ Bindings: AppBindings }>
export async function hashToken(value: string | Uint8Array) {
  const data = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
function cookie(c: Context, purpose: string) {
  const secure = new URL(c.req.url).protocol === 'https:'
  return { name: `${secure ? '__Host-' : ''}octoworkers_${purpose}`, options: { httpOnly: true, secure, sameSite: 'Lax' as const, path: '/' } }
}
export async function issueSession(c: Ctx, kind: 'admin' | 'member', subject: string) {
  const token = crypto.randomUUID() + crypto.randomUUID()
  const age = kind === 'admin' ? 43200 : 604800
  await c.env.DB.prepare('INSERT INTO auth_sessions (token_hash, kind, subject, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hashToken(token), kind, subject, Math.floor(Date.now() / 1000) + age).run()
  const { name, options } = cookie(c, kind)
  setCookie(c, name, token, { ...options, maxAge: age })
}
export async function readSession(c: Ctx, kind: 'admin' | 'member') {
  const token = getCookie(c, cookie(c, kind).name)
  if (!token) return null
  return c.env.DB.prepare('SELECT subject FROM auth_sessions WHERE token_hash = ? AND kind = ? AND expires_at > ?')
    .bind(await hashToken(token), kind, Math.floor(Date.now() / 1000)).first<{ subject: string }>()
}
export async function clearSession(c: Ctx, kind: 'admin' | 'member') {
  const { name, options } = cookie(c, kind)
  const token = getCookie(c, name)
  if (token) await c.env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ? AND kind = ?').bind(await hashToken(token), kind).run()
  deleteCookie(c, name, options)
}
export async function beginOAuth(c: Ctx, provider: string) {
  const state = crypto.randomUUID() + crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO oauth_states (token_hash, provider, expires_at) VALUES (?, ?, ?)')
    .bind(await hashToken(state), provider, Math.floor(Date.now() / 1000) + 600).run()
  const { name, options } = cookie(c, `oauth_${provider}`)
  setCookie(c, name, state, { ...options, maxAge: 600 })
  return state
}
export async function consumeOAuth(c: Ctx, provider: string, state?: string) {
  const { name, options } = cookie(c, `oauth_${provider}`)
  const expected = getCookie(c, name)
  deleteCookie(c, name, options)
  if (!expected || !state || expected !== state) return false
  const row = await c.env.DB.prepare('DELETE FROM oauth_states WHERE token_hash = ? AND provider = ? AND expires_at > ? RETURNING token_hash')
    .bind(await hashToken(state), provider, Math.floor(Date.now() / 1000)).first()
  return Boolean(row)
}
