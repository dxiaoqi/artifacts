'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  content: string
  isStreaming?: boolean
  title?: string
}

export function SvgWidget({ content, isStreaming, title }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isStreaming || !ref.current) return
    try {
      const svgMatch = content.match(/<svg[\s\S]*<\/svg>/i)
      if (svgMatch) {
        ref.current.innerHTML = svgMatch[0]
        const svg = ref.current.querySelector('svg')
        if (svg) {
          svg.style.width = '100%'
          svg.style.height = 'auto'
          svg.style.maxHeight = '480px'
        }
        setError(null)
      } else {
        setError('无法解析 SVG 内容')
      }
    } catch {
      setError('SVG 渲染错误')
    }
  }, [content, isStreaming])

  if (isStreaming) {
    return (
      <div>
        {title && (
          <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
        )}
        <div
          className="skeleton"
          style={{ height: 140, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>正在生成图形…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        {title && (
          <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
        )}
        <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--danger-bg)', border: '0.5px solid var(--danger)', fontSize: '13px', color: 'var(--danger)' }}>
          {error}
        </div>
      </div>
    )
  }

  return (
    <div>
      {title && (
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
      )}
      <div
        ref={ref}
        style={{
          background: 'var(--bg-secondary)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          overflow: 'hidden',
          animation: 'fade-in var(--duration-moderate) var(--ease-out) both',
        }}
      />
    </div>
  )
}
