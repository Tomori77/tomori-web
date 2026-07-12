import { api } from '../auth.js'

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function render() {
  return loadTools()
}

async function loadTools() {
  const id = window.location.pathname.split('/')[2]
  try {
    if (id) {
      const tool = (await api(`/tools/${encodeURIComponent(id)}`)).tool
      return `<section class="section-heading"><p class="eyebrow">Utility ${escapeHtml(tool.id)}</p><h2>${escapeHtml(tool.name)}</h2><p>${escapeHtml(tool.description || '')}</p></section><section class="glass-card tool-frame-card"><iframe title="${escapeHtml(tool.name)}" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeHtml(tool.html_content)}"></iframe></section><p class="form-note"><a href="/tools" data-link>返回工具列表</a></p>`
    }
    const tools = (await api('/tools')).tools
    const cards = tools.length ? tools.map((tool) => `<a class="glass-card article-card" href="/tools/${tool.id}" data-link><p class="eyebrow">UTILITY</p><h3>${escapeHtml(tool.name)}</h3><p>${escapeHtml(tool.description || '独立 HTML 工具')}</p><small>${escapeHtml(tool.creator_username || '')}</small></a>`).join('') : '<div class="glass-card empty-state"><p>还没有可用工具。</p></div>'
    return `<section class="section-heading"><p class="eyebrow">Small utilities</p><h2>工具工作台</h2><p>在隔离环境中运行社区提供的独立工具。</p></section><section class="article-grid">${cards}</section>`
  } catch (error) {
    return `<section class="glass-card"><p class="form-status">${escapeHtml(error.message)}</p></section>`
  }
}
