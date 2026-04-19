'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  isStreaming?: boolean
  compact?: boolean
}

export function ProseMarkdown({ content, isStreaming, compact }: Props) {
  return (
    <div
      className="prose-artifact"
      style={compact ? { fontSize: '13px', lineHeight: 1.65 } : undefined}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content + (isStreaming ? '▋' : '')}
      </ReactMarkdown>
    </div>
  )
}
