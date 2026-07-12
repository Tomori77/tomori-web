import { Hono } from 'hono'
import { requireRole } from '../middleware/auth'
import type { AppContext } from '../types'

const admin = new Hono<AppContext>()

admin.get('/users', async (c) => {
  const search = (c.req.query('search') || '').trim()
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
  const result = await c.env.DB.prepare(
    `SELECT id, username, email, role, avatar_url, bio, is_banned, created_at, updated_at
     FROM users WHERE (username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(pattern, pattern, limit, offset).all()
  return c.json({ users: result.results, limit, offset })
})

admin.put('/users/:id/ban', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!Number.isInteger(id) || id < 1 || typeof body?.is_banned !== 'boolean') return c.json({ error: 'Invalid user or ban state' }, 400)
  const target = await c.env.DB.prepare('SELECT id, role, is_banned FROM users WHERE id = ?').bind(id).first<{ id: number; role: number; is_banned: number }>()
  if (!target) return c.json({ error: 'User not found' }, 404)
  const operator = c.get('user')
  if (target.id === operator.id) return c.json({ error: 'You cannot ban yourself' }, 400)
  if (target.role >= 4 && operator.role < 4) return c.json({ error: 'Only a super administrator can ban a super administrator' }, 403)

  await c.env.DB.prepare("UPDATE users SET is_banned = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(body.is_banned ? 1 : 0, id).run()
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (action, target_id, operator_id, detail) VALUES (?, ?, ?, ?)'
  ).bind('user_ban', id, operator.id, JSON.stringify({ is_banned: body.is_banned })).run()
  return c.json({ id, is_banned: body.is_banned })
})

admin.put('/users/:id/role', requireRole(4), async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const role = body?.role
  if (!Number.isInteger(id) || id < 1 || typeof role !== 'number' || !Number.isInteger(role) || role < 0 || role > 4) {
    return c.json({ error: 'Role must be an integer between 0 and 4' }, 400)
  }
  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first<{ id: number; role: number }>()
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.id === c.get('user').id) return c.json({ error: 'You cannot change your own role' }, 400)
  if (role === 4 && target.role !== 4) {
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE role = 4').first<{ count: number }>()
    if ((count?.count || 0) >= 1) return c.json({ error: 'Only one super administrator is allowed' }, 409)
  }

  await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").bind(role, id).run()
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (action, target_id, operator_id, detail) VALUES (?, ?, ?, ?)'
  ).bind('user_role_change', id, c.get('user').id, JSON.stringify({ from: target.role, to: role })).run()
  return c.json({ id, role })
})

admin.get('/logs', requireRole(4), async (c) => {
  const search = (c.req.query('search') || '').trim()
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 50), 1), 100)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
  const result = await c.env.DB.prepare(
    `SELECT l.id, l.action, l.target_id, l.operator_id, u.username AS operator_username,
            l.detail, l.created_at
     FROM audit_logs l LEFT JOIN users u ON u.id = l.operator_id
     WHERE l.action LIKE ? ESCAPE '\\' OR l.detail LIKE ? ESCAPE '\\'
     ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
  ).bind(pattern, pattern, limit, offset).all()
  return c.json({ logs: result.results, limit, offset })
})

admin.get('/stats', async (c) => {
  const [users, articles, pending, tools] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM articles').first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM articles WHERE status = 'pending'").first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM tools').first<{ count: number }>()
  ])
  return c.json({
    users: users?.count || 0,
    articles: articles?.count || 0,
    pending_articles: pending?.count || 0,
    tools: tools?.count || 0
  })
})

admin.get('/settings', requireRole(4), async (c) => {
  const result = await c.env.DB.prepare('SELECT key, value, description, updated_at FROM settings ORDER BY key').all()
  return c.json({ settings: result.results })
})

admin.put('/settings', requireRole(4), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const values = body?.settings
  if (!values || typeof values !== 'object' || Array.isArray(values)) return c.json({ error: 'settings must be an object' }, 400)

  const allowedKeys = new Set(['nav_items', 'site_title', 'site_description', 'upload_max_size', 'article_max_size', 'allow_registration'])
  const entries = Object.entries(values)
  for (const [key, value] of entries) {
    if (!allowedKeys.has(key)) return c.json({ error: `Unsupported setting: ${key}` }, 400)
    if (key === 'nav_items' && (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object'))) {
      return c.json({ error: 'nav_items must be an array of objects' }, 400)
    }
    if (['upload_max_size', 'article_max_size'].includes(key) && (!Number.isInteger(value) || Number(value) < 1)) {
      return c.json({ error: `${key} must be a positive integer` }, 400)
    }
    if (['site_title', 'site_description'].includes(key) && typeof value !== 'string') return c.json({ error: `${key} must be a string` }, 400)
    if (key === 'allow_registration' && typeof value !== 'boolean') return c.json({ error: 'allow_registration must be boolean' }, 400)
  }

  for (const [key, value] of entries) {
    const serialized = key === 'nav_items' ? JSON.stringify(value) : String(value)
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).bind(key, serialized).run()
  }
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (action, operator_id, detail) VALUES (?, ?, ?)'
  ).bind('setting_update', c.get('user').id, JSON.stringify({ keys: entries.map(([key]) => key) })).run()
  return c.json({ ok: true, updated: entries.map(([key]) => key) })
})

export { admin }
