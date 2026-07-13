import { compareSync, hashSync } from 'bcryptjs'
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppContext, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { createToken } from '../utils/jwt'
import { isValidEmail, isValidPassword, isValidUsername } from '../utils/validators'

const authRoutes = new Hono<AppContext>()

async function readJson(c: Context<AppContext>) {
  try {
    return await c.req.json<Record<string, unknown>>()
  } catch {
    return null
  }
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
    bio: user.bio,
    announcement_unread_count: user.announcement_unread_count || 0,
    article_notification_unread_count: user.article_notification_unread_count || 0
  }
}

async function withAnnouncementCount(c: Context<AppContext>, user: AuthUser) {
  const result = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM announcements WHERE user_id = ? AND read_at IS NULL'
  ).bind(user.id).first<{ count: number }>()
  const notifications = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM article_notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id).first<{ count: number }>()
  return { ...user, announcement_unread_count: result?.count || 0, article_notification_unread_count: notifications?.count || 0 }
}

authRoutes.post('/register', async (c) => {
  const body = await readJson(c)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = body?.password

  if (!isValidUsername(username)) {
    return c.json({ error: 'Username must be 2-32 characters using letters, numbers, _ or -' }, 400)
  }
  if (!isValidEmail(email)) return c.json({ error: 'A valid email is required' }, 400)
  if (!isValidPassword(password)) return c.json({ error: 'Password must be 8-72 characters' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT username, email FROM users WHERE username = ? OR email = ?'
  ).bind(username, email).first<{ username: string; email: string }>()
  if (existing) return c.json({ error: existing.username === username ? 'Username is already in use' : 'Email is already in use' }, 409)

  const passwordHash = hashSync(password, 12)
  const role = 1
  const result = await c.env.DB.prepare(
    "INSERT INTO users (username, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))"
  ).bind(username, email, passwordHash, role).run()
  const user = await c.env.DB.prepare(
    'SELECT id, username, email, role, avatar_url, bio FROM users WHERE id = ?'
  ).bind(result.meta.last_row_id).first<AuthUser>()

  if (!user) return c.json({ error: 'Unable to create user' }, 500)
  const sessionUser = await withAnnouncementCount(c, user)
  const token = await createToken(c.env, sessionUser)
  return c.json({ user: publicUser(sessionUser), token }, 201)
})

authRoutes.post('/login', async (c) => {
  const body = await readJson(c)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = body?.password
  if (!isValidEmail(email) || typeof password !== 'string') return c.json({ error: 'Invalid email or password' }, 401)

  const user = await c.env.DB.prepare(
    'SELECT id, username, email, password_hash, role, avatar_url, bio, is_banned FROM users WHERE email = ?'
  ).bind(email).first<AuthUser & { password_hash: string | null; is_banned: number }>()
  if (!user?.password_hash || user.is_banned || !compareSync(password, user.password_hash)) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  const sessionUser = await withAnnouncementCount(c, user)
  const token = await createToken(c.env, sessionUser)
  return c.json({ user: publicUser(sessionUser), token })
})

authRoutes.get('/me', authMiddleware, async (c) => {
  const user = await withAnnouncementCount(c, c.get('user'))
  return c.json({ user: publicUser(user) })
})

export { authRoutes }
