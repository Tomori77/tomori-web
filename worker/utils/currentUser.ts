import type { Context } from 'hono'
import { verifyToken } from './jwt'
import type { AppContext, AuthUser } from '../types'

export async function getCurrentUser(c: Context<AppContext>): Promise<AuthUser | null> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return null

  try {
    const id = await verifyToken(c.env, header.slice(7).trim())
    const user = await c.env.DB.prepare(
      'SELECT id, username, email, role, avatar_url, bio, is_banned FROM users WHERE id = ?'
    ).bind(id).first<AuthUser & { is_banned: number }>()
    return user && !user.is_banned ? user : null
  } catch {
    return null
  }
}
