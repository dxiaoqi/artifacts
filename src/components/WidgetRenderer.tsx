'use client'

import { MarkdownWidget } from './widgets/MarkdownWidget'
import { SvgWidget } from './widgets/SvgWidget'
import { HtmlWidget } from './widgets/HtmlWidget'
import { ChartWidget } from './widgets/ChartWidget'

export interface WidgetState {
  id: string
  type: string
  title?: string
  content: string
  isStreaming: boolean
  partial?: boolean
}

interface Props {
  widget: WidgetState
}

export function WidgetRenderer({ widget }: Props) {
  const { type, content, isStreaming, title, partial } = widget

  const inner = () => {
    switch (type) {
      case 'svg':   return <SvgWidget content={content} isStreaming={isStreaming} title={title} />
      case 'html':  return <HtmlWidget content={content} isStreaming={isStreaming} title={title} />
      case 'chart': return <ChartWidget content={content} isStreaming={isStreaming} title={title} />
      case 'markdown':
      default:      return <MarkdownWidget content={content} isStreaming={isStreaming} title={title} />
    }
  }

  return (
    <div
      className="widget-container animate-widget-enter"
      style={{ marginBottom: 20, animationFillMode: 'both' }}
    >
      {partial && (
        <div style={{ fontSize: '11px', color: 'var(--warning)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L15 14H1L8 1Z" fill="var(--warning-bg)" stroke="var(--warning)" strokeWidth="0.75"/>
            <path d="M8 6v4M8 11.5v.5" stroke="var(--warning)" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
          内容可能不完整
        </div>
      )}
      {inner()}
    </div>
  )
}
