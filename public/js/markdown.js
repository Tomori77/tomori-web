function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function inlineMarkdown(value) {
  const tokens = []
  const protect = (html) => {
    const index = tokens.push(html) - 1
    return `\u0000${index}\u0000`
  }

  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, (_, code) => protect(`<code>${code}</code>`))
  html = html.replace(/!\[([^\]]*)\]\((\/files\/[\w./-]+)\)/g, (_, alt, url) => `<img src="${url}" alt="${alt}" loading="lazy">`)
  html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/files\/)[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" rel="noreferrer">${label}</a>`)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>')
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)])
}

export function renderMarkdown(value) {
  const lines = String(value || '').replaceAll('\r\n', '\n').split('\n')
  const output = []
  let paragraph = []
  let list = []
  let orderedList = false
  let quote = []
  let code = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    output.push(`<p>${inlineMarkdown(paragraph.join('\n')).replaceAll('\n', '<br>')}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!list.length) return
    const tag = orderedList ? 'ol' : 'ul'
    output.push(`<${tag}>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`)
    list = []
    orderedList = false
  }
  const flushQuote = () => {
    if (!quote.length) return
    output.push(`<blockquote>${quote.map((line) => inlineMarkdown(line)).join('<br>')}</blockquote>`)
    quote = []
  }

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/)
    if (fence) {
      flushParagraph()
      flushList()
      flushQuote()
      if (code) {
        output.push(`<pre><code${code.language ? ` class="language-${escapeHtml(code.language)}"` : ''}>${escapeHtml(code.lines.join('\n'))}</code></pre>`)
        code = null
      } else {
        code = { language: fence[1], lines: [] }
      }
      continue
    }
    if (code) {
      code.lines.push(line)
      continue
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    const unordered = line.match(/^\s*[-+*]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    const quoteLine = line.match(/^\s*>\s?(.*)$/)

    if (!line.trim()) {
      flushParagraph()
      flushList()
      flushQuote()
    } else if (heading) {
      flushParagraph(); flushList(); flushQuote()
      const level = heading[1].length
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
    } else if (unordered || ordered) {
      flushParagraph(); flushQuote()
      const nextOrdered = Boolean(ordered)
      if (list.length && orderedList !== nextOrdered) flushList()
      orderedList = nextOrdered
      list.push((unordered || ordered)[1])
    } else if (quoteLine) {
      flushParagraph(); flushList()
      quote.push(quoteLine[1])
    } else {
      flushList(); flushQuote()
      paragraph.push(line)
    }
  }

  if (code) output.push(`<pre><code${code.language ? ` class="language-${escapeHtml(code.language)}"` : ''}>${escapeHtml(code.lines.join('\n'))}</code></pre>`)
  flushParagraph()
  flushList()
  flushQuote()
  return output.join('')
}
