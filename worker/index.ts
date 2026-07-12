import { cors } from 'hono/cors'
import { Hono } from 'hono'
import type { AppContext } from './types'
import { errorHandler } from './middleware/errorHandler'
import {
  adminRoutes,
  articleRoutes,
  authRoutes,
  pageRoutes,
  toolRoutes,
  uploadRoutes,
  userRoutes
} from './router/placeholder'

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
app.route('/api/auth', authRoutes)
app.route('/api/articles', articleRoutes)
app.route('/api/users', userRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/upload', uploadRoutes)
app.route('/api/tools', toolRoutes)
app.route('/api/pages', pageRoutes)

app.get('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
  if (assetResponse.status !== 404) return assetResponse

  const indexRequest = new Request(new URL('/index.html', c.req.url), c.req.raw)
  return c.env.ASSETS.fetch(indexRequest)
})

export default app
