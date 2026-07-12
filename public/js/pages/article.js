import { api } from '../auth.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function markdown(value) {
  return escapeHtml(value)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/!\[([^\]]*)\]\((\/files\/[\w./-]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
    .replace(/^(?!<h[1-3]>)(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '')
}

export async function render() {
  const slug = decodeURIComponent(window.location.pathname.split('/').pop())
  try {
    const data = await api(`/articles/${encodeURIComponent(slug)}`)
    const article = data.article
    return `<article class="article-detail"><p class="eyebrow">Published article</p><h1>${escapeHtml(article.title)}</h1><p class="article-meta">${escapeHtml(article.author_username || 'Tomori Web')} · ${escapeHtml(article.updated_at)}</p><div class="article-content">${markdown(article.content)}</div></article>`
  } catch (error) {
    return `<section class="glass-card form-card"><p class="eyebrow">Article</p><h2>文章无法打开</h2><p class="lede">${escapeHtml(error.message)}</p><a class="button button-primary" href="/" data-link>返回首页</a></section>`
  }
}
