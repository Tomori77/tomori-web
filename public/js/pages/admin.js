import { api, getUser } from '../auth.js'

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

const permissionNames = ['访客', '普通用户', '作者', '管理员', '超级管理员']

export function render() {
  return loadAdmin()
}

async function loadAdmin() {
  const section = window.location.pathname.split('/')[2] || 'dashboard'
  try {
    if (section === 'users') return renderUsers()
    if (section === 'tools') return renderTools()
    if (section === 'sections') return renderSections()
    if (section === 'articles') return renderAllArticles()
    if (section === 'logs') return renderLogs()
    if (section === 'settings') return renderSettings()
    if (section === 'dashboard') return getUser()?.role >= 4 ? renderSuperDashboard() : renderDashboard()
    if (section === 'announcements') return renderAnnouncements()
    const articles = (await api('/admin/articles/pending')).articles
    const cards = articles.length ? articles.map((article) => `<article class="glass-card article-card"><small>PENDING REVIEW</small><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.excerpt || '')}</p><p class="article-meta">作者：${escapeHtml(article.author_username || '')}</p><div class="actions"><button class="button button-primary" data-review-action="approve" data-article-id="${article.id}">通过</button><button class="button button-glass" data-review-action="reject" data-article-id="${article.id}">驳回</button></div></article>`).join('') : '<div class="glass-card empty-state"><p>当前没有待审核文章。</p></div>'
    return layout('文章审核', '审核作者提交的文章，发布或驳回并留下原因。', `<section class="article-grid">${cards}</section>`)
  } catch (error) {
    return `<section class="glass-card"><p class="form-status">${escapeHtml(error.message)}</p></section>`
  }
}

function layout(title, description, content) {
  const isSuperAdmin = getUser()?.role >= 4
  const privilegedLinks = isSuperAdmin ? '<a href="/admin/logs" data-link>操作日志</a><a href="/admin/settings" data-link>系统设置</a>' : ''
  return `<div class="admin-layout"><aside class="admin-sidebar"><p class="eyebrow">Control room</p><nav aria-label="管理后台导航"><a href="/admin" data-link>仪表盘</a><a href="/admin/articles" data-link>全部文章</a><a href="/admin/review" data-link>文章审核</a><a href="/admin/sections" data-link>板块管理</a><a href="/admin/users" data-link>用户管理</a><a href="/admin/tools" data-link>工具管理</a><a href="/admin/announcements" data-link>编辑公告</a>${privilegedLinks}</nav></aside><section class="admin-main"><div class="section-heading"><p class="eyebrow">Control room</p><h2>${title}</h2><p>${description}</p></div>${content}</section></div>`
}

async function renderDashboard() {
  const stats = await api('/admin/stats')
  return layout('管理仪表盘', '查看当前站点的核心运行数据。', `<section class="stats-grid"><article class="glass-card stat-card"><small>USERS</small><strong>${stats.users}</strong><span>用户</span></article><article class="glass-card stat-card"><small>ARTICLES</small><strong>${stats.articles}</strong><span>文章</span></article><article class="glass-card stat-card"><small>PENDING</small><strong>${stats.pending_articles}</strong><span>待审核</span></article><article class="glass-card stat-card"><small>TOOLS</small><strong>${stats.tools}</strong><span>工具</span></article></section>`)
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

async function renderSuperDashboard() {
  const data = await api('/admin/super-stats')
  const metrics = data.metrics
  const cards = [
    ['总用户数', metrics.users], ['总文章数', metrics.articles], ['待审核文章数', metrics.pending_articles],
    ['今日新增文章数', metrics.today_articles], ['工具总数', metrics.tools]
  ].map(([label, value]) => `<article class="glass-card stat-card"><small>${label}</small><strong>${value}</strong></article>`).join('')
  const activity = (title, items, render) => `<section class="glass-card activity-panel"><h3>${title}</h3><div class="activity-list">${items.length ? items.map(render).join('') : '<p class="empty-state">暂无记录。</p>'}</div></section>`
  const reviews = activity('最新审核日志', data.activity.reviews, (item) => `<div class="activity-item"><strong>${escapeHtml(item.action_label || '审核文章')}</strong><span>${escapeHtml(item.created_at)} · ${escapeHtml(item.operator_username || '系统')}</span><p>${escapeHtml(item.readable_detail || '完成文章审核')}</p></div>`)
  const registrations = activity('最新注册用户', data.activity.registrations, (item) => `<div class="activity-item"><strong>${escapeHtml(item.username)}</strong><span>${escapeHtml(item.created_at)}</span><p>${escapeHtml(item.email)}</p></div>`)
  const published = activity('最新发布文章', data.activity.published, (item) => `<a class="activity-item" href="/article/${encodeURIComponent(item.slug || item.id)}" data-link><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.created_at)}</span></a>`)
  return layout('超级管理员仪表盘', '查看站点核心指标、最近活动和资源使用情况。', `<section class="stats-grid super-stats-grid">${cards}</section><section class="activity-grid">${reviews}${registrations}${published}</section><section class="glass-card system-info"><h3>系统信息</h3><div class="system-info-grid"><div><small>数据库大小（估算）</small><strong>${formatBytes(metrics.database_bytes)}</strong></div><div><small>R2 已用容量（按媒体记录估算）</small><strong>${formatBytes(metrics.r2_bytes)}</strong></div></div></section>`)
}

async function renderUsers() {
  const current = JSON.parse(localStorage.getItem('tomori_user') || 'null')
  const query = new URLSearchParams(window.location.search)
  const groups = [
    { key: 'admins', title: '管理员', description: '超级管理员固定置顶，其余管理员按注册时间倒序。' },
    { key: 'authors', title: '作者', description: '拥有写作权限的用户，按注册时间倒序。' },
    { key: 'users', title: '普通用户', description: '访客与普通用户，按注册时间倒序。' },
    { key: 'banned', title: '封禁名单', description: '已封禁用户，按注册时间倒序。' }
  ]
  const data = await Promise.all(groups.map(async (group) => ({
    ...group,
    users: (await api(`/admin/users?group=${group.key}&search=${encodeURIComponent(query.get(`${group.key}_q`) || '')}`)).users || [],
    search: query.get(`${group.key}_q`) || ''
  })))

  const renderCard = (user) => `<article class="glass-card admin-row user-card"><div class="user-card-main"><small>${escapeHtml(user.email)} · #${user.id}</small><h3>${escapeHtml(user.username)}</h3><p class="user-permission">${permissionNames[user.role] || '未知权限'} · ${user.is_banned ? '已封禁' : '正常'}</p></div><div class="actions">${user.id !== current?.id ? `<button class="button button-glass" data-user-ban="${user.id}" data-banned="${user.is_banned ? 'false' : 'true'}">${user.is_banned ? '解封' : '封禁'}</button>` : ''}${current?.role >= 4 && user.id !== current.id ? `<div class="permission-editor"><select class="permission-select" data-user-role="${user.id}" data-current-role="${user.role}">${permissionNames.map((name, role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${name}</option>`).join('')}</select><button class="button button-primary permission-confirm" type="button" data-user-role-confirm="${user.id}" disabled>确认修改</button></div>` : ''}</div></article>`
  const renderGroup = (group) => `<section class="user-group"><div class="user-group-heading"><div><h3>${group.title}</h3><small>${group.description}</small></div></div><form class="user-search" data-user-search="${group.key}"><input name="search" value="${escapeHtml(group.search)}" placeholder="搜索用户名、邮箱或号码" aria-label="搜索${group.title}"><button class="button button-glass" type="submit">搜索</button></form><div class="admin-list">${group.users.length ? group.users.map(renderCard).join('') : '<div class="glass-card empty-state"><p>没有匹配的用户。</p></div>'}</div></section>`
  return layout('用户管理', '按权限分组管理用户。每个分组支持按用户名、邮箱或用户号码搜索。', `<section class="user-management-grid user-management-four-grid">${data.map(renderGroup).join('')}</section>`)
}

async function renderAnnouncements() {
  const announcements = (await api('/admin/announcements')).announcements || []
  const current = getUser() || {}
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
  const list = announcements.map((item) => `<article class="announcement-admin-item"><div><strong>${escapeHtml(item.title)}</strong><small>${item.is_pinned ? '置顶 · ' : ''}${escapeHtml(item.published_at)}</small></div><div class="actions"><button class="button button-glass" type="button" data-announcement-edit="${item.id}" data-announcement-title="${escapeHtml(item.title)}" data-announcement-message="${escapeHtml(item.message)}" data-announcement-priority="${item.priority}" data-announcement-pinned="${item.is_pinned}" data-announcement-published="${escapeHtml(item.published_at || '')}" data-announcement-expires="${escapeHtml(item.expires_at || '')}">编辑</button><button class="button button-glass" type="button" data-announcement-delete="${item.id}" data-announcement-title="${escapeHtml(item.title)}">删除</button></div></article>`).join('')
  return layout('编辑公告', '发布公告后会发送到所有未封禁用户的个人资料页。', `<section class="announcement-editor-layout"><aside class="glass-card announcement-history"><h3>已发送公告</h3><div class="announcement-admin-list">${list || '<p class="empty-state">暂无公告。</p>'}</div></aside><form class="glass-card editor-card announcement-form" data-announcement-form><input type="hidden" name="id"><label>公告标题<input name="title" maxlength="200" required></label><label>公告正文<textarea name="message" rows="12" maxlength="20000" required></textarea><small>支持简单 Markdown 或纯文本。</small></label><label>优先级<select name="priority"><option value="0">普通</option><option value="1">重要</option><option value="2">紧急</option></select></label><label class="setting-check"><input type="checkbox" name="is_pinned" value="true">置顶公告</label><label>发布者<input value="${escapeHtml(current.username || '')}" disabled></label><label>发布时间<input name="published_at" type="datetime-local" value="${now}"></label><label>过期时间<input name="expires_at" type="datetime-local"><small>留空表示永不过期。</small></label><div class="actions"><button class="button button-primary" type="submit">发布公告</button><button class="button button-glass" type="button" data-announcement-reset>清空</button></div><p class="form-status" data-form-status></p></form></section>`)
}

async function renderTools() {
  const tools = (await api('/tools')).tools
  const cards = tools.map((tool) => `<article class="glass-card admin-row"><div><small>TOOL #${tool.id}</small><h3>${escapeHtml(tool.name)}</h3><p>${escapeHtml(tool.description || '')}</p></div><div class="actions"><a class="button button-glass" href="/tools/${tool.id}" data-link>查看</a><button class="button button-glass" data-tool-delete="${tool.id}">删除</button></div></article>`).join('')
  return layout('工具管理', '管理独立 HTML 工具及其可见性。', `<section class="glass-card editor-card" data-tool-form><label for="tool-name">名称</label><input id="tool-name" name="name" required><label for="tool-description">说明</label><input id="tool-description" name="description"><label for="tool-source">来源</label><input id="tool-source" name="source"><label for="tool-html">HTML 代码</label><textarea id="tool-html" name="html_content" rows="12" required></textarea><label for="tool-visibility">可见等级</label><select id="tool-visibility" name="visibility"><option value="0">所有人</option><option value="1" selected>登录用户</option><option value="2">作者</option><option value="3">管理员</option><option value="4">超级管理员</option></select><button class="button button-primary" type="button" data-tool-save>添加工具</button><p class="form-status" data-form-status></p></section><section class="admin-list">${cards || '<div class="glass-card empty-state"><p>还没有工具。</p></div>'}</section>`)
}

async function renderSections() {
  const sections = (await api('/sections')).sections
  const cards = sections.map((section) => `<article class="glass-card section-admin-card"><div class="admin-row"><div><small>SECTION #${section.id}</small><h3>${escapeHtml(section.name)}</h3><p>${escapeHtml(section.description || '')} · ${section.article_count} 篇文章</p></div><div class="actions">${section.name === '默认板块' ? '<small>默认板块不可删除</small>' : `<button class="button button-glass" type="button" data-section-edit="${section.id}">编辑</button>${Number(section.article_count) === 0 ? `<button class="button button-glass" data-section-delete="${section.id}">删除</button>` : `<small class="delete-disabled">含有文章，不可直接删除</small><button class="button button-glass" data-section-force-delete="${section.id}">强制删除</button>`}`}</div></div>${section.name === '默认板块' ? '' : `<form class="section-edit-form" data-section-edit-form="${section.id}" hidden><label>板块名称<input name="name" value="${escapeHtml(section.name)}" maxlength="80" required></label><label>板块描述<input name="description" value="${escapeHtml(section.description || '')}" maxlength="300"></label><div class="actions"><button class="button button-primary" type="submit">保存修改</button><button class="button button-glass" type="button" data-section-edit-cancel="${section.id}">取消</button></div></form>`}</article>`).join('')
  return layout('板块管理', '创建独立板块，文章可以归属到对应板块。', `<form class="glass-card editor-card" data-section-form><label for="section-name">名称</label><input id="section-name" name="name" maxlength="80" required><label for="section-description">描述</label><input id="section-description" name="description" maxlength="300"><button class="button button-primary" type="submit">添加板块</button><p class="form-status" data-form-status></p></form><section class="admin-list">${cards || '<div class="glass-card empty-state"><p>暂无板块。</p></div>'}</section>`)
}

async function renderAllArticles() {
  const articles = (await api('/admin/articles/all')).articles
  const groupedSections = new Map()
  for (const article of articles) {
    const sectionName = article.section_name || '未分类'
    if (!groupedSections.has(sectionName)) groupedSections.set(sectionName, new Map())
    const authors = groupedSections.get(sectionName)
    const authorName = article.author_username || '未知作者'
    if (!authors.has(authorName)) authors.set(authorName, [])
    authors.get(authorName).push(article)
  }
  const content = [...groupedSections.entries()].map(([sectionName, authors]) => `<details class="article-group"><summary>${escapeHtml(sectionName)} <span>${[...authors.values()].flat().length}</span></summary><div class="article-group-body">${[...authors.entries()].map(([authorName, authorArticles]) => `<details class="author-group"><summary>${escapeHtml(authorName)} <span>${authorArticles.length}</span></summary><div class="admin-list">${authorArticles.map((article) => `<div class="glass-card admin-row"><a href="/article/${encodeURIComponent(article.slug)}" data-link><div><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.status)} · ${(Array.isArray(article.tags) ? article.tags : []).map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p></div><small>${escapeHtml(article.updated_at)}</small></a><button class="button button-glass" type="button" data-admin-article-delete="true" data-article-delete="${article.id}" data-article-title="${escapeHtml(article.title)}">删除</button></div>`).join('')}</div></details>`).join('')}</div></details>`).join('') || '<div class="glass-card empty-state"><p>暂无文章。</p></div>'
  return layout('全部文章', '按板块和发布人浏览全部文章，分类默认折叠。', `<section class="article-groups">${content}</section>`)
}

async function renderLogs() {
  const logs = (await api('/admin/logs')).logs
  const rows = logs.map((log) => `<article class="glass-card admin-row"><div><small>${escapeHtml(log.created_at)} · ${escapeHtml(log.operator_username || '')}</small><h3>${escapeHtml(log.action_label || log.action)}</h3><p>${escapeHtml(log.readable_detail || log.detail || '无补充信息')}</p></div></article>`).join('')
  return layout('操作日志', '查看关键管理操作的审计记录。', `<section class="admin-list">${rows || '<div class="glass-card empty-state"><p>暂无日志。</p></div>'}</section>`)
}

async function renderSettings() {
  const settings = (await api('/admin/settings')).settings
  const values = Object.fromEntries(settings.map((item) => [item.key, item.value]))
  const groups = [
    ['站点与导航', ['site_title', 'site_description', 'nav_items', 'allow_registration']],
    ['内容与限制', ['article_max_size', 'tool_max_size', 'max_title_length', 'max_excerpt_length', 'max_bio_length', 'max_tags', 'max_tag_length']],
    ['上传与请求限制', ['upload_max_size', 'login_rate_limit', 'register_rate_limit', 'article_rate_limit', 'upload_rate_limit', 'review_rate_limit']]
  ]
  const descriptions = Object.fromEntries(settings.map((item) => [item.key, item.description || '用于控制站点行为的参数']))
  const fields = groups.map(([title, keys]) => `<fieldset><legend>${title}</legend>${keys.map((key) => key === 'nav_items' ? `<label for="setting-${key}">${key}<small>${escapeHtml(descriptions[key])}</small></label><textarea id="setting-${key}" name="${key}" rows="6">${escapeHtml(values[key] || '[]')}</textarea>` : key === 'allow_registration' ? `<label class="setting-check"><input id="setting-${key}" name="${key}" type="checkbox" value="true" ${values[key] === 'true' ? 'checked' : ''}>允许注册<small>${escapeHtml(descriptions[key])}</small></label>` : `<label for="setting-${key}">${key}<small>${escapeHtml(descriptions[key])}</small></label><input id="setting-${key}" name="${key}" value="${escapeHtml(values[key] || '')}" type="number" min="1">`).join('')}</fieldset>`).join('')
  return layout('系统设置', '按分组调整站点参数。每个参数旁附有作用说明，修改后会立即影响对应功能。', `<form class="glass-card editor-card settings-form" data-settings-form>${fields}<button class="button button-primary" type="submit">保存设置</button><p class="form-status" data-form-status></p></form>`)
}
