'use client'

export interface PlanPhase {
  id: string
  goal: string
  status: 'pending' | 'running' | 'done' | 'abandoned'
}

interface Props {
  phases: PlanPhase[]
  currentPhaseId?: string | null
  isTransition?: boolean
  transitionMessage?: string
}

export function PlanProgress({ phases, currentPhaseId, isTransition, transitionMessage }: Props) {
  if (phases.length === 0) return null

  const doneCount = phases.filter(p => p.status === 'done').length

  return (
    <div
      className="animate-fade-in"
      style={{
        background: 'var(--bg-secondary)',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
        marginBottom: 20,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          生成计划
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isTransition && (
            <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse-breath 1.4s ease-in-out infinite' }} />
              {transitionMessage || '检查中…'}
            </span>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {doneCount}/{phases.length}
          </span>
        </div>
      </div>

      {/* Phases */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {phases.map((phase, i) => {
          const isActive = phase.id === currentPhaseId
          const isDone = phase.status === 'done'
          const isAbandoned = phase.status === 'abandoned'

          return (
            <div
              key={phase.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                border: `0.5px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                transition: `background var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)`,
                opacity: isAbandoned ? 0.45 : 1,
              }}
            >
              {/* Status indicator */}
              <div style={{ flexShrink: 0, marginTop: 2 }}>
                {isDone ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="var(--success-bg)" stroke="var(--success)" strokeWidth="0.75"/>
                    <path d="M5 8.5l2 2 4-4" stroke="var(--success)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : isAbandoned ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="var(--bg-tertiary)" stroke="var(--border-hover)" strokeWidth="0.75"/>
                    <path d="M6 10l4-4M10 10L6 6" stroke="var(--text-disabled)" strokeWidth="1.25" strokeLinecap="round"/>
                  </svg>
                ) : isActive ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin-accent 1s linear infinite' }}>
                    <circle cx="8" cy="8" r="6" stroke="var(--border-default)" strokeWidth="1.5" fill="none"/>
                    <path d="M8 2a6 6 0 0 1 6 6" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="var(--bg-tertiary)" stroke="var(--border-default)" strokeWidth="0.75"/>
                  </svg>
                )}
              </div>

              {/* Goal text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>P{i + 1}</span>
                  <span style={{
                    fontSize: '12.5px',
                    lineHeight: 1.5,
                    color: isActive ? 'var(--accent)' : isDone ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                    fontWeight: isActive ? 500 : 400,
                  }}>
                    {phase.goal}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
