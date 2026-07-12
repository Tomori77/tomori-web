import type { Context, Next } from 'hono'
import { verifyToken } from '../utils/jwt'
import type { AppContext, AuthUser } from '../types'

function getBearerToken(c: Context<AppContext>) {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const token = getBearerToken(c)
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const userId = await verifyToken(c.env, token)
    const user = await c.env.DB.prepare(
      'SELECT id, username, email, role, avatar_url, bio, is_banned FROM users WHERE id = ?'
    ).bind(userId).first<AuthUser & { is_banned: number }>()

    if (!user || user.is_banned) return c.json({ error: 'Unauthorized' }, 401)
    c.set('user', user)
    await next()
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}

export function requireRole(minRole: number) {
  return async (c: Context<AppContext>, next: Next) => {
    const user = c.get('user')
    if (!user || user.role < minRole) return c.json({ error: 'Forbidden' }, 403)
    await next()
  }
}
