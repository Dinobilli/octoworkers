import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { AppBindings } from '../../com/bindings'
import { getAdminIdentity } from '../../com/admin-identity'
import * as repo from './repository'

const app = new Hono<{ Bindings: AppBindings }>()

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['super_admin', 'admin', 'editor', 'viewer']),
})

const updateSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(['super_admin', 'admin', 'editor', 'viewer']),
})

app.get('/', async (c) => {
  const users = await repo.listUsers(c.env.DB)
  return c.json(users.map((u) => ({
    id: u.id, email: u.email, name: u.name, role: u.role,
    avatarUrl: u.avatar_url, githubLogin: u.github_login,
    lastLoginAt: u.last_login_at, isActive: u.is_active === 1,
    createdAt: u.created_at, updatedAt: u.updated_at,
  })))
})

app.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return c.json({ message: 'Invalid user ID' }, 400)
  const user = await repo.getUserById(c.env.DB, id)
  if (!user) return c.json({ message: 'User not found' }, 404)
  return c.json({
    id: user.id, email: user.email, name: user.name, role: user.role,
    avatarUrl: user.avatar_url, githubLogin: user.github_login,
    lastLoginAt: user.last_login_at, isActive: user.is_active === 1,
    createdAt: user.created_at, updatedAt: user.updated_at,
  })
})

app.use('*', async (c, next) => {
  if (c.req.method === 'GET') { await next(); return }
  const actor = await getAdminIdentity(c)
  if (!actor) return c.json({ message: 'Authentication required' }, 401)
  let desiredRole: string | undefined
  if (['POST', 'PUT'].includes(c.req.method) && !c.req.path.endsWith('/toggle')) {
    try { desiredRole = (await c.req.json()).role } catch { return c.json({ message: 'Invalid JSON' }, 400) }
  }
  const rawId = c.req.path.split('/').filter(Boolean).filter(p => p !== 'toggle').at(-1)
  const target = rawId && /^\d+$/.test(rawId) ? await repo.getUserById(c.env.DB, Number(rawId)) : null
  if (c.req.method !== 'POST' && !target) return c.json({ message: 'User not found' }, 404)
  if (actor.role !== 'super_admin' && (['super_admin', 'admin'].includes(desiredRole ?? '') || ['super_admin', 'admin'].includes(target?.role ?? ''))) {
    return c.json({ message: 'Only an owner can manage administrators' }, 403)
  }
  if (target?.id === actor.id && (c.req.method === 'DELETE' || c.req.path.endsWith('/toggle'))) {
    return c.json({ message: 'Cannot disable or delete your own account' }, 409)
  }
  await next()
})

app.onError((error, c) => {
  if (String(error).includes('last_active_owner')) return c.json({ message: 'At least one active owner is required' }, 409)
  if (String(error).includes('UNIQUE')) return c.json({ message: 'User already exists' }, 409)
  return c.json({ message: 'User update failed' }, 500)
})

app.post('/', zValidator('json', userSchema), async (c) => {
  const { email, name, role } = c.req.valid('json')
  await repo.createUser(c.env.DB, email.toLowerCase(), name, role)
  return c.json({ ok: true }, 201)
})

app.put('/:id', zValidator('json', updateSchema), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return c.json({ message: 'Invalid user ID' }, 400)
  const { name, role } = c.req.valid('json')
  await repo.updateUser(c.env.DB, id, name, role)
  return c.json({ ok: true })
})

app.put('/:id/toggle', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return c.json({ message: 'Invalid user ID' }, 400)
  const user = await repo.getUserById(c.env.DB, id)
  if (!user) return c.json({ message: 'User not found' }, 404)
  await repo.toggleUserActive(c.env.DB, id, user.is_active === 0)
  return c.json({ ok: true })
})

app.delete('/:id', async (c) => {
  const delId = parseId(c.req.param('id'))
  if (!delId) return c.json({ message: 'Invalid user ID' }, 400)
  await repo.deleteUser(c.env.DB, delId)
  return c.json({ ok: true })
})

export { app as userRoutes }
