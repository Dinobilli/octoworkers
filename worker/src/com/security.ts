import type { Context } from 'hono'
import type { AppBindings } from './bindings'
import { developmentBypass, getAdminIdentity } from './admin-identity'
import { jsonError } from './http'

export async function enforceAdminAccess(c: Context<{ Bindings: AppBindings }>, next: () => Promise<void>) {
  const path = new URL(c.req.url).pathname
  if (!/^\/(api\/admin|agents)(\/|$)/.test(path) || developmentBypass(c)) { await next(); return }
  if (!(await getAdminIdentity(c))) { c.res = jsonError(c, 401, 'Authentication required'); return }
  await next()
}

// Same-origin cookie mutations must never be accepted from a third-party page.
export async function enforceMutationOrigin(c: Context, next: () => Promise<void>) {
  if ((!c.req.path.startsWith('/agents/') && ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) || c.req.path.startsWith('/api/webhooks/')) { await next(); return }
  const origin = c.req.header('Origin')
  if ((origin && origin !== new URL(c.req.url).origin) || c.req.header('Sec-Fetch-Site') === 'cross-site') {
    c.res = jsonError(c, 403, 'Cross-origin mutation denied'); return
  }
  await next()
}

export async function applySecurityHeaders(c: Context, next: () => Promise<void>) {
  if (new URL(c.req.url).pathname.startsWith('/api/admin/ext/rtm/ws')) {
    await next()
    return
  }

  await next()

  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://imagedelivery.net https://*.imagedelivery.net https://avatars.githubusercontent.com; connect-src 'self'; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://github.com")
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-origin')

  if (new URL(c.req.url).protocol === 'https:') {
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
}
