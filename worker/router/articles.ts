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
  slug: string | null
  content: string
  excerpt: string | null
  author_id: number
  author_username?: string
  section_id: number | null
  section_name?: string | null
  section_slug?: string | null
  tags: string
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

function parseTags(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  return [...new Set(values.map((tag) => String(tag).trim().toLowerCase()).filter((tag) => /^[\p{L}\p{N}_-]{1,32}$/u.test(tag)))].slice(0, 20)
}

function tagsJson(value: unknown) {
  return JSON.stringify(parseTags(value))
}

function publicArticle(article: Article) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug || String(article.id),
    excerpt: article.excerpt,
    author_id: article.author_id,
    author_username: article.author_username,
    section_id: article.section_id,
    section_name: article.section_name,
    section_slug: article.section_slug,
    tags: parseTags(article.tags),
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
  const search = (c.req.query('q') || '').trim()
  const keywords = search.split(/\s+/).filter(Boolean)
  const searchClause = keywords.map(() => ` AND (a.title LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\' OR s.slug LIKE ? ESCAPE '\\' OR a.tags LIKE ? ESCAPE '\\')`).join('')
  const params: (string | number)[] = [role]
  for (const keyword of keywords) {
    const searchValue = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`
    params.push(searchValue, searchValue, searchValue, searchValue)
  }
  params.push(limit, offset)
  const result = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.slug, a.excerpt, a.author_id, u.username AS author_username,
            a.status, a.visibility, a.rejected_reason, a.section_id, a.tags,
            s.name AS section_name, s.slug AS section_slug, a.created_at, a.updated_at
     FROM articles a LEFT JOIN users u ON u.id = a.author_id
     LEFT JOIN sections s ON s.id = a.section_id
     WHERE a.status = 'published' AND a.visibility <= ?${searchClause}
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params).all<Article>()

  return c.json({ articles: result.results.map(publicArticle), limit, offset, q: search })
})

articles.get('/:id', async (c) => {
  const identifier = c.req.param('id')
  const id = Number(identifier)
  const isId = Number.isInteger(id) && id > 0
  if (!isId && !/^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(identifier)) return c.json({ error: 'Invalid article identifier' }, 400)
  const user = await optionalUser(c)
  const article = await c.env.DB.prepare(
    `SELECT a.*, u.username AS author_username, s.name AS section_name, s.slug AS section_slug
     FROM articles a LEFT JOIN users u ON u.id = a.author_id
     LEFT JOIN sections s ON s.id = a.section_id
     WHERE a.slug = ?`
  ).bind(identifier).first<Article>() || (isId ? await c.env.DB.prepare(
    `SELECT a.*, u.username AS author_username, s.name AS section_name, s.slug AS section_slug
     FROM articles a LEFT JOIN users u ON u.id = a.author_id
     LEFT JOIN sections s ON s.id = a.section_id
     WHERE a.id = ?`
  ).bind(id).first<Article>() : null)
  if (!article) return c.json({ error: 'Article not found' }, 404)

  const canRead = article.status === 'published' && article.visibility <= (user?.role ?? 0)
  const canManage = Boolean(user && (user.role >= 3 || user.id === article.author_id))
  if (!canRead && !canManage) return c.json({ error: 'Forbidden' }, 403)
  return c.json({
    article: {
      ...article,
      tags: parseTags(article.tags)
    }
  })
})

articles.post('/', rateLimit({ limit: 20, windowMs: 60 * 60_000 }), authMiddleware, requireRole(2), async (c) => {
  const user = c.get('user')
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const content = typeof body?.content === 'string' ? body.content : ''
  const excerpt = body?.excerpt === undefined || body.excerpt === null ? null : String(body.excerpt).trim()
  const visibility = body?.visibility === undefined ? 1 : body.visibility
  const sectionId = body?.section_id === undefined || body.section_id === null || body.section_id === '' ? null : Number(body.section_id)
  const tags = tagsJson(body?.tags)
  if (!title || title.length > 200) return c.json({ error: 'Title is required and must be at most 200 characters' }, 400)
  if (!content) return c.json({ error: 'Content is required' }, 400)
  if (new TextEncoder().encode(content).length > ARTICLE_MAX_SIZE) return c.json({ error: 'Article content exceeds 256 KB' }, 413)
  const contentError = validateMarkdownContent(content)
  if (contentError) return c.json({ error: contentError }, 400)
  if (!validVisibility(visibility)) return c.json({ error: 'Visibility must be between 0 and 4' }, 400)
  if (sectionId !== null && (!Number.isInteger(sectionId) || sectionId < 1 || !(await c.env.DB.prepare('SELECT id FROM sections WHERE id = ?').bind(sectionId).first()))) return c.json({ error: 'Section not found' }, 400)

  const slug = await uniqueSlug(c, title)
  const result = await c.env.DB.prepare(
    `INSERT INTO articles (title, slug, content, excerpt, author_id, visibility, section_id, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`
  ).bind(title, slug, content, excerpt, user.id, visibility, sectionId, tags).run()
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
  let sectionId = body?.section_id === undefined ? current.section_id : body.section_id === null ? null : Number(body.section_id)
  if (body?.section_id === '') {
    const defaultSection = await c.env.DB.prepare('SELECT id FROM sections WHERE name = ?').bind('默认板块').first<{ id: number }>()
    sectionId = defaultSection?.id === current.section_id ? current.section_id : null
  }
  const tags = body?.tags === undefined ? current.tags : tagsJson(body.tags)
  if (!title || title.length > 200) return c.json({ error: 'Title is required and must be at most 200 characters' }, 400)
  if (new TextEncoder().encode(content).length > ARTICLE_MAX_SIZE) return c.json({ error: 'Article content exceeds 256 KB' }, 413)
  const contentError = validateMarkdownContent(content)
  if (contentError) return c.json({ error: contentError }, 400)
  if (!validVisibility(visibility)) return c.json({ error: 'Visibility must be between 0 and 4' }, 400)
  if (sectionId !== null && (!Number.isInteger(sectionId) || sectionId < 1 || !(await c.env.DB.prepare('SELECT id FROM sections WHERE id = ?').bind(sectionId).first()))) return c.json({ error: 'Section not found' }, 400)

  const slug = title === current.title ? current.slug || String(id) : await uniqueSlug(c, title, id)
  const status = current.status === 'published' ? 'draft' : current.status
  await c.env.DB.prepare(
    `UPDATE articles SET title = ?, slug = ?, content = ?, excerpt = ?, visibility = ?, section_id = ?, tags = ?, status = ?, rejected_reason = ?, updated_at = datetime('now', '+8 hours')
     WHERE id = ?`
  ).bind(title, slug, content, excerpt, visibility, sectionId, tags, status, status === 'draft' ? null : current.rejected_reason, id).run()
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>()
  return c.json({ article })
})

articles.delete('/:id', authMiddleware, requireRole(2), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const article = await c.env.DB.prepare('SELECT author_id, title FROM articles WHERE id = ?').bind(id).first<{ author_id: number; title: string }>()
  if (!article) return c.json({ error: 'Article not found' }, 404)
  if (article.author_id !== user.id && user.role < 3) return c.json({ error: 'Forbidden' }, 403)
  await c.env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(id).run()
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime(\'now\', \'+8 hours\'))'
  ).bind('article_delete', id, user.id, JSON.stringify({ title: article.title })).run()
  return c.body(null, 204)
})

articles.post('/:id/submit', rateLimit({ limit: 20, windowMs: 60 * 60_000 }), authMiddleware, requireRole(2), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const article = await c.env.DB.prepare('SELECT author_id, status FROM articles WHERE id = ?').bind(id).first<{ author_id: number; status: string }>()
  if (!article) return c.json({ error: 'Article not found' }, 404)
  if (article.author_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
  if (!['draft', 'rejected'].includes(article.status)) return c.json({ error: 'Only drafts or rejected articles can be submitted' }, 409)
  await c.env.DB.prepare("UPDATE articles SET status = 'pending', rejected_reason = NULL, updated_at = datetime('now', '+8 hours') WHERE id = ?").bind(id).run()
  return c.json({ status: 'pending' })
})

export { articles }
