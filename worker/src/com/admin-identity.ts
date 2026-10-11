import type { Context } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AppBindings } from './bindings'
import { readSession } from './session'
import type { Role } from './rbac'

export type AdminIdentity = { id: number; email: string; role: Role }
type Ctx = Context<{ Bindings: AppBindings }>
const identityCache = new WeakMap<Ctx, Promise<AdminIdentity | null>>()
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()
export function developmentBypass(c: Ctx) {
  return ['development', 'test'].includes(c.env.ENV_NAME ?? '') &&
    ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname) && c.env.ADMIN_ACCESS_MODE === 'off'
}
export async function accessEmail(c: Ctx) {
  const token = c.req.header('Cf-Access-Jwt-Assertion')
  const team = c.env.CF_ACCESS_TEAM_DOMAIN ?? ''
  if (!token || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !c.env.CF_ACCESS_AUD) return null
  const issuer = `https://${team}`
  if (!keySets.has(issuer)) {
    if (keySets.size >= 10) keySets.clear()
    keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)))
  }
  try {
    const { payload } = await jwtVerify(token, keySets.get(issuer)!, { issuer, audience: c.env.CF_ACCESS_AUD, algorithms: ['RS256'] })
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null
  } catch { return null }
}
async function resolve(c: Ctx): Promise<AdminIdentity | null> {
  const mode = c.env.ADMIN_ACCESS_MODE ?? 'session'
  if (!['session', 'hybrid', 'cloudflare-access'].includes(mode)) return null
  let email: string | null = null
  if (mode !== 'session') email = await accessEmail(c)
  if (!email && mode !== 'cloudflare-access') email = (await readSession(c, 'admin'))?.subject ?? null
  if (!email) return null
  const allowed = (c.env.ADMIN_ALLOWED_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  if (allowed.length && !allowed.includes(email)) return null
  const row = await c.env.DB.prepare('SELECT id, email, role FROM admin_users WHERE email = ? AND is_active = 1').bind(email).first<AdminIdentity>()
  return row && ['super_admin', 'admin', 'editor', 'viewer'].includes(row.role) ? row : null
}
export function getAdminIdentity(c: Ctx) {
  if (!identityCache.has(c)) identityCache.set(c, resolve(c))
  return identityCache.get(c)!
}
