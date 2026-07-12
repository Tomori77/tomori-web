const dangerousMarkdown = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /<\s*svg\b/i,
  /\bon[a-z]+\s*=/i,
  /(?:javascript|vbscript)\s*:/i
]

export function validateMarkdownContent(content: string) {
  if (content.includes('\u0000')) return 'Content contains an invalid null character'
  if (dangerousMarkdown.some((pattern) => pattern.test(content))) {
    return 'Content contains unsafe HTML or URL markup'
  }
  return null
}
