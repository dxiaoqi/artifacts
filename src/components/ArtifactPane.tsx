'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Check, AlertCircle, Loader2, Sun, Moon } from 'lucide-react'
import { PlanProgress, type PlanPhase } from './PlanProgress'
import { WidgetRenderer, type WidgetState } from './WidgetRenderer'
import { exportArtifact } from '@/lib/export-image'

interface ThinkState { text: string; open: boolean }

interface Props {
  isGenerating: boolean
  statusMessage?: string
  planPhases: PlanPhase[]
  currentPhaseId?: string | null
  isTransition?: boolean
  transitionMessage?: string
  widgets: WidgetState[]
  thinkState?: ThinkState | null
  currentQuestion?: string
  theme?: 'light' | 'dark'
  onToggleTheme?: () => void
}

type ExportState = 'idle' | 'exporting' | 'done' | 'error'

export function ArtifactPane({
  isGenerating, statusMessage, planPhases, currentPhaseId,
  isTransition, transitionMessage, widgets, thinkState,
  currentQuestion, theme = 'dark', onToggleTheme,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const widgetsRootRef = useRef<HTMLDivElement>(null)
  const [exportState, setExportState] = useState<ExportState>('idle')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [widgets.length])

  useEffect(() => {
    if (exportState === 'done') {
      const t = setTimeout(() => setExportState('idle'), 2000)
      return () => clearTimeout(t)
    }
  }, [exportState])

  const canExport = !isGenerating && widgets.length > 0 && !!currentQuestion

  const handleExport = async () => {
    if (!canExport || !widgetsRootRef.current || !currentQuestion) return
    setExportState('exporting')
    try {
      await exportArtifact({ question: currentQuestion, widgetsRoot: widgetsRootRef.current })
      setExportState('done')
    } catch {
      setExportState('error')
      setTimeout(() => setExportState('idle'), 3000)
    }
  }

  const isEmpty = !isGenerating && widgets.length === 0 && planPhases.length === 0

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* Header */}
      <div
        className="flex items-center justify-between flex-shrink-0 px-6 py-3.5"
        style={{ borderBottom: '0.5px solid var(--border-default)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}>
            Artifact
          </span>
          {isGenerating && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: 'var(--text-tertiary)' }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin-accent 0.9s linear infinite' }}>
                <circle cx="8" cy="8" r="6" stroke="var(--border-hover)" strokeWidth="2" fill="none"/>
                <path d="M8 2a6 6 0 0 1 6 6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" fill="none"/>
              </svg>
              {statusMessage || '生成中…'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={!canExport || exportState === 'exporting'}
            title={!currentQuestion ? '发送消息后可导出' : '导出为 PNG'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 11px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              fontWeight: 500,
              border: `0.5px solid ${exportState === 'done' ? 'var(--success)' : exportState === 'error' ? 'var(--danger)' : 'var(--border-default)'}`,
              background: exportState === 'done' ? 'var(--success-bg)' : exportState === 'error' ? 'var(--danger-bg)' : 'transparent',
              color: exportState === 'done' ? 'var(--success)' : exportState === 'error' ? 'var(--danger)' : canExport ? 'var(--text-secondary)' : 'var(--text-disabled)',
              cursor: canExport && exportState === 'idle' ? 'pointer' : 'not-allowed',
              transition: `all var(--duration-fast) var(--ease-smooth)`,
            }}
          >
            {exportState === 'exporting' ? <Loader2 width={11} height={11} style={{ animation: 'spin-accent 0.7s linear infinite' }} />
              : exportState === 'done' ? <Check width={11} height={11} />
              : exportState === 'error' ? <AlertCircle width={11} height={11} />
              : <Download width={11} height={11} />}
            <span>
              {exportState === 'exporting' ? '导出中…' : exportState === 'done' ? '已保存' : exportState === 'error' ? '失败' : '导出'}
            </span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              border: '0.5px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              transition: `color var(--duration-fast) var(--ease-smooth), background var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)`,
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hover)'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'
            }}
          >
            {theme === 'dark'
              ? <Sun width={12} height={12} />
              : <Moon width={12} height={12} />
            }
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-12" style={{ opacity: 0.4 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="var(--text-tertiary)" strokeWidth="0.75" fill="none"/>
              <path d="M3 9h18M9 9v12" stroke="var(--text-tertiary)" strokeWidth="0.75"/>
            </svg>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              发送消息后，artifact 将在这里实时显示
            </p>
          </div>
        ) : (
          <>
            {planPhases.length > 0 && (
              <PlanProgress
                phases={planPhases}
                currentPhaseId={currentPhaseId}
                isTransition={isTransition}
                transitionMessage={transitionMessage}
              />
            )}

            {/* Think bubble */}
            {thinkState?.text && (
              <div
                className="animate-fade-in"
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '0.5px solid var(--border-default)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: '12px', flexShrink: 0, opacity: 0.5 }}>💭</span>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  {thinkState.text.slice(0, 120)}{thinkState.text.length > 120 ? '…' : ''}
                </span>
              </div>
            )}

            {/* Widgets */}
            <div ref={widgetsRootRef}>
              {widgets.map(w => (
                <WidgetRenderer key={w.id} widget={w} />
              ))}
            </div>
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
