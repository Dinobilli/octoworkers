import type { Context } from 'hono'
import type { AppBindings } from './bindings'
import { developmentBypass, getAdminIdentity } from './admin-identity'
import { jsonError } from './http'
export type Role = 'super_admin' | 'admin' | 'editor' | 'viewer'
export const ROLE_LEVEL: Record<Role, number> = { super_admin: 4, admin: 3, editor: 2, viewer: 1 }
export function requireRole(minRole: Role) {
  return async (c: Context<{ Bindings: AppBindings }>, next: () => Promise<void>) => {
    if (developmentBypass(c)) { await next(); return }
    const actor = await getAdminIdentity(c)
    if (!actor) { c.res = jsonError(c, 401, 'Authentication required'); return }
    if (ROLE_LEVEL[actor.role] < ROLE_LEVEL[minRole]) { c.res = jsonError(c, 403, 'Insufficient permissions'); return }
    await next()
  }
}
