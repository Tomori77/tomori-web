import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { rateLimit } from '../middleware/rateLimit'
import type { AppContext } from '../types'

const uploadRoutes = new Hono<AppContext>()
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

function matchesMagic(bytes: Uint8Array, mimeType: string) {
  const startsWith = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (mimeType === 'image/jpeg') return startsWith([0xff, 0xd8, 0xff])
  if (mimeType === 'image/png') return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (mimeType === 'image/gif') return startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  if (mimeType === 'image/webp') return startsWith([0x52, 0x49, 0x46, 0x46]) && bytes.slice(8, 12).every((byte, index) => byte === [0x57, 0x45, 0x42, 0x50][index])
  return false
}

function safeFilename(name: string, mimeType: string) {
  const extensions: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' }
  const extension = extensions[mimeType] || ''
  const base = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
  return `${base || 'image'}${extension}`
}

uploadRoutes.post('/', rateLimit({ limit: 30, windowMs: 60 * 60_000 }), authMiddleware, async (c) => {
  const contentLength = Number(c.req.header('Content-Length') || 0)
  if (contentLength > MAX_UPLOAD_SIZE) return c.json({ error: 'File too large' }, 413)

  const form = await c.req.formData()
  const fileEntry = form.get('file')
  if (!(fileEntry instanceof File)) return c.json({ error: 'A file field is required' }, 400)
  if (!ALLOWED_TYPES.has(fileEntry.type)) return c.json({ error: 'Only jpg, png, gif and webp images are allowed' }, 415)
  if (fileEntry.size > MAX_UPLOAD_SIZE) return c.json({ error: 'File too large' }, 413)

  const bytes = new Uint8Array(await fileEntry.arrayBuffer())
  if (!matchesMagic(bytes, fileEntry.type)) return c.json({ error: 'File content does not match its image type' }, 415)

  const filename = safeFilename(fileEntry.name, fileEntry.type)
  const key = `media/${c.get('user').id}/${Date.now()}-${filename}`
  await c.env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: fileEntry.type }
  })
  await c.env.DB.prepare(
    "INSERT INTO media (user_id, filename, r2_key, size, mime_type, uploaded_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'))"
  ).bind(c.get('user').id, fileEntry.name, key, fileEntry.size, fileEntry.type).run()

  return c.json({ url: `/files/${key}`, key, filename: fileEntry.name, size: fileEntry.size, mime_type: fileEntry.type }, 201)
})

export { uploadRoutes }
