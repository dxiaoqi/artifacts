'use client'

import { useEffect, useRef } from 'react'

interface Props {
  content: string
  isStreaming?: boolean
  title?: string
}

export function ChartWidget({ content, isStreaming, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<unknown>(null)

  useEffect(() => {
    if (isStreaming || !canvasRef.current) return
    let chartData: unknown
    try { chartData = JSON.parse(content.trim()) } catch { return }

    import('chart.js/auto').then(({ Chart }) => {
      if (chartRef.current) (chartRef.current as { destroy: () => void }).destroy()
      chartRef.current = new Chart(canvasRef.current!, chartData as never)
    }).catch(() => {})

    return () => {
      if (chartRef.current) {
        (chartRef.current as { destroy: () => void }).destroy()
        chartRef.current = null
      }
    }
  }, [content, isStreaming])

  if (isStreaming) {
    return (
      <div>
        {title && <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>}
        <div className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>正在生成图表…</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      {title && <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>}
      <div style={{ background: 'var(--bg-tertiary)', border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
