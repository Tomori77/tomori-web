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
      `SELECT id, username, email, role, avatar_url, bio, is_banned,
              (SELECT COUNT(*) FROM announcements a
               LEFT JOIN announcement_posts p ON p.id = a.post_id
               WHERE a.user_id = users.id AND a.read_at IS NULL
                 AND (a.post_id IS NULL OR p.expires_at IS NULL OR p.expires_at > datetime('now', '+8 hours'))) AS announcement_unread_count,
              (SELECT COUNT(*) FROM article_notifications n WHERE n.user_id = users.id AND n.read_at IS NULL) AS article_notification_unread_count
       FROM users WHERE id = ?`
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
