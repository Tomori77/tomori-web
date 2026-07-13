import { api } from '../auth.js'

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function articleCard(article) {
  const tags = Array.isArray(article.tags) ? article.tags : []
  return `<a class="glass-card article-card" href="/article/${encodeURIComponent(article.slug)}" data-link><div class="article-card-heading"><h3>${escapeHtml(article.title)}</h3><small>${escapeHtml(article.section_name || '未分类')}</small></div><p>${escapeHtml(article.excerpt || '查看这篇文章')}</p><div class="tag-row">${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</div><small>${escapeHtml(article.author_username || '')}</small></a>`
}

export function render() {
  return loadArticles()
}

async function loadArticles() {
  const q = new URLSearchParams(window.location.search).get('q') || ''
  try {
    const [sectionData, articleData] = await Promise.all([
      api('/sections'),
      api(`/articles${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    ])
    const sections = sectionData.sections || []
    const articles = articleData.articles || []
    const sectionCards = sections.length
      ? sections.map((section) => `<a class="glass-card section-card" href="/sections/${encodeURIComponent(section.slug)}" data-link><p class="eyebrow">SECTION</p><h3>${escapeHtml(section.name)}</h3><p>${escapeHtml(section.description || '浏览该板块文章')}</p><small>${section.article_count} 篇文章</small></a>`).join('')
      : '<div class="glass-card empty-state"><h3>暂无文章</h3><p>还没有创建板块或发布文章。</p></div>'
    const articleContent = articles.length
      ? articles.map(articleCard).join('')
      : '<div class="glass-card empty-state"><h3>暂无文章</h3><p>没有找到符合条件的文章。</p></div>'
    return `<section class="section-heading"><p class="eyebrow">Reading room</p><h2>文章</h2><p>按板块浏览内容，输入一个或多个关键词搜索标题、板块和 tags。</p><form class="search-bar" data-article-search><input name="q" value="${escapeHtml(q)}" placeholder="输入关键词，用空格分隔" aria-label="文章关键词搜索"><button class="button button-primary" type="submit">搜索</button></form></section><section><div class="content-section-title"><h3>所有板块</h3></div><div class="section-grid">${sectionCards}</div></section><section class="article-results"><div class="content-section-title"><h3>${q ? `搜索结果：${escapeHtml(q)}` : '全部文章'}</h3></div><div class="article-grid">${articleContent}</div></section>`
  } catch (error) {
    return `<section class="glass-card"><p class="form-status">${escapeHtml(error.message)}</p></section>`
  }
}
