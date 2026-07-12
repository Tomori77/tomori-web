import { Hono } from 'hono'
import type { Context } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import type { AppContext, AuthUser } from '../types'
import { slugify } from '../utils/slugify'
import { validateMarkdownContent } from '../utils/content'
import { rateLimit } from '../middleware/rateLimit'

const articles = new Hono<AppContext>()
const ARTICLE_MAX_SIZE = 262_144

type Article = {
  id: number
  title: string
  slug: string
  content: string
  excerpt: string | null
  author_id: number
  author_username?: string
  status: 'draft' | 'pending' | 'published' | 'rejected'
  visibility: number
  rejected_reason: string | null
  created_at: string
  updated_at: string
}

async function optionalUser(c: Context<AppContext>): Promise<AuthUser | null> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return null

  try {
    const { verifyToken } = await import('../utils/jwt')
    const id = await verifyToken(c.env, header.slice(7).trim())
    const user = await c.env.DB.prepare(
      'SELECT id, username, email, role, avatar_url, bio, is_banned FROM users WHERE id = ?'
    ).bind(id).first<AuthUser & { is_banned: number }>()
    return user && !user.is_banned ? user : null
  } catch {
    return null
  }
}

async function uniqueSlug(c: Context<AppContext>, title: string, currentId?: number) {
  const base = slugify(title)
  let slug = base
  let suffix = 2
  while (true) {
    const query = currentId
      ? 'SELECT id FROM articles WHERE slug = ? AND id != ?'
      : 'SELECT id FROM articles WHERE slug = ?'
    const existing = currentId
      ? await c.env.DB.prepare(query).bind(slug, currentId).first()
      : await c.env.DB.prepare(query).bind(slug).first()
    if (!existing) return slug
    slug = `${base}-${suffix++}`
  }
}

function validVisibility(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4
}

function publicArticle(article: Article) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    author_id: article.author_id,
    author_username: article.author_username,
    status: article.status,
    visibility: article.visibility,
    rejected_reason: article.rejected_reason,
    created_at: article.created_at,
    updated_at: article.updated_at
  }
}

articles.get('/', async (c) => {
  const user = await optionalUser(c)
  const role = user?.role ?? 0
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 50)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  const result = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.slug, a.excerpt, a.author_id, u.username AS author_username,
            a.status, a.visibility, a.rejected_reason, a.created_at, a.updated_at
     FROM articles a LEFT JOIN users u ON u.id = a.author_id
     WHERE a.status = 'published' AND a.visibility <= ?
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
  ).bind(role, limit, offset).all<Article>()

  return c.json({ articles: result.results.map(publicArticle), limit, offset })
})

articles.get('/:id', async (c) => {
  const identifier = c.req.param('id')
  const id = Number(identifier)
  const isId = Number.isInteger(id) && id > 0
  if (!isId && !/^[a-z0-9][a-z0-9-]*$/i.test(identifier)) return c.json({ error: 'Invalid article identifier' }, 400)
  const user = await optionalUser(c)
  const article = await c.env.DB.prepare(
    `SELECT a.*, u.username AS author_username
     FROM articles a LEFT JOIN users u ON u.id = a.author_id WHERE ${isId ? 'a.id = ?' : 'a.slug = ?'}`
  ).bind(isId ? id : identifier).first<Article>()
  if (!article) return c.json({ error: 'Article not found' }, 404)

  const canRead = article.status === 'published' && article.visibility <= (user?.role ?? 0)
  const canManage = Boolean(user && (user.role >= 3 || user.id === article.author_id))
  if (!canRead && !canManage) return c.json({ error: 'Forbidden' }, 403)
  return c.json({ article: { ...article, content: article.content } })
})

articles.post('/', rateLimit({ limit: 20, windowMs: 60 * 60_000 }), authMiddleware, requireRole(2), async (c) => {
  const user = c.get('user')
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const content = typeof body?.content === 'string' ? body.content : ''
  const excerpt = body?.excerpt === undefined || body.excerpt === null ? null : String(body.excerpt).trim()
  const visibility = body?.visibility === undefined ? 1 : body.visibility
  if (!title || title.length > 200) return c.json({ error: 'Title is required and must be at most 200 characters' }, 400)
  if (!content) return c.json({ error: 'Content is required' }, 400)
  if (new TextEncoder().encode(content).length > ARTICLE_MAX_SIZE) return c.json({ error: 'Article content exceeds 256 KB' }, 413)
  const contentError = validateMarkdownContent(content)
  if (contentError) return c.json({ error: contentError }, 400)
  if (!validVisibility(visibility)) return c.json({ error: 'Visibility must be between 0 and 4' }, 400)

  const slug = await uniqueSlug(c, title)
  const result = await c.env.DB.prepare(
    `INSERT INTO articles (title, slug, content, excerpt, author_id, visibility)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(title, slug, content, excerpt, user.id, visibility).run()
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id = ?')
    .bind(result.meta.last_row_id).first<Article>()
  return c.json({ article }, 201)
})

articles.put('/:id', rateLimit({ limit: 20, windowMs: 60 * 60_000 }), authMiddleware, requireRole(2), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const current = await c.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>()
  if (!current) return c.json({ error: 'Article not found' }, 404)
  if (current.author_id !== user.id && user.role < 3) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const title = body?.title === undefined ? current.title : String(body.title).trim()
  const content = body?.content === undefined ? current.content : String(body.content)
  const excerpt = body?.excerpt === undefined ? current.excerpt : body.excerpt === null ? null : String(body.excerpt).trim()
  const visibility = body?.visibility === undefined ? current.visibility : body.visibility
  if (!title || title.length > 200) return c.json({ error: 'Title is required and must be at most 200 characters' }, 400)
  if (new TextEncoder().encode(content).length > ARTICLE_MAX_SIZE) return c.json({ error: 'Article content exceeds 256 KB' }, 413)
  const contentError = validateMarkdownContent(content)
  if (contentError) return c.json({ error: contentError }, 400)
  if (!validVisibility(visibility)) return c.json({ error: 'Visibility must be between 0 and 4' }, 400)

  const slug = title === current.title ? current.slug : await uniqueSlug(c, title, id)
  await c.env.DB.prepare(
    `UPDATE articles SET title = ?, slug = ?, content = ?, excerpt = ?, visibility = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(title, slug, content, excerpt, visibility, id).run()
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>()
  return c.json({ article })
})

articles.delete('/:id', authMiddleware, requireRole(2), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const article = await c.env.DB.prepare('SELECT author_id FROM articles WHERE id = ?').bind(id).first<{ author_id: number }>()
  if (!article) return c.json({ error: 'Article not found' }, 404)
  if (article.author_id !== user.id && user.role < 3) return c.json({ error: 'Forbidden' }, 403)
  await c.env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(id).run()
  return c.body(null, 204)
})

articles.post('/:id/submit', rateLimit({ limit: 20, windowMs: 60 * 60_000 }), authMiddleware, requireRole(2), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const article = await c.env.DB.prepare('SELECT author_id, status FROM articles WHERE id = ?').bind(id).first<{ author_id: number; status: string }>()
  if (!article) return c.json({ error: 'Article not found' }, 404)
  if (article.author_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
  if (!['draft', 'rejected'].includes(article.status)) return c.json({ error: 'Only drafts or rejected articles can be submitted' }, 409)
  await c.env.DB.prepare("UPDATE articles SET status = 'pending', rejected_reason = NULL, updated_at = datetime('now') WHERE id = ?").bind(id).run()
  return c.json({ status: 'pending' })
})

export { articles }
