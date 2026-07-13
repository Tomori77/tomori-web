import type { Context } from 'hono'
import { verifyToken } from './jwt'
import type { AppContext, AuthUser } from '../types'

export async function getCurrentUser(c: Context<AppContext>): Promise<AuthUser | null> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return null

  try {
    const id = await verifyToken(c.env, header.slice(7).trim())
    const user = await c.env.DB.prepare(
      `SELECT id, username, email, role, avatar_url, bio, is_banned,
              (SELECT COUNT(*) FROM announcements a
               LEFT JOIN announcement_posts p ON p.id = a.post_id
               WHERE a.user_id = users.id AND a.read_at IS NULL
                 AND (a.post_id IS NULL OR p.expires_at IS NULL OR p.expires_at > datetime('now', '+8 hours'))) AS announcement_unread_count,
              (SELECT COUNT(*) FROM article_notifications n WHERE n.user_id = users.id AND n.read_at IS NULL) AS article_notification_unread_count
       FROM users WHERE id = ?`
    ).bind(id).first<AuthUser & { is_banned: number }>()
    return user && !user.is_banned ? user : null
  } catch {
    return null
  }
}
