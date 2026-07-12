import { Hono } from 'hono'
import type { AppContext } from '../types'

const placeholder = (name: string) =>
  new Hono<AppContext>().all('*', (c) =>
    c.json({
      error: 'Not implemented',
      route: name,
      message: 'This endpoint is reserved for a later development phase.'
    }, 501)
  )

export const authRoutes = placeholder('auth')
export const articleRoutes = placeholder('articles')
export const userRoutes = placeholder('users')
export const adminRoutes = placeholder('admin')
export const uploadRoutes = placeholder('upload')
export const toolRoutes = placeholder('tools')
export const pageRoutes = placeholder('pages')
