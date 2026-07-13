import { resolve } from './router.js'
import { api, clearSession, getUser, loadSession, setSession, setUser } from './auth.js'
import { renderMarkdown } from './markdown.js'

const app = document.querySelector('#app')
const nav = document.querySelector('.site-nav')
const menuToggle = document.querySelector('.menu-toggle')
const routeLoading = document.querySelector('#route-loading')
let renderVersion = 0

function setLoading(visible) {
  if (!routeLoading) return
  routeLoading.hidden = !visible
}

function navigate(path) {
  window.history.pushState({}, '', path)
  closeMenu()
  render()
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

async function updateNavigation(user) {
  let navItems = [{ label: '首页', path: '/' }, { label: '文章', path: '/articles' }, { label: '工具', path: '/tools' }]
  try {
    const configuredItems = (await api('/settings/nav_items')).nav_items
      .filter((item) => item && typeof item.label === 'string' && typeof item.path === 'string' && item.path.startsWith('/') && !item.path.startsWith('//'))
    const defaults = [{ label: '文章', path: '/articles', icon: 'book' }]
    navItems = [...configuredItems, ...defaults.filter((item) => !configuredItems.some((configured) => configured.path === item.path))]
  } catch {
    // Keep the built-in navigation when settings are unavailable.
  }
  const links = navItems.map((item) => `<a href="${escapeHtml(item.path)}" data-link>${escapeHtml(item.label)}</a>`)
  if (user) {
    const articleUnread = Number(user.article_notification_unread_count || 0)
    links.push(`<a href="/my-posts" data-link>我的文章${articleUnread ? '<span class="announcement-dot" aria-label="有新的文章提醒"></span>' : ''}</a>`)
    links.push('<a href="/editor" data-link>写文章</a>')
    if (user.role >= 3) links.push('<a href="/admin" data-link>管理后台</a>')
    const unread = Number(user.announcement_unread_count || 0)
    links.push(`<a class="nav-user" href="/profile" data-link>${escapeHtml(user.username || '')}${unread ? '<span class="announcement-dot" aria-label="有新公告"></span>' : ''}</a>`)
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
  const version = ++renderVersion
  const path = window.location.pathname
  let loadingTimer
  loadingTimer = window.setTimeout(() => setLoading(true), 150)

  try {
    const route = await resolve(path)
    const user = getUser()
    if (version !== renderVersion) return
    if (route.auth && user && user.role < route.auth) {
      if (route.auth === 2) {
        await updateNavigation(user)
        app.innerHTML = '<div class="page-enter"><section class="glass-card permission-denied"><p class="eyebrow">Access restricted</p><h2>没有权限</h2><p>没有权限，请联系管理员添加。</p><a class="button button-primary" href="/" data-link>返回首页</a></section></div>'
        app.focus({ preventScroll: true })
        bindPageActions()
        return
      }
      navigate('/')
      return
    }
    if (route.auth && !user) {
      sessionStorage.setItem('tomori_redirect', path)
      navigate('/login')
      return
    }

    // Keep the current page visible until all new page data and navigation are ready.
    const html = await route.render()
    await updateNavigation(user)
    if (version !== renderVersion) return

    app.innerHTML = `<div class="page-enter">${html}</div>`
    app.focus({ preventScroll: true })
    document.querySelectorAll('[data-link]').forEach((link) => {
      link.setAttribute('aria-current', link.getAttribute('href') === window.location.pathname ? 'page' : 'false')
    })
    bindPageActions()
  } finally {
    window.clearTimeout(loadingTimer)
    if (version === renderVersion) setLoading(false)
  }
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

  document.querySelectorAll('[data-announcement-open]').forEach((announcement) => {
    announcement.addEventListener('click', async () => {
      try {
        if (announcement.dataset.announcementRead) {
          await api(`/users/me/announcements/${announcement.dataset.announcementRead}/read`, { method: 'PUT' })
          announcement.dataset.announcementRead = ''
          announcement.classList.add('is-read')
          const user = getUser()
          if (user) {
            user.announcement_unread_count = Math.max(Number(user.announcement_unread_count || 0) - 1, 0)
            setUser(user)
            updateNavigation(user)
          }
        }
        let dialog = document.querySelector('#announcement-dialog')
        if (!dialog) {
          dialog = document.createElement('dialog')
          dialog.id = 'announcement-dialog'
          dialog.className = 'announcement-dialog'
          document.body.append(dialog)
        }
        const title = decodeURIComponent(announcement.dataset.announcementTitle || '')
        const message = decodeURIComponent(announcement.dataset.announcementMessage || '')
        dialog.innerHTML = `<button class="dialog-close" type="button" data-dialog-close aria-label="关闭">×</button><p class="eyebrow">Announcement</p><h2>${escapeHtml(title)}</h2><div class="announcement-dialog-content">${renderMarkdown(message)}</div>`
        dialog.showModal()
        dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close())
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelector('[data-profile-logout]')?.addEventListener('click', () => {
    clearSession()
    navigate('/')
  })

  const articleForm = document.querySelector('[data-article-form]')
  if (articleForm) {
    const preview = articleForm.querySelector('[data-article-preview]')
    const contentField = articleForm.querySelector('[name="content"]')
    const updatePreview = () => {
      if (!preview || !contentField) return
      preview.innerHTML = renderMarkdown(contentField.value) || '<p class="preview-empty">开始输入，右侧会显示预览。</p>'
    }
    contentField?.addEventListener('input', updatePreview)
    updatePreview()
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
      const query = new URLSearchParams(window.location.search)
      if (select.value) query.set('status', select.value)
      else query.delete('status')
      const path = `${window.location.pathname}${query.toString() ? `?${query}` : ''}`
      window.history.pushState({}, '', path)
      render()
    })
  })

  const myPostSearch = document.querySelector('[data-my-post-search]')
  myPostSearch?.addEventListener('submit', (event) => {
    event.preventDefault()
    const query = new URLSearchParams(window.location.search)
    const value = new FormData(myPostSearch).get('q')?.toString().trim() || ''
    if (value) query.set('q', value)
    else query.delete('q')
    window.history.pushState({}, '', `${window.location.pathname}${query.toString() ? `?${query}` : ''}`)
    render()
  })

  const articleInbox = document.querySelector('[data-article-inbox]')
  if (articleInbox && Number(articleInbox.dataset.unread || 0) > 0) {
    api('/users/me/article-notifications/read', { method: 'PUT' }).then(() => {
      const user = getUser()
      if (!user) return
      user.article_notification_unread_count = 0
      setUser(user)
      updateNavigation(user)
    }).catch(() => {})
  }

  const searchForm = document.querySelector('[data-article-search]')
  searchForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    const query = new FormData(searchForm).get('q')?.toString().trim() || ''
    window.history.pushState({}, '', `/articles${query ? `?q=${encodeURIComponent(query)}` : ''}`)
    render()
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

  document.querySelectorAll('[data-article-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm(`确定永久删除文章《${button.dataset.articleTitle || ''}》吗？此操作不可撤销。`)) return
      try {
        const path = button.dataset.adminArticleDelete ? `/admin/articles/${button.dataset.articleDelete}` : `/articles/${button.dataset.articleDelete}`
        await api(path, { method: 'DELETE' })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelector('[data-section-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = document.querySelector('[data-section-form]')
    const fields = Object.fromEntries(new FormData(form))
    try {
      await api('/sections', { method: 'POST', body: JSON.stringify(fields) })
      render()
    } catch (error) {
      showFormError(error.message)
    }
  })

  document.querySelectorAll('[data-section-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = document.querySelector(`[data-section-edit-form="${button.dataset.sectionEdit}"]`)
      if (form) form.hidden = !form.hidden
    })
  })

  document.querySelectorAll('[data-section-edit-cancel]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = document.querySelector(`[data-section-edit-form="${button.dataset.sectionEditCancel}"]`)
      if (form) form.hidden = true
    })
  })

  document.querySelectorAll('[data-section-edit-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const fields = Object.fromEntries(new FormData(form))
      try {
        await api(`/sections/${form.dataset.sectionEditForm}`, { method: 'PUT', body: JSON.stringify(fields) })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  const announcementForm = document.querySelector('[data-announcement-form]')
  if (announcementForm) {
    announcementForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const fields = Object.fromEntries(new FormData(announcementForm))
      fields.is_pinned = announcementForm.querySelector('[name="is_pinned"]')?.checked === true
      try {
        const id = fields.id
        await api(id ? `/admin/announcements/${id}` : '/admin/announcements', { method: id ? 'PUT' : 'POST', body: JSON.stringify(fields) })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
    announcementForm.querySelector('[data-announcement-reset]')?.addEventListener('click', () => announcementForm.reset())
  }

  document.querySelectorAll('[data-announcement-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = document.querySelector('[data-announcement-form]')
      if (!form) return
      form.elements.id.value = button.dataset.announcementEdit
      form.elements.title.value = button.dataset.announcementTitle || ''
      form.elements.message.value = button.dataset.announcementMessage || ''
      form.elements.priority.value = button.dataset.announcementPriority || '0'
      form.elements.is_pinned.checked = button.dataset.announcementPinned === '1'
      form.elements.published_at.value = (button.dataset.announcementPublished || '').replace(' ', 'T').slice(0, 16)
      form.elements.expires_at.value = (button.dataset.announcementExpires || '').replace(' ', 'T').slice(0, 16)
      form.querySelector('button[type="submit"]').textContent = '保存公告'
      form.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })

  document.querySelectorAll('[data-announcement-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm(`确定删除公告《${button.dataset.announcementTitle || ''}》吗？`)) return
      try {
        await api(`/admin/announcements/${button.dataset.announcementDelete}`, { method: 'DELETE' })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelectorAll('[data-section-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('确定删除这个空板块吗？含有文章的板块不可删除。')) return
      try {
        await api(`/sections/${button.dataset.sectionDelete}`, { method: 'DELETE' })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelectorAll('[data-section-force-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('该板块包含文章。强制删除后，文章会全部移入默认板块，并通知对应作者。继续吗？')) return
      try {
        await api(`/sections/${button.dataset.sectionForceDelete}?force=true`, { method: 'DELETE' })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelectorAll('[data-user-ban]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm(`${button.textContent}该用户吗？`)) return
      try {
        await api(`/admin/users/${button.dataset.userBan}/ban`, { method: 'PUT', body: JSON.stringify({ is_banned: button.dataset.banned === 'true' }) })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelectorAll('[data-user-role]').forEach((select) => {
    select.addEventListener('change', () => {
      const button = document.querySelector(`[data-user-role-confirm="${select.dataset.userRole}"]`)
      if (button) button.disabled = Number(select.value) === Number(select.dataset.currentRole)
    })
  })

  document.querySelectorAll('[data-user-role-confirm]').forEach((button) => {
    button.addEventListener('click', async () => {
      const select = document.querySelector(`[data-user-role="${button.dataset.userRoleConfirm}"]`)
      if (!select || Number(select.value) === Number(select.dataset.currentRole)) return
      if (!window.confirm(`确定将该用户权限修改为“${select.options[select.selectedIndex].text}”吗？`)) return
      try {
        await api(`/admin/users/${button.dataset.userRoleConfirm}/role`, { method: 'PUT', body: JSON.stringify({ role: Number(select.value) }) })
        render()
      } catch (error) {
        showFormError(error.message)
      }
    })
  })

  document.querySelectorAll('[data-user-search]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const query = new URLSearchParams(window.location.search)
      const key = `${form.dataset.userSearch}_q`
      const value = new FormData(form).get('search')?.toString().trim() || ''
      if (value) query.set(key, value)
      else query.delete(key)
      window.history.pushState({}, '', `${window.location.pathname}${query.toString() ? `?${query}` : ''}`)
      render()
    })
  })

  const settingsForm = document.querySelector('[data-settings-form]')
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const fields = Object.fromEntries(new FormData(settingsForm))
      try {
        const settings = {}
        for (const [key, value] of Object.entries(fields)) {
          settings[key] = key === 'nav_items' ? JSON.parse(value) : ['allow_registration'].includes(key) ? value === 'true' : ['site_title', 'site_description'].includes(key) ? value : Number(value)
        }
        settings.allow_registration = settingsForm.querySelector('[name="allow_registration"]')?.checked === true
        await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) })
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

menuToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open')
  menuToggle.setAttribute('aria-expanded', String(isOpen))
})

window.addEventListener('popstate', render)
loadSession().finally(render)
