const TOKEN_KEY = 'tomori_token'
const USER_KEY = 'tomori_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function setSession({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`/api${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || '请求失败')
  return data
}

export async function loadSession() {
  if (!getToken()) return null
  try {
    const data = await api('/auth/me')
    setUser(data.user)
    return data.user
  } catch {
    clearSession()
    return null
  }
}
