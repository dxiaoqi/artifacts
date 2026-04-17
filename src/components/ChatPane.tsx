'use client'

import { useEffect, useRef } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  timestamp: number
}

interface Props {
  messages: ChatMessage[]
  isLoading: boolean
  input: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  placeholder?: string
}

export function ChatPane({ messages, isLoading, input, onInputChange, onSubmit, placeholder }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim()) onSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 py-4"
        style={{ borderBottom: '0.5px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-2.5">
          {/* Anthropic-style logomark */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
              fill="var(--accent)"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Artifacts
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-12">
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="var(--accent)"/>
              </svg>
            </div>
            <div>
              <p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500, marginBottom: 4 }}>有什么可以帮你的？</p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', lineHeight: 1.6 }}>
                发送任意请求，AI 将实时生成结构化内容
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={msg.id}
            className="animate-fade-up"
            style={{ animationDelay: `${Math.min(idx * 20, 80)}ms` }}
          >
            {msg.role === 'user' ? (
              // User message — right-aligned bubble
              <div className="flex justify-end">
                <div
                  style={{
                    maxWidth: '85%',
                    background: 'var(--accent-bg)',
                    border: '0.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    borderBottomRightRadius: 'var(--radius-sm)',
                    padding: '10px 14px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: 'var(--text-primary)',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ) : (
              // Assistant message — left, no bubble
              <div className="flex gap-3">
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-secondary)', border: '0.5px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="var(--accent)"/>
                  </svg>
                </div>
                <div style={{ flex: 1, fontSize: '14px', lineHeight: 1.7, color: 'var(--text-primary)', paddingTop: 3 }}>
                  {msg.content || (msg.isStreaming ? (
                    <span className="thinking-dots">
                      <span /><span /><span />
                    </span>
                  ) : '')}
                  {msg.isStreaming && msg.content && (
                    <span className="streaming-cursor" />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div
          style={{
            background: 'var(--bg-input)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 12px 10px 14px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            transition: `border-color var(--duration-fast) var(--ease-smooth)`,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder={placeholder || '发送消息… (Enter 发送，Shift+Enter 换行)'}
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              resize: 'none',
              outline: 'none',
              border: 'none',
              fontSize: '14px',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              maxHeight: 160,
            }}
          />
          <button
            onClick={onSubmit}
            disabled={isLoading || !input.trim()}
            style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: 'var(--radius-md)',
              background: (!isLoading && input.trim()) ? 'var(--accent)' : 'var(--bg-secondary)',
              border: 'none',
              cursor: (!isLoading && input.trim()) ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: `background var(--duration-fast) var(--ease-smooth), transform var(--duration-instant)`,
            }}
            onMouseDown={e => { if (!isLoading && input.trim()) (e.currentTarget.style.transform = 'scale(0.96)') }}
            onMouseUp={e => { (e.currentTarget.style.transform = 'scale(1)') }}
          >
            {isLoading ? (
              <Loader2
                width={13} height={13}
                style={{ color: 'var(--text-tertiary)', animation: 'spin-accent 0.7s linear infinite' }}
              />
            ) : (
              <ArrowUp width={13} height={13} style={{ color: input.trim() ? '#fff' : 'var(--text-disabled)' }} />
            )}
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-disabled)', marginTop: 8 }}>
          {process.env.NEXT_PUBLIC_MODEL_NAME || 'gemini-2.5-flash'}
        </p>
      </div>
    </div>
  )
}
