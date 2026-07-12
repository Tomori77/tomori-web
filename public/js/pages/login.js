export function render() {
  return `<section class="glass-card form-card"><p class="eyebrow">Welcome back</p><h2>登录</h2><p class="lede">认证功能将在阶段 2 接入。</p><form><label for="email">邮箱</label><input id="email" type="email" autocomplete="email" placeholder="you@example.com"><label for="password">密码</label><input id="password" type="password" autocomplete="current-password" placeholder="请输入密码"><button class="button button-primary" type="button">登录</button></form><p class="form-note">还没有账号？<a href="/register" data-link>去注册</a></p></section>`
}
