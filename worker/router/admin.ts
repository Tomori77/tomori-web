import { Hono } from 'hono'
import { requireRole } from '../middleware/auth'
import type { AppContext } from '../types'

const admin = new Hono<AppContext>()

const actionLabels: Record<string, string> = {
  article_delete: '删除文章',
  article_review: '审核文章',
  section_create: '创建板块',
  section_update: '修改板块',
  section_delete: '删除板块',
  section_force_delete: '强制删除板块并迁移文章',
  tool_create: '创建工具',
  tool_update: '修改工具',
  tool_delete: '删除工具',
  user_ban: '封禁或解封用户',
  user_role_change: '修改用户角色',
  setting_update: '修改系统设置',
  announcement_create: '发布公告',
  announcement_update: '修改公告',
  announcement_delete: '删除公告'
}

function readableDetail(action: string, detail: string | null, targetId: number | null) {
  let values: Record<string, unknown> = {}
  try { values = detail ? JSON.parse(detail) : {} } catch { return detail || '无补充信息' }
  if (action === 'article_review') return values.status === 'published' ? '审核通过，文章已发布' : `文章已驳回${values.reason ? `，原因：${values.reason}` : ''}`
  if (action === 'article_delete') return `删除文章${values.title ? `《${values.title}》` : ` #${targetId || ''}`}`
  if (action === 'user_ban') return values.is_banned ? '已封禁用户' : '已解除用户封禁'
  if (action === 'user_role_change') return `角色从 ${values.from} 调整为 ${values.to}`
  if (action === 'section_force_delete') return `文章迁移至默认板块，共 ${values.article_count || 0} 篇`
  if (action === 'setting_update') return `更新参数：${Array.isArray(values.keys) ? values.keys.join('、') : '系统设置'}`
  if (values.name) return `对象名称：${values.name}`
  return detail || '无补充信息'
}

admin.get('/articles/all', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.slug, a.status, a.visibility, a.tags,
            a.section_id, s.name AS section_name, s.slug AS section_slug,
            a.author_id, u.username AS author_username,
      a.rejected_reason, a.created_at, a.updated_at
     FROM articles a
     LEFT JOIN sections s ON s.id = a.section_id
     LEFT JOIN users u ON u.id = a.author_id
     ORDER BY COALESCE(s.name, '未分类') COLLATE NOCASE, u.username COLLATE NOCASE, a.updated_at DESC`
  ).all()
  return c.json({
    articles: result.results.map((article) => ({
      ...article,
      slug: article.slug || String(article.id),
      tags: (() => {
        try { return JSON.parse(String(article.tags || '[]')) } catch { return [] }
      })()
    }))
  })
})

admin.delete('/articles/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid article id' }, 400)
  const article = await c.env.DB.prepare('SELECT id, title FROM articles WHERE id = ?').bind(id).first<{ id: number; title: string }>()
  if (!article) return c.json({ error: 'Article not found' }, 404)
  await c.env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(id).run()
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))"
  ).bind('article_delete', id, c.get('user').id, JSON.stringify({ title: article.title })).run()
  return c.body(null, 204)
})

admin.get('/users', async (c) => {
  const group = c.req.query('group') || 'users'
  const search = (c.req.query('search') || '').trim()
  if (!['admins', 'authors', 'users', 'banned'].includes(group)) return c.json({ error: 'Invalid user group' }, 400)
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 100), 1), 100)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  const roleClause = group === 'admins' ? 'role >= 3 AND is_banned = 0' : group === 'authors' ? 'role = 2 AND is_banned = 0' : group === 'banned' ? 'is_banned = 1' : 'role <= 1 AND is_banned = 0'
  const keywords = search.split(/\s+/).filter(Boolean)
  const searchClause = keywords.map(() => " AND (username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR CAST(id AS TEXT) LIKE ? ESCAPE '\\')").join('')
  const searchParams: string[] = []
  for (const keyword of keywords) {
    const pattern = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`
    searchParams.push(pattern, pattern, pattern)
  }
  const result = await c.env.DB.prepare(
    `SELECT id, username, email, role, avatar_url, bio, is_banned, created_at, updated_at
     FROM users WHERE ${roleClause}${searchClause}
      ORDER BY ${group === 'admins' ? 'CASE WHEN role = 4 THEN 0 ELSE 1 END, created_at DESC' : 'created_at DESC'}
     LIMIT ? OFFSET ?`
  ).bind(...searchParams, limit, offset).all()
  return c.json({ users: result.results, group, search, limit, offset })
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

  await c.env.DB.prepare("UPDATE users SET is_banned = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?")
    .bind(body.is_banned ? 1 : 0, id).run()
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))"
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

  await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?").bind(role, id).run()
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))"
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
  return c.json({ logs: result.results.map((log) => ({
    ...log,
    action_label: actionLabels[String(log.action)] || String(log.action),
    readable_detail: readableDetail(String(log.action), log.detail as string | null, log.target_id as number | null)
  })), limit, offset })
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

admin.get('/super-stats', requireRole(4), async (c) => {
  let r2Bytes = 0
  let cursor: string | undefined
  do {
    const page = await c.env.MEDIA_BUCKET.list({ limit: 1000, cursor })
    r2Bytes += page.objects.reduce((total, object) => total + object.size, 0)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  const [users, articles, pending, todayArticles, tools, database, reviews, registrations, published] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM articles').first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM articles WHERE status = 'pending'").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM articles WHERE created_at >= date('now', '+8 hours') || ' 00:00:00'").first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM tools').first<{ count: number }>(),
    c.env.DB.prepare(`SELECT COALESCE(
      (SELECT SUM(LENGTH(username) + LENGTH(email) + LENGTH(COALESCE(bio, ''))) FROM users) +
      (SELECT SUM(LENGTH(title) + LENGTH(content) + LENGTH(COALESCE(excerpt, ''))) FROM articles) +
      (SELECT SUM(LENGTH(name) + LENGTH(COALESCE(description, ''))) FROM sections) +
      (SELECT SUM(LENGTH(title) + LENGTH(message)) FROM announcements) +
      (SELECT SUM(LENGTH(action) + LENGTH(COALESCE(detail, ''))) FROM audit_logs) +
      (SELECT SUM(LENGTH(key) + LENGTH(COALESCE(value, '')) + LENGTH(COALESCE(description, ''))) FROM settings) +
      (SELECT SUM(LENGTH(name) + LENGTH(COALESCE(description, '')) + LENGTH(html_content)) FROM tools), 0) AS bytes`).first<{ bytes: number }>(),
    c.env.DB.prepare(`SELECT l.id, l.action, l.target_id, l.detail, l.created_at, u.username AS operator_username
      FROM audit_logs l LEFT JOIN users u ON u.id = l.operator_id
      WHERE l.action = 'article_review' ORDER BY l.created_at DESC LIMIT 5`).all(),
    c.env.DB.prepare('SELECT id, username, email, created_at FROM users ORDER BY created_at DESC LIMIT 5').all(),
    c.env.DB.prepare("SELECT id, title, slug, created_at FROM articles WHERE status = 'published' ORDER BY updated_at DESC LIMIT 5").all()
  ])
  return c.json({
    metrics: {
      users: users?.count || 0,
      articles: articles?.count || 0,
      pending_articles: pending?.count || 0,
      today_articles: todayArticles?.count || 0,
      tools: tools?.count || 0,
      database_bytes: database?.bytes || 0,
      r2_bytes: r2Bytes
    },
    activity: {
      reviews: reviews.results.map((log) => ({
        ...log,
        action_label: actionLabels[String(log.action)] || String(log.action),
        readable_detail: readableDetail(String(log.action), log.detail as string | null, log.target_id as number | null)
      })),
      registrations: registrations.results,
      published: published.results
    }
  })
})

admin.get('/announcements', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT p.id, p.title, p.message, p.priority, p.is_pinned, p.published_at, p.expires_at,
            p.created_at, p.updated_at, u.username AS publisher_username
     FROM announcement_posts p LEFT JOIN users u ON u.id = p.publisher_id
     ORDER BY p.is_pinned DESC, p.published_at DESC LIMIT 100`
  ).all()
  return c.json({ announcements: result.results })
})

function announcementInput(body: Record<string, unknown> | null) {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const message = typeof body?.message === 'string' ? body.message : ''
  const priority = body?.priority === undefined ? 0 : Number(body.priority)
  const isPinned = body?.is_pinned === true
  const publishedAt = typeof body?.published_at === 'string' && body.published_at.trim() ? body.published_at.trim().replace('T', ' ') : null
  const expiresAt = typeof body?.expires_at === 'string' && body.expires_at.trim() ? body.expires_at.trim().replace('T', ' ') : null
  return { title, message, priority, isPinned, publishedAt, expiresAt }
}

admin.post('/announcements', async (c) => {
  const input = announcementInput(await c.req.json<Record<string, unknown>>().catch(() => null))
  if (!input.title || input.title.length > 200 || !input.message || input.message.length > 20_000) return c.json({ error: '公告标题和正文不能为空，正文最多 20000 个字符' }, 400)
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 2) return c.json({ error: '公告优先级无效' }, 400)
  const result = await c.env.DB.prepare(
    "INSERT INTO announcement_posts (title, message, publisher_id, priority, is_pinned, published_at, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now', '+8 hours')), ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))"
  ).bind(input.title, input.message, c.get('user').id, input.priority, input.isPinned ? 1 : 0, input.publishedAt, input.expiresAt).run()
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO announcements (user_id, title, message, post_id, created_at) SELECT id, ?, ?, ?, datetime('now', '+8 hours') FROM users WHERE is_banned = 0").bind(input.title, input.message, result.meta.last_row_id),
    c.env.DB.prepare("INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))").bind('announcement_create', result.meta.last_row_id, c.get('user').id, JSON.stringify({ title: input.title }))
  ])
  return c.json({ id: result.meta.last_row_id }, 201)
})

admin.put('/announcements/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const input = announcementInput(await c.req.json<Record<string, unknown>>().catch(() => null))
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid announcement id' }, 400)
  if (!input.title || input.title.length > 200 || !input.message || input.message.length > 20_000) return c.json({ error: '公告标题和正文不能为空，正文最多 20000 个字符' }, 400)
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 2) return c.json({ error: '公告优先级无效' }, 400)
  const existing = await c.env.DB.prepare('SELECT id FROM announcement_posts WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Announcement not found' }, 404)
  await c.env.DB.prepare("UPDATE announcement_posts SET title = ?, message = ?, priority = ?, is_pinned = ?, published_at = COALESCE(?, published_at), expires_at = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?")
    .bind(input.title, input.message, input.priority, input.isPinned ? 1 : 0, input.publishedAt, input.expiresAt, id).run()
  await c.env.DB.prepare('UPDATE announcements SET title = ?, message = ? WHERE post_id = ?').bind(input.title, input.message, id).run()
  await c.env.DB.prepare("INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))").bind('announcement_update', id, c.get('user').id, JSON.stringify({ title: input.title })).run()
  return c.json({ ok: true })
})

admin.delete('/announcements/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid announcement id' }, 400)
  const existing = await c.env.DB.prepare('SELECT id, title FROM announcement_posts WHERE id = ?').bind(id).first<{ id: number; title: string }>()
  if (!existing) return c.json({ error: 'Announcement not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM announcements WHERE post_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM announcement_posts WHERE id = ?').bind(id),
    c.env.DB.prepare("INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))").bind('announcement_delete', id, c.get('user').id, JSON.stringify({ title: existing.title }))
  ])
  return c.body(null, 204)
})

admin.get('/settings', requireRole(4), async (c) => {
  const result = await c.env.DB.prepare("SELECT key, value, description, updated_at FROM settings WHERE key NOT LIKE 'migration_%' ORDER BY key").all()
  return c.json({ settings: result.results })
})

admin.put('/settings', requireRole(4), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const values = body?.settings
  if (!values || typeof values !== 'object' || Array.isArray(values)) return c.json({ error: 'settings must be an object' }, 400)

  const allowedKeys = new Set([
    'nav_items', 'site_title', 'site_description', 'upload_max_size', 'article_max_size', 'allow_registration',
    'tool_max_size', 'max_title_length', 'max_excerpt_length', 'max_bio_length', 'max_tags', 'max_tag_length',
    'login_rate_limit', 'register_rate_limit', 'article_rate_limit', 'upload_rate_limit', 'review_rate_limit'
  ])
  const entries = Object.entries(values)
  for (const [key, value] of entries) {
    if (!allowedKeys.has(key)) return c.json({ error: `Unsupported setting: ${key}` }, 400)
    if (key === 'nav_items' && (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object'))) {
      return c.json({ error: 'nav_items must be an array of objects' }, 400)
    }
    if (['upload_max_size', 'article_max_size', 'tool_max_size', 'max_title_length', 'max_excerpt_length', 'max_bio_length', 'max_tags', 'max_tag_length', 'login_rate_limit', 'register_rate_limit', 'article_rate_limit', 'upload_rate_limit', 'review_rate_limit'].includes(key) && (!Number.isInteger(value) || Number(value) < 1)) {
      return c.json({ error: `${key} must be a positive integer` }, 400)
    }
    if (['site_title', 'site_description'].includes(key) && typeof value !== 'string') return c.json({ error: `${key} must be a string` }, 400)
    if (key === 'allow_registration' && typeof value !== 'boolean') return c.json({ error: 'allow_registration must be boolean' }, 400)
  }

  for (const [key, value] of entries) {
    const serialized = key === 'nav_items' ? JSON.stringify(value) : String(value)
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', '+8 hours')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).bind(key, serialized).run()
  }
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (action, operator_id, detail, created_at) VALUES (?, ?, ?, datetime('now', '+8 hours'))"
  ).bind('setting_update', c.get('user').id, JSON.stringify({ keys: entries.map(([key]) => key) })).run()
  return c.json({ ok: true, updated: entries.map(([key]) => key) })
})

export { admin }
