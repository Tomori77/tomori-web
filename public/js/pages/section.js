import { api } from '../auth.js'

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function render() {
  return loadSection()
}

async function loadSection() {
  const slug = decodeURIComponent(window.location.pathname.split('/').pop())
  try {
    const data = await api(`/sections/${encodeURIComponent(slug)}`)
    const articles = data.articles || []
    const content = articles.length
      ? articles.map((article) => `<a class="glass-card article-card" href="/article/${encodeURIComponent(article.slug)}" data-link><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.excerpt || '查看这篇文章')}</p><div class="tag-row">${(Array.isArray(article.tags) ? article.tags : []).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</div><small>${escapeHtml(article.author_username || '')}</small></a>`).join('')
      : '<div class="glass-card empty-state"><h3>暂无文章</h3><p>这个板块还没有发布文章。</p></div>'
    return `<section class="section-heading"><p class="eyebrow">Section</p><h2>${escapeHtml(data.section.name)}</h2><p>${escapeHtml(data.section.description || '浏览这个独立板块的文章。')}</p></section><section class="article-grid">${content}</section>`
  } catch (error) {
    return `<section class="glass-card"><p class="form-status">${escapeHtml(error.message)}</p></section>`
  }
}
