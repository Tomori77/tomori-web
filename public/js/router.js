const routes = [
  { pattern: /^\/$/, render: () => import('./pages/home.js') },
  { pattern: /^\/login\/?$/, render: () => import('./pages/login.js') },
  { pattern: /^\/register\/?$/, render: () => import('./pages/register.js') },
  { pattern: /^\/tools\/?$/, render: () => import('./pages/tools.js') },
  { pattern: /^\/profile\/?$/, render: () => import('./pages/profile.js') },
  { pattern: /^\/my-posts\/?$/, render: () => import('./pages/myPosts.js') },
  { pattern: /^\/editor(?:\/[^/]+)?\/?$/, render: () => import('./pages/editor.js') },
  { pattern: /^\/admin(?:\/.*)?\/?$/, render: () => import('./pages/admin.js') }
]

export async function resolve(pathname) {
  const route = routes.find(({ pattern }) => pattern.test(pathname))
  if (!route) return (await import('./pages/notFound.js')).render
  return (await route.render()).render
}
