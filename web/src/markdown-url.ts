import { defaultUrlTransform } from 'react-markdown'

export function safeMarkdownUrl(url: string) {
  const safe = defaultUrlTransform(url)
  return /^(https?:\/\/|mailto:|#|\/[^/])/.test(safe) ? safe : ''
}
