const routes = [
  { pattern: /^\/$/, render: () => import('./pages/home.js'), auth: 0 },
  { pattern: /^\/articles\/?$/, render: () => import('./pages/articles.js'), auth: 0 },
  { pattern: /^\/sections\/[^/]+\/?$/, render: () => import('./pages/section.js'), auth: 0 },
  { pattern: /^\/article\/[^/]+\/?$/, render: () => import('./pages/article.js'), auth: 0 },
  { pattern: /^\/login\/?$/, render: () => import('./pages/login.js'), auth: 0 },
  { pattern: /^\/register\/?$/, render: () => import('./pages/register.js'), auth: 0 },
  { pattern: /^\/tools(?:\/[^/]+)?\/?$/, render: () => import('./pages/tools.js'), auth: 0 },
  { pattern: /^\/profile\/?$/, render: () => import('./pages/profile.js'), auth: 1 },
  { pattern: /^\/my-posts\/?$/, render: () => import('./pages/myPosts.js'), auth: 1 },
  { pattern: /^\/editor(?:\/[^/]+)?\/?$/, render: () => import('./pages/editor.js'), auth: 2 },
  { pattern: /^\/admin(?:\/.*)?\/?$/, render: () => import('./pages/admin.js'), auth: 3 }
]

export async function resolve(pathname) {
  const route = routes.find(({ pattern }) => pattern.test(pathname))
  if (!route) return { render: (await import('./pages/notFound.js')).render, auth: 0 }
  return { render: (await route.render()).render, auth: route.auth }
}
