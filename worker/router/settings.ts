import { Hono } from 'hono'
import type { AppContext } from '../types'

const settings = new Hono<AppContext>()

function parseSetting(key: string, value: string | null) {
  if (key === 'nav_items') {
    try {
      const parsed = JSON.parse(value || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}

settings.get('/nav_items', async (c) => {
  const row = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('nav_items').first<{ value: string | null }>()
  return c.json({ nav_items: parseSetting('nav_items', row?.value || null) })
})

settings.get('/site_info', async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('site_title', 'site_description')"
  ).all<{ key: string; value: string | null }>()
  const info = Object.fromEntries(result.results.map((row) => [row.key, parseSetting(row.key, row.value)]))
  return c.json(info)
})

export { settings }
