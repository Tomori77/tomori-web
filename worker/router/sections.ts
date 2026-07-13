import { Hono } from 'hono'
import type { Context } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getCurrentUser } from '../utils/currentUser'
import { slugify } from '../utils/slugify'
import type { AppContext } from '../types'

const sections = new Hono<AppContext>()
const DEFAULT_SECTION_NAME = '默认板块'

async function uniqueSlug(c: Context<AppContext>, name: string, currentId?: number) {
  const base = slugify(name)
  let slug = base
  let suffix = 2
  while (true) {
    const result = currentId
      ? await c.env.DB.prepare('SELECT id FROM sections WHERE slug = ? AND id != ?').bind(slug, currentId).first()
      : await c.env.DB.prepare('SELECT id FROM sections WHERE slug = ?').bind(slug).first()
    if (!result) return slug
    slug = `${base}-${suffix++}`
  }
}

async function listSections(c: Context<AppContext>) {
  const user = await getCurrentUser(c)
  const role = user?.role ?? 0
  const articleJoin = user && user.role >= 3
    ? 'a.section_id = s.id'
    : "a.section_id = s.id AND a.status = 'published' AND a.visibility <= ?"
  const sectionFilter = user && user.role >= 3 ? '' : 'WHERE s.name != ?'
  const result = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.slug, s.description, s.created_at, s.updated_at,
            COUNT(a.id) AS article_count
     FROM sections s
     LEFT JOIN articles a ON ${articleJoin}
     ${sectionFilter}
     GROUP BY s.id ORDER BY s.name COLLATE NOCASE`
  ).bind(...(user && user.role >= 3 ? [] : [role, DEFAULT_SECTION_NAME])).all()
  return c.json({ sections: result.results })
}

sections.get('/', listSections)
sections.get('', listSections)

sections.get('/:slug', async (c) => {
  const user = await getCurrentUser(c)
  const role = user?.role ?? 0
  const section = await c.env.DB.prepare(
    'SELECT id, name, slug, description, created_at, updated_at FROM sections WHERE slug = ?'
  ).bind(c.req.param('slug')).first<{ id: number; name: string; slug: string; description: string | null }>()
  if (!section) return c.json({ error: 'Section not found' }, 404)
  if (section.name === DEFAULT_SECTION_NAME && (user?.role || 0) < 3) return c.json({ error: 'Section not found' }, 404)
  const articles = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.slug, a.excerpt, a.author_id, u.username AS author_username,
            a.status, a.visibility, a.tags, a.created_at, a.updated_at
     FROM articles a LEFT JOIN users u ON u.id = a.author_id
     WHERE a.section_id = ? AND a.status = 'published' AND a.visibility <= ?
     ORDER BY a.created_at DESC`
  ).bind(section.id, role).all()
  return c.json({ section, articles: articles.results.map((article) => ({
    ...article,
    tags: (() => {
      try { return JSON.parse(String(article.tags || '[]')) } catch { return [] }
    })()
  })) })
})

async function createSection(c: Context<AppContext>) {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = body?.description === undefined || body.description === null ? null : String(body.description).trim()
  if (!name || name.length > 80) return c.json({ error: 'Section name is required and must be at most 80 characters' }, 400)
  const slug = await uniqueSlug(c, name)
  try {
    const result = await c.env.DB.prepare(
      "INSERT INTO sections (name, slug, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))"
    ).bind(name, slug, description, c.get('user').id).run()
    await c.env.DB.prepare("INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))")
      .bind('section_create', result.meta.last_row_id, c.get('user').id, JSON.stringify({ name, slug })).run()
    return c.json({ id: result.meta.last_row_id, name, slug, description }, 201)
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return c.json({ error: 'Section name is already in use' }, 409)
    throw error
  }
}

async function updateSection(c: Context<AppContext>) {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = body?.description === undefined || body.description === null ? null : String(body.description).trim()
  if (!Number.isInteger(id) || id < 1 || !name || name.length > 80) return c.json({ error: 'Invalid section' }, 400)
  const current = await c.env.DB.prepare('SELECT id FROM sections WHERE id = ?').bind(id).first()
  if (!current) return c.json({ error: 'Section not found' }, 404)
  const slug = await uniqueSlug(c, name, id)
  try {
    await c.env.DB.prepare("UPDATE sections SET name = ?, slug = ?, description = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?")
      .bind(name, slug, description, id).run()
    await c.env.DB.prepare("INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))")
      .bind('section_update', id, c.get('user').id, JSON.stringify({ name, slug })).run()
    return c.json({ id, name, slug, description })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return c.json({ error: 'Section name is already in use' }, 409)
    throw error
  }
}

async function deleteSection(c: Context<AppContext>) {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid section id' }, 400)
  const current = await c.env.DB.prepare('SELECT id, name FROM sections WHERE id = ?').bind(id).first<{ id: number; name: string }>()
  if (!current) return c.json({ error: 'Section not found' }, 404)
  if (current.name === DEFAULT_SECTION_NAME) return c.json({ error: 'The default section cannot be deleted' }, 409)
  const articleCount = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM articles WHERE section_id = ?').bind(id).first<{ count: number }>()
  const force = c.req.query('force') === 'true'
  if ((articleCount?.count || 0) > 0 && !force) return c.json({ error: 'Cannot delete a section that contains articles', can_force_delete: true }, 409)
  if ((articleCount?.count || 0) > 0) {
    const defaultSection = await c.env.DB.prepare('SELECT id FROM sections WHERE name = ?').bind(DEFAULT_SECTION_NAME).first<{ id: number }>()
    if (!defaultSection) return c.json({ error: 'Default section is missing' }, 500)
    const affected = await c.env.DB.prepare('SELECT id, author_id, title FROM articles WHERE section_id = ?').bind(id).all<{ id: number; author_id: number | null; title: string }>()
    const statements = [c.env.DB.prepare("UPDATE articles SET section_id = ?, updated_at = datetime('now', '+8 hours') WHERE section_id = ?").bind(defaultSection.id, id)]
    const byAuthor = new Map<number, { titles: string[]; ids: number[] }>()
    for (const article of affected.results) {
      if (!article.author_id) continue
      const group = byAuthor.get(article.author_id) || { titles: [], ids: [] }
      group.titles.push(article.title)
      group.ids.push(article.id)
      byAuthor.set(article.author_id, group)
    }
    for (const [authorId, group] of byAuthor) {
      statements.push(c.env.DB.prepare("INSERT INTO article_notifications (user_id, title, message, notification_type, article_ids, created_at) VALUES (?, ?, ?, 'section_move', ?, datetime('now', '+8 hours'))").bind(authorId, '文章板块已调整', `你的 ${group.titles.length} 篇文章所属板块已删除，现已全部移入默认板块：${group.titles.map((title) => `《${title}》`).join('、')}。`, JSON.stringify(group.ids)))
    }
    statements.push(c.env.DB.prepare("INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))").bind('section_force_delete', id, c.get('user').id, JSON.stringify({ moved_to: defaultSection.id, article_count: affected.results.length })))
    statements.push(c.env.DB.prepare('DELETE FROM sections WHERE id = ?').bind(id))
    await c.env.DB.batch(statements)
    return c.body(null, 204)
  }
  await c.env.DB.prepare('DELETE FROM sections WHERE id = ?').bind(id).run()
  await c.env.DB.prepare("INSERT INTO audit_logs (action, target_id, operator_id, created_at) VALUES (?, ?, ?, datetime('now', '+8 hours'))")
    .bind('section_delete', id, c.get('user').id).run()
  return c.body(null, 204)
}

sections.post('/', authMiddleware, requireRole(3), createSection)
sections.post('', authMiddleware, requireRole(3), createSection)
sections.put('/:id', authMiddleware, requireRole(3), updateSection)
sections.delete('/:id', authMiddleware, requireRole(3), deleteSection)

export { sections }
