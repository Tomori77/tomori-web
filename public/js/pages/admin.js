import { api } from '../auth.js'

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function render() {
  return loadAdmin()
}

async function loadAdmin() {
  const section = window.location.pathname.split('/')[2] || 'review'
  try {
    if (section === 'users') return renderUsers()
    if (section === 'tools') return renderTools()
    if (section === 'logs') return renderLogs()
    if (section === 'settings') return renderSettings()
    if (section === 'dashboard') return renderDashboard()
    const articles = (await api('/admin/articles/pending')).articles
    const cards = articles.length ? articles.map((article) => `<article class="glass-card article-card"><small>PENDING REVIEW</small><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.excerpt || '')}</p><p class="article-meta">作者：${escapeHtml(article.author_username || '')}</p><div class="actions"><button class="button button-primary" data-review-action="approve" data-article-id="${article.id}">通过</button><button class="button button-glass" data-review-action="reject" data-article-id="${article.id}">驳回</button></div></article>`).join('') : '<div class="glass-card empty-state"><p>当前没有待审核文章。</p></div>'
    return layout('文章审核', '审核作者提交的文章，发布或驳回并留下原因。', `<section class="article-grid">${cards}</section>`)
  } catch (error) {
    return `<section class="glass-card"><p class="form-status">${escapeHtml(error.message)}</p></section>`
  }
}

function layout(title, description, content) {
  return `<section class="section-heading"><p class="eyebrow">Control room</p><h2>${title}</h2><p>${description}</p><div class="admin-tabs"><a href="/admin" data-link>审核</a><a href="/admin/dashboard" data-link>仪表盘</a><a href="/admin/users" data-link>用户</a><a href="/admin/tools" data-link>工具</a><a href="/admin/logs" data-link>日志</a><a href="/admin/settings" data-link>设置</a></div></section>${content}`
}

async function renderDashboard() {
  const stats = await api('/admin/stats')
  return layout('管理仪表盘', '查看当前站点的核心运行数据。', `<section class="stats-grid"><article class="glass-card stat-card"><small>USERS</small><strong>${stats.users}</strong><span>用户</span></article><article class="glass-card stat-card"><small>ARTICLES</small><strong>${stats.articles}</strong><span>文章</span></article><article class="glass-card stat-card"><small>PENDING</small><strong>${stats.pending_articles}</strong><span>待审核</span></article><article class="glass-card stat-card"><small>TOOLS</small><strong>${stats.tools}</strong><span>工具</span></article></section>`)
}

async function renderUsers() {
  const users = (await api(`/admin/users?search=${encodeURIComponent(new URLSearchParams(window.location.search).get('search') || '')}`)).users
  const current = JSON.parse(localStorage.getItem('tomori_user') || 'null')
  const rows = users.map((user) => `<article class="glass-card admin-row"><div><small>${escapeHtml(user.email)}</small><h3>${escapeHtml(user.username)}</h3><p>角色 ${user.role} · ${user.is_banned ? '已封禁' : '正常'}</p></div><div class="actions">${user.id !== current?.id ? `<button class="button button-glass" data-user-ban="${user.id}" data-banned="${user.is_banned ? 'false' : 'true'}">${user.is_banned ? '解封' : '封禁'}</button>` : ''}${current?.role >= 4 && user.id !== current.id ? `<select data-user-role="${user.id}"><option value="${user.role}">角色 ${user.role}</option><option value="0">访客</option><option value="1">普通用户</option><option value="2">作者</option><option value="3">管理员</option><option value="4">超级管理员</option></select>` : ''}</div></article>`).join('')
  return layout('用户管理', '搜索用户并管理封禁状态，超级管理员可调整角色。', `<section class="admin-list">${rows || '<div class="glass-card empty-state"><p>没有匹配的用户。</p></div>'}</section>`)
}

async function renderTools() {
  const tools = (await api('/tools')).tools
  const cards = tools.map((tool) => `<article class="glass-card admin-row"><div><small>TOOL #${tool.id}</small><h3>${escapeHtml(tool.name)}</h3><p>${escapeHtml(tool.description || '')}</p></div><div class="actions"><a class="button button-glass" href="/tools/${tool.id}" data-link>查看</a><button class="button button-glass" data-tool-delete="${tool.id}">删除</button></div></article>`).join('')
  return layout('工具管理', '管理独立 HTML 工具及其可见性。', `<section class="glass-card editor-card" data-tool-form><label for="tool-name">名称</label><input id="tool-name" name="name" required><label for="tool-description">说明</label><input id="tool-description" name="description"><label for="tool-source">来源</label><input id="tool-source" name="source"><label for="tool-html">HTML 代码</label><textarea id="tool-html" name="html_content" rows="12" required></textarea><label for="tool-visibility">可见等级</label><select id="tool-visibility" name="visibility"><option value="0">所有人</option><option value="1" selected>登录用户</option><option value="2">作者</option><option value="3">管理员</option><option value="4">超级管理员</option></select><button class="button button-primary" type="button" data-tool-save>添加工具</button><p class="form-status" data-form-status></p></section><section class="admin-list">${cards || '<div class="glass-card empty-state"><p>还没有工具。</p></div>'}</section>`)
}

async function renderLogs() {
  const logs = (await api('/admin/logs')).logs
  const rows = logs.map((log) => `<article class="glass-card admin-row"><div><small>${escapeHtml(log.created_at)} · ${escapeHtml(log.operator_username || '')}</small><h3>${escapeHtml(log.action)}</h3><p>${escapeHtml(log.detail || '')}</p></div></article>`).join('')
  return layout('操作日志', '查看关键管理操作的审计记录。', `<section class="admin-list">${rows || '<div class="glass-card empty-state"><p>暂无日志。</p></div>'}</section>`)
}

async function renderSettings() {
  const settings = (await api('/admin/settings')).settings
  const navItems = settings.find((item) => item.key === 'nav_items')?.value || '[]'
  const title = settings.find((item) => item.key === 'site_title')?.value || ''
  const description = settings.find((item) => item.key === 'site_description')?.value || ''
  return layout('系统设置', '编辑站点基础信息和动态导航。', `<form class="glass-card editor-card" data-settings-form><label for="site-title">站点标题</label><input id="site-title" name="site_title" value="${escapeHtml(title)}"><label for="site-description">站点描述</label><input id="site-description" name="site_description" value="${escapeHtml(description)}"><label for="nav-items">导航 JSON</label><textarea id="nav-items" name="nav_items" rows="10">${escapeHtml(navItems)}</textarea><button class="button button-primary" type="submit">保存设置</button><p class="form-status" data-form-status></p></form>`)
}
