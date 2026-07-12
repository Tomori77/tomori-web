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
    bio: user.bio
  }
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
  const role = c.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() === email ? 4 : 1
  const result = await c.env.DB.prepare(
    'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).bind(username, email, passwordHash, role).run()
  const user = await c.env.DB.prepare(
    'SELECT id, username, email, role, avatar_url, bio FROM users WHERE id = ?'
  ).bind(result.meta.last_row_id).first<AuthUser>()

  if (!user) return c.json({ error: 'Unable to create user' }, 500)
  const token = await createToken(c.env, user)
  return c.json({ user: publicUser(user), token }, 201)
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

  const token = await createToken(c.env, user)
  return c.json({ user: publicUser(user), token })
})

authRoutes.get('/me', authMiddleware, (c) => c.json({ user: publicUser(c.get('user')) }))

export { authRoutes }
