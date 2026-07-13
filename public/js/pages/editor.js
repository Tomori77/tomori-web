import { api } from '../auth.js'

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function render() {
  return loadEditor()
}

async function loadEditor() {
  const id = window.location.pathname.split('/')[2]
  let article = { title: '', content: '', excerpt: '', visibility: 1, status: 'draft' }
  let sections = []
  try {
    sections = (await api('/sections')).sections || []
  } catch {
    sections = []
  }
  if (id) {
    try {
      article = (await api(`/articles/${id}`)).article
    } catch (error) {
      return `<section class="glass-card"><p class="form-status">${escapeHtml(error.message)}</p></section>`
    }
  }
  const canSubmit = ['draft', 'rejected', 'published'].includes(article.status)
  const sectionOptions = sections.map((section) => `<option value="${section.id}" ${Number(article.section_id) === section.id ? 'selected' : ''}>${escapeHtml(section.name)}</option>`).join('')
  const tags = Array.isArray(article.tags) ? article.tags.join(', ') : String(article.tags || '').replace(/[\[\]"]/g, '')
  return `<section class="section-heading"><p class="eyebrow">Write in public</p><h2>${id ? '编辑文章' : '新建文章'}</h2><p>先保存草稿，再提交审核。文章内容限制为 256 KB。</p></section><form class="glass-card editor-card" data-article-form data-article-id="${id || ''}"><div class="editor-layout"><div class="editor-pane"><label for="title">标题</label><input id="title" name="title" value="${escapeHtml(article.title)}" maxlength="200" required><label for="excerpt">摘要</label><input id="excerpt" name="excerpt" value="${escapeHtml(article.excerpt)}" maxlength="300"><label for="section-id">板块</label><select id="section-id" name="section_id"><option value="">未分类</option>${sectionOptions}</select><label for="tags">Tags</label><input id="tags" name="tags" value="${escapeHtml(tags)}" placeholder="用逗号分隔，例如：cloudflare, frontend"><label for="content">Markdown 内容</label><textarea id="content" name="content" rows="18" required>${escapeHtml(article.content)}</textarea></div><aside class="preview-pane"><div class="preview-heading">实时预览</div><div class="article-preview" data-article-preview></div></aside></div><div class="editor-tools"><label class="file-button">上传图片<input type="file" data-upload accept="image/jpeg,image/png,image/gif,image/webp" hidden></label><label for="visibility">可见等级</label><select id="visibility" name="visibility"><option value="0" ${article.visibility === 0 ? 'selected' : ''}>所有人</option><option value="1" ${article.visibility === 1 ? 'selected' : ''}>登录用户</option><option value="2" ${article.visibility === 2 ? 'selected' : ''}>作者</option><option value="3" ${article.visibility === 3 ? 'selected' : ''}>管理员</option><option value="4" ${article.visibility === 4 ? 'selected' : ''}>超级管理员</option></select></div><div class="actions"><button class="button button-primary" type="submit">保存草稿</button><button class="button button-glass" type="button" data-submit-review ${!id || !canSubmit ? 'hidden' : ''}>提交审核</button></div><p class="form-status" data-form-status role="status"></p></form>`
}
