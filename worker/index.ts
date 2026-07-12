import { cors } from 'hono/cors'
import { Hono } from 'hono'
import type { AppContext } from './types'
import { errorHandler } from './middleware/errorHandler'
import { authMiddleware, requireRole } from './middleware/auth'
import { rateLimit } from './middleware/rateLimit'
import { authRoutes } from './router/auth'
import { articles } from './router/articles'
import { adminArticles } from './router/adminArticles'
import { uploadRoutes } from './router/upload'
import { userRoutes } from './router/users'
import { admin } from './router/admin'
import { settings } from './router/settings'
import { tools } from './router/tools'
import { pageRoutes } from './router/placeholder'
import { sections } from './router/sections'

const app = new Hono<AppContext>()

app.use('/api/*', cors())
app.onError(errorHandler)

app.get('/api/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first()
    return c.json({ ok: true, database: 'connected', storage: 'bound' })
  } catch (error) {
    console.error(error)
    return c.json({ ok: false, database: 'unavailable', storage: 'bound' }, 503)
  }
})

app.get('/api', (c) => c.json({ name: 'tomori-web', status: 'scaffold-ready' }))
app.use('/api/auth/login', rateLimit({ limit: 10, windowMs: 60_000 }))
app.use('/api/auth/register', rateLimit({ limit: 10, windowMs: 60_000 }))
app.use('/api/admin', authMiddleware, requireRole(3))
app.use('/api/admin/*', authMiddleware, requireRole(3))
app.route('/api/auth', authRoutes)
app.route('/api/articles', articles)
app.route('/api/users', userRoutes)
app.route('/api/admin', adminArticles)
app.route('/api/admin', admin)
app.route('/api/upload', uploadRoutes)
app.route('/api/tools', tools)
app.route('/api/admin/tools', tools)
app.route('/api/pages', pageRoutes)
app.route('/api/settings', settings)
app.route('/api/sections', sections)

app.get('/files/*', async (c) => {
  const key = c.req.path.slice('/files/'.length)
  if (!key || key.includes('..')) return c.json({ error: 'Invalid file path' }, 400)
  const object = await c.env.MEDIA_BUCKET.get(key)
  if (!object) return c.json({ error: 'File not found' }, 404)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('x-content-type-options', 'nosniff')
  return new Response(object.body, { headers })
})

app.get('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
  if (assetResponse.status !== 404) return assetResponse

  const indexRequest = new Request(new URL('/index.html', c.req.url), c.req.raw)
  return c.env.ASSETS.fetch(indexRequest)
})

export default app
