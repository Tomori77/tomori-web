import { hashSync } from 'bcryptjs'
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import type { AppContext } from '../types'
import { isValidPassword, isValidUsername } from '../utils/validators'

const userRoutes = new Hono<AppContext>()

userRoutes.get('/me/announcements', authMiddleware, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT a.id, COALESCE(p.title, a.title) AS title, COALESCE(p.message, a.message) AS message,
            a.read_at, COALESCE(p.published_at, a.created_at) AS created_at,
            COALESCE(p.priority, 0) AS priority, COALESCE(p.is_pinned, 0) AS is_pinned,
            p.expires_at
     FROM announcements a LEFT JOIN announcement_posts p ON p.id = a.post_id
     WHERE a.user_id = ?
       AND (a.post_id IS NULL OR p.expires_at IS NULL OR p.expires_at > datetime('now', '+8 hours'))
     ORDER BY is_pinned DESC, created_at DESC LIMIT 100`
  ).bind(c.get('user').id).all()
  return c.json({ announcements: result.results })
})

userRoutes.put('/me/announcements/:id/read', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid announcement id' }, 400)
  await c.env.DB.prepare("UPDATE announcements SET read_at = datetime('now', '+8 hours') WHERE id = ? AND user_id = ?")
    .bind(id, c.get('user').id).run()
  return c.json({ ok: true })
})

userRoutes.get('/me/article-notifications', authMiddleware, async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT id, title, message, notification_type, article_ids, read_at, created_at FROM article_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).bind(c.get('user').id).all()
  return c.json({ notifications: result.results })
})

userRoutes.put('/me/article-notifications/read', authMiddleware, async (c) => {
  await c.env.DB.prepare("UPDATE article_notifications SET read_at = datetime('now', '+8 hours') WHERE user_id = ? AND read_at IS NULL")
    .bind(c.get('user').id).run()
  return c.json({ ok: true })
})

userRoutes.get('/me/articles', authMiddleware, async (c) => {
  const status = c.req.query('status')
  const search = (c.req.query('q') || '').trim()
  const user = c.get('user')
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 50)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  const params: (string | number)[] = [user.id]
  let statusClause = ''
  if (status && ['draft', 'pending', 'published', 'rejected'].includes(status)) {
    statusClause = ' AND status = ?'
    params.push(status)
  }
  const keywords = search.split(/\s+/).filter(Boolean)
  const searchClause = keywords.map(() => ` AND (a.title LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\' OR s.slug LIKE ? ESCAPE '\\' OR a.tags LIKE ? ESCAPE '\\')`).join('')
  for (const keyword of keywords) {
    const searchValue = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`
    params.push(searchValue, searchValue, searchValue, searchValue)
  }
  params.push(limit, offset)
  const result = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.slug, a.excerpt, a.status, a.visibility, a.rejected_reason,
            a.section_id, a.tags, s.name AS section_name, s.slug AS section_slug,
            a.created_at, a.updated_at
     FROM articles a LEFT JOIN sections s ON s.id = a.section_id
     WHERE a.author_id = ?${statusClause.replace('status', 'a.status')}${searchClause} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`
  ).bind(...params).all()
  return c.json({
    articles: result.results.map((article) => ({
      ...article,
      tags: (() => {
        try { return JSON.parse(String(article.tags || '[]')) } catch { return [] }
      })()
    })),
    limit,
    offset,
    q: search
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
    updates.push("updated_at = datetime('now', '+8 hours')")
  values.push(user.id)

  try {
    await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return c.json({ error: 'Username is already in use' }, 409)
    throw error
  }

  const updated = await c.env.DB.prepare(
    `SELECT id, username, email, role, avatar_url, bio,
            (SELECT COUNT(*) FROM announcements a
             LEFT JOIN announcement_posts p ON p.id = a.post_id
             WHERE a.user_id = users.id AND a.read_at IS NULL
               AND (a.post_id IS NULL OR p.expires_at IS NULL OR p.expires_at > datetime('now', '+8 hours'))) AS announcement_unread_count,
            (SELECT COUNT(*) FROM article_notifications n WHERE n.user_id = users.id AND n.read_at IS NULL) AS article_notification_unread_count
     FROM users WHERE id = ?`
  ).bind(user.id).first()
  return c.json({ user: updated })
})

export { userRoutes }
