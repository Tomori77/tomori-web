import { resolve } from './router.js'

const app = document.querySelector('#app')
const nav = document.querySelector('.site-nav')
const menuToggle = document.querySelector('.menu-toggle')

function closeMenu() {
  nav?.classList.remove('is-open')
  menuToggle?.setAttribute('aria-expanded', 'false')
}

async function render() {
  const renderPage = await resolve(window.location.pathname)
  app.innerHTML = `<div class="page-enter">${renderPage()}</div>`
  app.focus({ preventScroll: true })
  document.querySelectorAll('[data-link]').forEach((link) => {
    link.setAttribute('aria-current', link.getAttribute('href') === window.location.pathname ? 'page' : 'false')
  })
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]')
  if (!link || link.origin !== window.location.origin) return
  event.preventDefault()
  window.history.pushState({}, '', link.pathname)
  closeMenu()
  render()
})

menuToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open')
  menuToggle.setAttribute('aria-expanded', String(isOpen))
})

window.addEventListener('popstate', render)
render()
