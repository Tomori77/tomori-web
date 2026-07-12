import { hashSync } from 'bcryptjs'
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import type { AppContext } from '../types'
import { isValidPassword, isValidUsername } from '../utils/validators'

const userRoutes = new Hono<AppContext>()

userRoutes.get('/me/articles', authMiddleware, async (c) => {
  const status = c.req.query('status')
  const user = c.get('user')
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 50)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  const params: (string | number)[] = [user.id]
  let statusClause = ''
  if (status && ['draft', 'pending', 'published', 'rejected'].includes(status)) {
    statusClause = ' AND status = ?'
    params.push(status)
  }
  params.push(limit, offset)
  const result = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.slug, a.excerpt, a.status, a.visibility, a.rejected_reason,
            a.section_id, a.tags, s.name AS section_name, s.slug AS section_slug,
            a.created_at, a.updated_at
     FROM articles a LEFT JOIN sections s ON s.id = a.section_id
     WHERE a.author_id = ?${statusClause.replace('status', 'a.status')} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`
  ).bind(...params).all()
  return c.json({
    articles: result.results.map((article) => ({
      ...article,
      tags: (() => {
        try { return JSON.parse(String(article.tags || '[]')) } catch { return [] }
      })()
    })),
    limit,
    offset
  })
})

userRoutes.put('/me', authMiddleware, async (c) => {
  let body: Record<string, unknown> | null
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const user = c.get('user')
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (body.username !== undefined) {
    if (!isValidUsername(body.username)) return c.json({ error: 'Username must be 2-32 characters using letters, numbers, _ or -' }, 400)
    updates.push('username = ?')
    values.push(body.username)
  }
  if (body.bio !== undefined) {
    if (body.bio !== null && (typeof body.bio !== 'string' || body.bio.length > 500)) return c.json({ error: 'Bio must be at most 500 characters' }, 400)
    updates.push('bio = ?')
    values.push(body.bio as string | null)
  }
  if (body.avatar_url !== undefined) {
    if (body.avatar_url !== null && (typeof body.avatar_url !== 'string' || body.avatar_url.length > 2048)) return c.json({ error: 'Invalid avatar URL' }, 400)
    updates.push('avatar_url = ?')
    values.push(body.avatar_url as string | null)
  }
  if (body.password !== undefined) {
    if (!isValidPassword(body.password)) return c.json({ error: 'Password must be 8-72 characters' }, 400)
    updates.push('password_hash = ?')
    values.push(hashSync(body.password, 12))
  }

  if (!updates.length) return c.json({ error: 'No profile fields to update' }, 400)
  updates.push("updated_at = datetime('now')")
  values.push(user.id)

  try {
    await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return c.json({ error: 'Username is already in use' }, 409)
    throw error
  }

  const updated = await c.env.DB.prepare(
    'SELECT id, username, email, role, avatar_url, bio FROM users WHERE id = ?'
  ).bind(user.id).first()
  return c.json({ user: updated })
})

export { userRoutes }
