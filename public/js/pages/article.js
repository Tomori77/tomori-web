import { api } from '../auth.js'
import { renderMarkdown } from '../markdown.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function render() {
  const slug = decodeURIComponent(window.location.pathname.split('/').pop())
  try {
    const data = await api(`/articles/${encodeURIComponent(slug)}`)
    const article = data.article
    const tags = Array.isArray(article.tags) ? article.tags : []
    return `<article class="article-detail"><p class="eyebrow">Published article</p><h1>${escapeHtml(article.title)}</h1><p class="article-meta">${escapeHtml(article.author_username || 'Tomori Web')} · ${escapeHtml(article.updated_at)}</p><div class="article-taxonomy"><a href="/sections/${encodeURIComponent(article.section_slug || '')}" data-link>${escapeHtml(article.section_name || '未分类')}</a><div class="tag-row">${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</div></div><div class="article-content">${renderMarkdown(article.content)}</div></article>`
  } catch (error) {
    return `<section class="glass-card form-card"><p class="eyebrow">Article</p><h2>文章无法打开</h2><p class="lede">${escapeHtml(error.message)}</p><a class="button button-primary" href="/" data-link>返回首页</a></section>`
  }
}
