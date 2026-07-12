import { Hono } from 'hono'
import type { AppContext } from '../types'
import { rateLimit } from '../middleware/rateLimit'

const adminArticles = new Hono<AppContext>()

adminArticles.get('/articles/pending', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.slug, a.excerpt, a.author_id, u.username AS author_username,
            a.status, a.visibility, a.rejected_reason, a.created_at, a.updated_at
     FROM articles a LEFT JOIN users u ON u.id = a.author_id
     WHERE a.status = 'pending' ORDER BY a.updated_at ASC`
  ).all()
  return c.json({ articles: result.results })
})

adminArticles.put('/articles/:id/review', rateLimit({ limit: 100, windowMs: 60 * 60_000 }), async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const action = body?.action
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
  if (!['approve', 'reject'].includes(String(action))) return c.json({ error: 'Action must be approve or reject' }, 400)
  if (action === 'reject' && !reason) return c.json({ error: 'A rejection reason is required' }, 400)

  const article = await c.env.DB.prepare('SELECT id, status FROM articles WHERE id = ?').bind(id).first<{ id: number; status: string }>()
  if (!article) return c.json({ error: 'Article not found' }, 404)
  if (article.status !== 'pending') return c.json({ error: 'Only pending articles can be reviewed' }, 409)

  const status = action === 'approve' ? 'published' : 'rejected'
  await c.env.DB.prepare(
    "UPDATE articles SET status = ?, rejected_reason = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(status, action === 'reject' ? reason : null, id).run()
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (action, target_id, operator_id, detail) VALUES (?, ?, ?, ?)'
  ).bind('article_review', id, c.get('user').id, JSON.stringify({ status, reason })).run()
  return c.json({ status, reason: action === 'reject' ? reason : null })
})

export { adminArticles }
