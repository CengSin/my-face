import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeMarkdownUrl } from './markdown-url'

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeMarkdownUrl}
        components={{
          a: ({ children, href }) => (
            <a
              href={href || undefined}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            src && /^https?:\/\//.test(src) ? (
              <img
                src={src}
                alt={alt || ''}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="image-placeholder">
                {alt || '图片地址需为 HTTP 或 HTTPS 链接'}
              </span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
