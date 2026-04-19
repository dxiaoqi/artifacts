'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { detectVisualType, type VisualType } from '@/lib/detect-visual'
import { buildSvgDoc, buildHtmlDoc, buildThreejsDoc, extractHostCssVars } from '@/lib/build-iframe-doc'

const MIN_H: Record<VisualType, number> = { svg: 180, html: 160, threejs: 360 }
const MAX_H = 2400

interface Props {
  content: string
  declaredType?: string
  isComplete: boolean
  onSendPrompt?: (text: string) => void
  className?: string
}

export function VisualRenderer({ content, declaredType, isComplete, onSendPrompt, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number>(MIN_H.html)
  const [error, setError] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const visualType = detectVisualType(content, declaredType)

  // Build and inject the iframe document
  const inject = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe || !isComplete) return

    setError(null)
    const cssVars = extractHostCssVars()

    const builders: Record<VisualType, (code: string, vars: string) => string> = {
      svg: buildSvgDoc,
      html: buildHtmlDoc,
      threejs: buildThreejsDoc,
    }
    const doc = builders[visualType](content, cssVars)

    // Use Blob URL for large documents to avoid srcdoc limits
    if (doc.length > 50_000) {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const blob = new Blob([doc], { type: 'text/html' })
      blobUrlRef.current = URL.createObjectURL(blob)
      iframe.src = blobUrlRef.current
    } else {
      iframe.srcdoc = doc
    }
    setHeight(MIN_H[visualType])
  }, [content, isComplete, visualType])

  // Re-inject when content or completion status changes
  useEffect(() => {
    inject()
  }, [inject])

  // Cleanup Blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  // Handle postMessages from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const { type, payload } = (e.data ?? {}) as { type: string; payload: unknown }
      switch (type) {
        case 'SEND_PROMPT':
          onSendPrompt?.(String(payload))
          break
        case 'RESIZE':
          setHeight(h => Math.min(MAX_H, Math.max(MIN_H[visualType], Number(payload) + 8)))
          break
        case 'OPEN_LINK':
          window.open(String(payload), '_blank', 'noopener,noreferrer')
          break
        case 'VISUAL_ERROR':
          setError(`渲染错误（行 ${(payload as { line?: number }).line ?? '?'}）`)
          break
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onSendPrompt, visualType])

  // Push theme updates without rebuilding the iframe
  useEffect(() => {
    const handler = () => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'THEME_UPDATE', cssVars: extractHostCssVars() },
        '*',
      )
    }
    const observer = new MutationObserver(handler)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Loading skeleton
  if (!isComplete) {
    return (
      <VisualSkeleton
        type={visualType}
        className={className}
      />
    )
  }

  // Error state
  if (error) {
    return (
      <div
        className={className}
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          border: '0.5px solid var(--border-default)',
          background: 'var(--bg-secondary)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>⚠</span>
        <span>{error}</span>
        <button
          onClick={() => { setError(null); inject() }}
          style={{
            marginLeft: 'auto',
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '0.5px solid var(--border-default)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          重试
        </button>
      </div>
    )
  }

  const sandbox = visualType === 'threejs'
    ? 'allow-scripts allow-same-origin'
    : 'allow-scripts'

  return (
    <iframe
      ref={iframeRef}
      sandbox={sandbox}
      style={{
        width: '100%',
        height,
        border: 'none',
        display: 'block',
        borderRadius: 'var(--radius-lg)',
        transition: 'height 200ms ease',
      }}
      className={className}
      title={`visual-${visualType}`}
    />
  )
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

const SKELETON_MESSAGES: Record<VisualType, string[]> = {
  svg:     ['生成图表…'],
  html:    ['构建交互组件…', '初始化脚本…'],
  threejs: ['加载 3D 引擎…', '构建场景…'],
}

function VisualSkeleton({ type, className }: { type: VisualType; className?: string }) {
  const msgs = SKELETON_MESSAGES[type]
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (msgs.length <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % msgs.length), 1400)
    return () => clearInterval(t)
  }, [msgs.length])

  return (
    <div
      className={className}
      style={{
        height: MIN_H[type],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-lg)',
        border: '0.5px solid var(--border-default)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-tertiary)',
        fontSize: '12px',
        animation: 'pulse-breath 1.8s ease-in-out infinite',
      }}
    >
      {msgs[idx]}
    </div>
  )
}
