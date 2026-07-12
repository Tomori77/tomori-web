import { getUser } from '../auth.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function render() {
  const user = getUser() || {}
  return `<section class="glass-card form-card"><p class="eyebrow">Your space</p><h2>个人资料</h2><p class="lede">更新你的公开资料或登录密码。</p><form data-profile-form><label for="username">用户名</label><input id="username" name="username" value="${escapeHtml(user.username || '')}" required><label for="bio">个人简介</label><input id="bio" name="bio" value="${escapeHtml(user.bio || '')}" maxlength="500" placeholder="介绍一下自己"><label for="password">新密码（可选）</label><input id="password" name="password" type="password" minlength="8" placeholder="留空则不修改"><button class="button button-primary" type="submit">保存资料</button><p class="form-status" data-form-status role="status"></p></form></section>`
}
