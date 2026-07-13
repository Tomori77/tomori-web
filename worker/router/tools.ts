import { Hono } from 'hono'
import type { Context } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getCurrentUser } from '../utils/currentUser'
import type { AppContext } from '../types'

const tools = new Hono<AppContext>()
const MAX_TOOL_SIZE = 262_144

function validVisibility(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4
}

function readToolBody(body: Record<string, unknown> | null) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = body?.description === undefined || body.description === null ? null : String(body.description).trim()
  const source = body?.source === undefined || body.source === null ? null : String(body.source).trim()
  const htmlContent = typeof body?.html_content === 'string' ? body.html_content : ''
  const visibility = body?.visibility === undefined ? 1 : body.visibility
  return { name, description, source, htmlContent, visibility }
}

async function listTools(c: Context<AppContext>) {
  const user = await getCurrentUser(c)
  const role = user?.role ?? 0
  const result = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.description, t.source, t.visibility, t.created_by,
            u.username AS creator_username, t.created_at, t.updated_at
     FROM tools t LEFT JOIN users u ON u.id = t.created_by
     WHERE t.visibility <= ? ORDER BY t.updated_at DESC`
  ).bind(role).all()
  return c.json({ tools: result.results })
}

tools.get('/', listTools)

tools.get('', listTools)

tools.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid tool id' }, 400)
  const user = await getCurrentUser(c)
  const tool = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.description, t.source, t.html_content, t.visibility,
            t.created_by, u.username AS creator_username, t.created_at, t.updated_at
     FROM tools t LEFT JOIN users u ON u.id = t.created_by WHERE t.id = ?`
  ).bind(id).first<{ visibility: number }>()
  if (!tool) return c.json({ error: 'Tool not found' }, 404)
  if (tool.visibility > (user?.role ?? 0)) return c.json({ error: 'Forbidden' }, 403)
  return c.json({ tool })
})

async function createTool(c: Context<AppContext>) {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const tool = readToolBody(body)
  if (!tool.name || tool.name.length > 120) return c.json({ error: 'Name is required and must be at most 120 characters' }, 400)
  if (!tool.htmlContent || new TextEncoder().encode(tool.htmlContent).length > MAX_TOOL_SIZE) return c.json({ error: 'HTML content is required and must be at most 256 KB' }, 413)
  if (!validVisibility(tool.visibility)) return c.json({ error: 'Visibility must be between 0 and 4' }, 400)

  const result = await c.env.DB.prepare(
    "INSERT INTO tools (name, description, source, html_content, visibility, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))"
  ).bind(tool.name, tool.description, tool.source, tool.htmlContent, tool.visibility, c.get('user').id).run()
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))"
  ).bind('tool_create', result.meta.last_row_id, c.get('user').id, JSON.stringify({ name: tool.name })).run()
  return c.json({ id: result.meta.last_row_id }, 201)
}

tools.post('/', authMiddleware, requireRole(3), createTool)
tools.post('', authMiddleware, requireRole(3), createTool)

async function updateTool(c: Context<AppContext>) {
  const id = Number(c.req.param('id'))
  const existing = await c.env.DB.prepare('SELECT id FROM tools WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Tool not found' }, 404)
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const tool = readToolBody(body)
  if (!tool.name || tool.name.length > 120) return c.json({ error: 'Name is required and must be at most 120 characters' }, 400)
  if (!tool.htmlContent || new TextEncoder().encode(tool.htmlContent).length > MAX_TOOL_SIZE) return c.json({ error: 'HTML content is required and must be at most 256 KB' }, 413)
  if (!validVisibility(tool.visibility)) return c.json({ error: 'Visibility must be between 0 and 4' }, 400)

  await c.env.DB.prepare(
    "UPDATE tools SET name = ?, description = ?, source = ?, html_content = ?, visibility = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?"
  ).bind(tool.name, tool.description, tool.source, tool.htmlContent, tool.visibility, id).run()
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))"
  ).bind('tool_update', id, c.get('user').id, JSON.stringify({ name: tool.name })).run()
  return c.json({ ok: true })
}

tools.put('/:id', authMiddleware, requireRole(3), updateTool)

async function deleteTool(c: Context<AppContext>) {
  const id = Number(c.req.param('id'))
  const existing = await c.env.DB.prepare('SELECT id FROM tools WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Tool not found' }, 404)
  await c.env.DB.prepare('DELETE FROM tools WHERE id = ?').bind(id).run()
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (action, target_id, operator_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))"
  ).bind('tool_delete', id, c.get('user').id, null).run()
  return c.body(null, 204)
}

tools.delete('/:id', authMiddleware, requireRole(3), deleteTool)

export { tools }
