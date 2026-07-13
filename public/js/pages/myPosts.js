import { api } from '../auth.js'

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function render() {
  return loadPosts()
}

async function loadPosts() {
  const status = new URLSearchParams(window.location.search).get('status') || ''
  const search = new URLSearchParams(window.location.search).get('q') || ''
  try {
    const notificationData = await api('/users/me/article-notifications')
    const query = new URLSearchParams()
    if (status) query.set('status', status)
    if (search) query.set('q', search)
    const articles = (await api(`/users/me/articles${query.toString() ? `?${query}` : ''}`)).articles
    const notifications = notificationData.notifications || []
    const statusLabels = { draft: '草稿', pending: '审核中', published: '已发布', rejected: '已驳回' }
    const inbox = notifications.length
      ? `<div class="article-inbox-list">${notifications.map((item) => `<article class="article-inbox-item ${item.read_at ? 'is-read' : ''}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.created_at)}</small><p>${escapeHtml(item.message)}</p></article>`).join('')}</div>`
      : '<p class="empty-state">暂无文章提醒。</p>'
    const cards = articles.length ? articles.map((article) => `<article class="glass-card article-card my-post-card"><div class="my-post-title"><h3>${escapeHtml(article.title)}</h3><small class="status-${article.status}">${statusLabels[article.status] || escapeHtml(article.status)}</small></div><p>${escapeHtml(article.excerpt || '')}</p><small>${escapeHtml(article.section_name || '未分类')} · ${(Array.isArray(article.tags) ? article.tags : []).map((tag) => `#${escapeHtml(tag)}`).join(' ')}</small><div class="actions"><a class="button button-glass" href="/editor/${article.id}" data-link>编辑</a>${article.status === 'published' ? `<a class="button button-primary" href="/article/${encodeURIComponent(article.slug)}" data-link>查看</a>` : ''}<button class="button button-glass" type="button" data-article-delete="${article.id}" data-article-title="${escapeHtml(article.title)}">删除</button></div>${article.rejected_reason ? `<p class="form-status">${escapeHtml(article.rejected_reason)}</p>` : ''}</article>`).join('') : '<div class="glass-card empty-state"><p>当前筛选下没有文章。</p></div>'
    return `<section class="section-heading"><p class="eyebrow">Your writing</p><h2>我的文章</h2><p>管理草稿、提交审核并查看发布状态。</p><div class="filter-row"><select data-status-filter><option value="" ${!status ? 'selected' : ''}>全部状态</option><option value="draft" ${status === 'draft' ? 'selected' : ''}>草稿</option><option value="pending" ${status === 'pending' ? 'selected' : ''}>审核中</option><option value="published" ${status === 'published' ? 'selected' : ''}>已发布</option><option value="rejected" ${status === 'rejected' ? 'selected' : ''}>已驳回</option></select><form class="my-post-search" data-my-post-search><input name="q" value="${escapeHtml(search)}" placeholder="输入关键词，用空格分隔" aria-label="我的文章关键词搜索"><button class="button button-glass" type="submit">搜索</button></form><a class="button button-primary" href="/editor" data-link>新建文章</a></div></section><section class="my-posts-layout"><aside class="glass-card article-inbox" data-article-inbox data-unread="${notifications.some((item) => !item.read_at) ? '1' : '0'}"><p class="eyebrow">Inbox</p><h3>文章收信箱</h3>${inbox}</aside><section class="my-posts-list">${cards}</section></section>`
  } catch (error) {
    return `<section class="glass-card"><p class="form-status">${escapeHtml(error.message)}</p></section>`
  }
}
