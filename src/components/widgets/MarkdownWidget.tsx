'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface Props {
  content: string
  isStreaming?: boolean
  title?: string
}

export function MarkdownWidget({ content, isStreaming, title }: Props) {
  return (
    <div>
      {title && (
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </div>
      )}
      <div className="prose-artifact">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
        >
          {content + (isStreaming ? '▋' : '')}
        </ReactMarkdown>
      </div>
    </div>
  )
}
