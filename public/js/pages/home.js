export function render() {
  return `
    <section class="hero">
      <p class="eyebrow">A quiet place to make and share</p>
      <h1>让想法，拥有一个舒展的空间。</h1>
      <p class="lede">Tomori Web 是一个轻量的内容社区。写下文章，分享工具，在清晰而有呼吸感的界面里慢慢构建自己的数字角落。</p>
      <div class="actions">
        <a class="button button-primary" href="/register" data-link>开始使用</a>
        <a class="button button-glass" href="/tools" data-link>探索工具</a>
      </div>
    </section>
    <section class="feature-grid" aria-label="平台特性">
      <article class="glass-card"><div class="icon-tile">✦</div><h3>专注表达</h3><p>以简单的文章流程记录知识、灵感和正在发生的思考。</p></article>
      <article class="glass-card"><div class="icon-tile">◌</div><h3>温和协作</h3><p>清晰的权限与审核机制，让内容分享保持秩序与安全。</p></article>
      <article class="glass-card"><div class="icon-tile">⌘</div><h3>实用工具</h3><p>把独立 HTML 工具集中在一个轻盈、易访问的工作台中。</p></article>
    </section>`
}
