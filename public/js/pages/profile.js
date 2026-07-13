import { api, getUser } from '../auth.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function render() {
  return loadProfile()
}

async function loadProfile() {
  const user = getUser() || {}
  let announcements = []
  try {
    announcements = (await api('/users/me/announcements')).announcements || []
  } catch {
    announcements = []
  }
  const announcementContent = announcements.length
    ? announcements.map((item) => `<article class="announcement-title ${item.is_pinned ? 'is-pinned' : ''} ${item.read_at ? 'is-read' : ''}" data-announcement-open="${item.id}" data-announcement-title="${encodeURIComponent(item.title)}" data-announcement-message="${encodeURIComponent(item.message)}" data-announcement-read="${item.read_at ? '' : item.id}"><strong>${escapeHtml(item.title)}</strong><small>${item.is_pinned ? '置顶 · ' : ''}${escapeHtml(item.created_at)}</small></article>`).join('')
    : '<p class="empty-state">暂无公告。</p>'
  return `<section class="profile-grid"><section class="glass-card form-card"><p class="eyebrow">Your space</p><h2>个人资料</h2><p class="lede">更新你的公开资料或登录密码。</p><form data-profile-form><label for="username">用户名</label><input id="username" name="username" value="${escapeHtml(user.username || '')}" required><label for="bio">个人简介</label><input id="bio" name="bio" value="${escapeHtml(user.bio || '')}" maxlength="500" placeholder="介绍一下自己"><label for="password">新密码（可选）</label><input id="password" name="password" type="password" minlength="8" placeholder="留空则不修改"><button class="button button-primary" type="submit">保存资料</button><p class="form-status" data-form-status role="status"></p></form><button class="button button-glass profile-logout" type="button" data-profile-logout>退出登录</button></section><section class="glass-card announcements-card"><p class="eyebrow">Updates</p><h2>公告</h2><div class="announcement-list">${announcementContent}</div></section></section>`
}
