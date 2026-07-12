import { api } from '../auth.js'

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function render() {
  return loadPosts()
}

async function loadPosts() {
  const status = new URLSearchParams(window.location.search).get('status') || ''
  try {
    const articles = (await api(`/users/me/articles${status ? `?status=${encodeURIComponent(status)}` : ''}`)).articles
    const cards = articles.length ? articles.map((article) => `<article class="glass-card article-card"><small class="status-${article.status}">${escapeHtml(article.status)}</small><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.excerpt || '')}</p><div class="actions"><a class="button button-glass" href="/editor/${article.id}" data-link>编辑</a>${article.status === 'published' ? `<a class="button button-primary" href="/article/${encodeURIComponent(article.slug)}" data-link>查看</a>` : ''}</div>${article.rejected_reason ? `<p class="form-status">${escapeHtml(article.rejected_reason)}</p>` : ''}</article>`).join('') : '<div class="glass-card empty-state"><p>当前筛选下没有文章。</p></div>'
    return `<section class="section-heading"><p class="eyebrow">Your writing</p><h2>我的文章</h2><p>管理草稿、提交审核并查看发布状态。</p><div class="filter-row"><select data-status-filter><option value="" ${!status ? 'selected' : ''}>全部状态</option><option value="draft" ${status === 'draft' ? 'selected' : ''}>草稿</option><option value="pending" ${status === 'pending' ? 'selected' : ''}>审核中</option><option value="published" ${status === 'published' ? 'selected' : ''}>已发布</option><option value="rejected" ${status === 'rejected' ? 'selected' : ''}>已驳回</option></select><a class="button button-primary" href="/editor" data-link>新建文章</a></div></section><section class="article-grid">${cards}</section>`
  } catch (error) {
    return `<section class="glass-card"><p class="form-status">${escapeHtml(error.message)}</p></section>`
  }
}
