'use client'

import { useRef, useState } from 'react'
import { Copy, Check, Image as ImageIcon, Loader2 } from 'lucide-react'
import { PlanProgress, type PlanPhase } from './PlanProgress'
import { WidgetRenderer, type WidgetState } from './WidgetRenderer'
import { VisualRenderer } from './VisualRenderer'
import { ProseMarkdown } from './ProseMarkdown'
import { exportMessageAsImage } from '@/lib/export-image'
import type { ContentBlock } from '@/lib/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  timestamp: number
  // Legacy artifact data (plan/phase/widget protocol)
  widgets?: WidgetState[]
  planPhases?: PlanPhase[]
  thinkText?: string
  artifactComplete?: boolean
  // Visual V2 block data
  blocks?: ContentBlock[]
}

// In-progress artifact data (only passed for the currently-generating message)
export interface InProgressArtifact {
  widgets: WidgetState[]
  planPhases: PlanPhase[]
  currentPhaseId: string | null
  isTransition: boolean
  transitionMessage: string
  thinkText: string
  statusMessage: string
  // Visual V2
  blocks?: ContentBlock[]
}

interface Props {
  message: ChatMessage
  inProgress?: InProgressArtifact
}

type ActionState = 'idle' | 'loading' | 'done'

export function MessageItem({ message, inProgress }: Props) {
  const msgRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [copyState, setCopyState] = useState<ActionState>('idle')
  const [imgState, setImgState] = useState<ActionState>('idle')

  const isUser = message.role === 'user'
  const isGenerating = !!inProgress
  const hasArtifact = !!(isGenerating ? inProgress!.widgets.length > 0 : message.widgets?.length)

  // Determine widgets/phases to show
  const widgets = isGenerating ? inProgress!.widgets : (message.widgets ?? [])
  const planPhases = isGenerating ? inProgress!.planPhases : (message.planPhases ?? [])
  const currentPhaseId = isGenerating ? inProgress!.currentPhaseId : null
  const isTransition = isGenerating ? inProgress!.isTransition : false
  const transitionMessage = isGenerating ? inProgress!.transitionMessage : ''
  const thinkText = isGenerating ? inProgress!.thinkText : (message.thinkText ?? '')

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleCopy = async () => {
    const text = message.content || widgets.map(w => w.content).join('\n\n')
    if (!text) return
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopyState('done')
    setTimeout(() => setCopyState('idle'), 2000)
  }

  const handleExportImage = async () => {
    if (!msgRef.current) return
    setImgState('loading')
    try {
      await exportMessageAsImage(msgRef.current, msgRef.current, message.content.slice(0, 40), message.blocks)
      setImgState('done')
      setTimeout(() => setImgState('idle'), 2000)
    } catch {
      setImgState('idle')
    }
  }

  // ─── User message ──────────────────────────────────────────────────────────

  if (isUser) {
    return (
      <div
        className="flex justify-end group"
        style={{ marginBottom: 20 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '75%' }}>
          {/* Hover actions */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              opacity: hovered ? 1 : 0,
              transition: 'opacity 150ms ease',
              alignSelf: 'center',
            }}
          >
            <ActionButton icon={<Copy width={11} height={11} />} done={copyState === 'done'} label="复制" onClick={handleCopy} />
          </div>

          {/* Bubble */}
          <div
            ref={msgRef}
            style={{
              background: 'var(--accent-bg)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              borderBottomRightRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              fontSize: '14px',
              lineHeight: 1.65,
              color: 'var(--text-primary)',
              wordBreak: 'break-word',
            }}
          >
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  // ─── Assistant message ─────────────────────────────────────────────────────

  return (
    <div
      style={{ marginBottom: 28 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 24, height: 24,
          borderRadius: '50%',
          background: 'var(--accent-bg)',
          border: '0.5px solid var(--border-default)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="var(--accent)"/>
          </svg>
        </div>
        <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>
          Artifacts
        </span>
        {isGenerating && inProgress!.statusMessage && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', color: 'var(--text-tertiary)' }}>
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin-accent 0.9s linear infinite' }}>
              <circle cx="8" cy="8" r="6" stroke="var(--border-hover)" strokeWidth="2" fill="none"/>
              <path d="M8 2a6 6 0 0 1 6 6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
            {inProgress!.statusMessage}
          </span>
        )}
      </div>

      {/* Content area */}
      <div ref={msgRef} style={{ paddingLeft: 32 }}>
        {/* Pure text reply (conversational) — render as Markdown */}
        {message.content && !hasArtifact && (
          <ProseMarkdown content={message.content} isStreaming={message.isStreaming} />
        )}

        {/* Loading state (no content yet, no artifact) */}
        {message.isStreaming && !message.content && !hasArtifact && (
          <span className="thinking-dots" style={{ paddingTop: 2 }}>
            <span /><span /><span />
          </span>
        )}

        {/* Think bubble */}
        {thinkText && (
          <div
            className="animate-fade-in"
            style={{
              marginBottom: 14,
              padding: '9px 13px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '0.5px solid var(--border-default)',
              display: 'flex', alignItems: 'flex-start', gap: 7,
            }}
          >
            <span style={{ fontSize: '11px', opacity: 0.5, flexShrink: 0 }}>💭</span>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic', lineHeight: 1.5 }}>
              {thinkText.slice(0, 120)}{thinkText.length > 120 ? '…' : ''}
            </span>
          </div>
        )}

        {/* Plan progress */}
        {planPhases.length > 0 && (
          <PlanProgress
            phases={planPhases}
            currentPhaseId={currentPhaseId}
            isTransition={isTransition}
            transitionMessage={transitionMessage}
          />
        )}

        {/* ── Visual V2 blocks (text/visual protocol) ── */}
        {(() => {
          const blocks = isGenerating
            ? (inProgress?.blocks ?? [])
            : (message.blocks ?? [])
          if (blocks.length > 0) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {blocks.map(block =>
                  block.kind === 'text' ? (
                    <ProseMarkdown
                      key={block.id}
                      content={block.content}
                      isStreaming={block.isStreaming}
                    />
                  ) : (
                    <VisualRenderer
                      key={block.id}
                      content={block.content}
                      declaredType={block.visualType}
                      isComplete={block.isComplete}
                      onSendPrompt={(text) => {
                        // sendPrompt from visual — handled by page.tsx message listener
                        window.postMessage({ type: 'send-prompt', text }, '*')
                      }}
                    />
                  )
                )}
              </div>
            )
          }
          return null
        })()}

        {/* ── Legacy widgets (plan/phase/widget protocol) ── */}
        {widgets.length > 0 && !(isGenerating ? inProgress?.blocks?.length : message.blocks?.length) && (
          <div>
            {widgets.map(w => (
              <WidgetRenderer key={w.id} widget={w} />
            ))}
          </div>
        )}
      </div>

      {/* Hover action toolbar */}
      <div
        style={{
          paddingLeft: 32,
          marginTop: 8,
          display: 'flex',
          gap: 4,
          opacity: hovered && !isGenerating ? 1 : 0,
          transition: 'opacity 150ms ease',
        }}
      >
        <ActionButton
          icon={copyState === 'done' ? <Check width={11} height={11} /> : <Copy width={11} height={11} />}
          done={copyState === 'done'}
          label={copyState === 'done' ? '已复制' : '复制'}
          onClick={handleCopy}
        />
        <ActionButton
          icon={imgState === 'loading'
            ? <Loader2 width={11} height={11} style={{ animation: 'spin-accent 0.7s linear infinite' }} />
            : imgState === 'done' ? <Check width={11} height={11} /> : <ImageIcon width={11} height={11} />}
          done={imgState === 'done'}
          label={imgState === 'loading' ? '截图中…' : imgState === 'done' ? '已保存' : '导出图片'}
          onClick={handleExportImage}
          disabled={imgState === 'loading'}
        />
      </div>
    </div>
  )
}

// ─── Small action button ──────────────────────────────────────────────────────

function ActionButton({ icon, done, label, onClick, disabled }: {
  icon: React.ReactNode
  done?: boolean
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 9px',
        borderRadius: 'var(--radius-md)',
        border: `0.5px solid ${done ? 'var(--success)' : hov ? 'var(--border-hover)' : 'var(--border-default)'}`,
        background: done ? 'var(--success-bg)' : hov ? 'var(--bg-secondary)' : 'transparent',
        color: done ? 'var(--success)' : 'var(--text-tertiary)',
        fontSize: '11px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
