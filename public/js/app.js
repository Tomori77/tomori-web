import { resolve } from './router.js'
import { api, clearSession, getUser, loadSession, setSession, setUser } from './auth.js'

const app = document.querySelector('#app')
const nav = document.querySelector('.site-nav')
const menuToggle = document.querySelector('.menu-toggle')

function navigate(path) {
  window.history.pushState({}, '', path)
  closeMenu()
  render()
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

async function updateNavigation(user) {
  let navItems = [{ label: '首页', path: '/' }, { label: '工具', path: '/tools' }]
  try {
    navItems = (await api('/settings/nav_items')).nav_items
      .filter((item) => item && typeof item.label === 'string' && typeof item.path === 'string' && item.path.startsWith('/') && !item.path.startsWith('//'))
  } catch {
    // Keep the built-in navigation when settings are unavailable.
  }
  const links = navItems.map((item) => `<a href="${escapeHtml(item.path)}" data-link>${escapeHtml(item.label)}</a>`)
  if (user) {
    links.push('<a href="/my-posts" data-link>我的文章</a>')
    links.push('<a href="/editor" data-link>写文章</a>')
    links.push('<a href="/profile" data-link>个人资料</a>')
    if (user.role >= 3) links.push('<a href="/admin" data-link>管理后台</a>')
    links.push('<button class="nav-logout" type="button" data-logout>退出</button>')
  } else {
    links.push('<a href="/login" data-link>登录</a>')
    links.push('<a class="nav-action" href="/register" data-link>注册</a>')
  }
  nav.innerHTML = links.join('')
}

function closeMenu() {
  nav?.classList.remove('is-open')
  menuToggle?.setAttribute('aria-expanded', 'false')
}

async function render() {
  const route = await resolve(window.location.pathname)
  const user = getUser()
  if (route.auth && (!user || user.role < route.auth)) {
    sessionStorage.setItem('tomori_redirect', window.location.pathname)
    navigate(route.auth >= 3 && user ? '/' : '/login')
    return
  }
  app.innerHTML = `<div class="page-enter">${await route.render()}</div>`
  app.focus({ preventScroll: true })
  await updateNavigation(user)
  document.querySelectorAll('[data-link]').forEach((link) => {
    link.setAttribute('aria-current', link.getAttribute('href') === window.location.pathname ? 'page' : 'false')
  })
  bindPageActions()
}

function showFormError(message) {
  const status = document.querySelector('[data-form-status]')
  if (status) status.textContent = message
}

async function bindPageActions() {
  const form = document.querySelector('[data-auth-form]')
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const formData = new FormData(form)
      const path = form.dataset.authForm === 'register' ? '/auth/register' : '/auth/login'
      try {
        const data = await api(path, {
          method: 'POST',
          body: JSON.stringify(Object.fromEntries(formData))
        })
        setSession(data)
        const redirect = sessionStorage.getItem('tomori_redirect') || '/'
        sessionStorage.removeItem('tomori_redirect')
        navigate(redirect)
      } catch (error) {
        showFormError(error.message)
      }
    })
  }

  const profileForm = document.querySelector('[data-profile-form]')
  if (profileForm) {
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
        const profile = Object.fromEntries(new FormData(profileForm))
        if (!profile.password) delete profile.password
        const data = await api('/users/me', {
          method: 'PUT',
          body: JSON.stringify(profile)
        })
        setUser(data.user)
        showFormError('资料已更新')
        updateNavigation(data.user)
      } catch (error) {
        showFormError(error.message)
      }
    })
  }

  const articleForm = document.querySelector('[data-article-form]')
  if (articleForm) {
    articleForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const form = Object.fromEntries(new FormData(articleForm))
      const articleId = articleForm.dataset.articleId
      try {
        const data = await api(articleId ? `/articles/${articleId}` : '/articles', {
          method: articleId ? 'PUT' : 'POST',
          body: JSON.stringify({
            ...form,
            visibility: Number(form.visibility)
          })
        })
        articleForm.dataset.articleId = String(data.article.id)
        const submitButton = articleForm.querySelector('[data-submit-review]')
        if (submitButton) submitButton.hidden = false
        showFormError('草稿已保存')
        if (!articleId) window.history.replaceState({}, '', `/editor/${data.article.id}`)
      } catch (error) {
        showFormError(error.message)
      }
    })

    articleForm.querySelector('[data-submit-review]')?.addEventListener('click', async () => {
      const articleId = articleForm.dataset.articleId
      if (!articleId) return showFormError('请先保存草稿')
      try {
        await api(`/articles/${articleId}/submit`, { method: 'POST' })
        showFormError('文章已提交审核')
      } catch (error) {
        showFormError(error.message)
      }
    })

    articleForm.querySelector('[data-upload]')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0]
      if (!file) return
      const data = new FormData()
      data.append('file', file)
      try {
        const response = await api('/upload', { method: 'POST', body: data })
        const content = articleForm.querySelector('[name="content"]')
        content.value += `\n\n![${response.filename}](${response.url})\n`
        showFormError('图片已上传')
      } catch (error) {
        showFormError(error.message)
      }
    })
  }

  document.querySelectorAll('[data-status-filter]').forEach((select) => {
    select.addEventListener('change', () => {
      const path = `${window.location.pathname}?status=${encodeURIComponent(select.value)}`
      window.history.pushState({}, '', path)
      render()
    })
  })

  document.querySelectorAll('[data-review-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.articleId
      const action = button.dataset.reviewAction
      const reason = action === 'reject' ? window.prompt('请输入驳回原因') : null
      if (action === 'reject' && !reason) return
      try {
        await api(`/admin/articles/${id}/review`, {
          method: 'PUT',
          body: JSON.stringify({ action, reason })
        })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelector('[data-tool-save]')?.addEventListener('click', async () => {
    const form = document.querySelector('[data-tool-form]')
    const fields = Object.fromEntries(new FormData(form))
    fields.visibility = Number(fields.visibility)
    try {
      await api('/tools', { method: 'POST', body: JSON.stringify({ ...fields, html_content: fields.html_content }) })
      showFormError('工具已添加')
      render()
    } catch (error) {
      showFormError(error.message)
    }
  })

  document.querySelectorAll('[data-tool-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('确定删除这个工具吗？')) return
      try {
        await api(`/tools/${button.dataset.toolDelete}`, { method: 'DELETE' })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelectorAll('[data-user-ban]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api(`/admin/users/${button.dataset.userBan}/ban`, { method: 'PUT', body: JSON.stringify({ is_banned: button.dataset.banned === 'true' }) })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelectorAll('[data-user-role]').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api(`/admin/users/${select.dataset.userRole}/role`, { method: 'PUT', body: JSON.stringify({ role: Number(select.value) }) })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  const settingsForm = document.querySelector('[data-settings-form]')
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const fields = Object.fromEntries(new FormData(settingsForm))
      try {
        await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings: { site_title: fields.site_title, site_description: fields.site_description, nav_items: JSON.parse(fields.nav_items) } }) })
        showFormError('设置已保存')
      } catch (error) {
        showFormError(error.message)
      }
    })
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]')
  if (!link || link.origin !== window.location.origin) return
  event.preventDefault()
  navigate(link.pathname)
})

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-logout]')) return
  clearSession()
  navigate('/')
})

menuToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open')
  menuToggle.setAttribute('aria-expanded', String(isOpen))
})

window.addEventListener('popstate', render)
loadSession().finally(render)
