'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ArrowUp, Loader2, Download, Image as ImageIcon, Sun, Moon } from 'lucide-react'
import { MessageItem, type ChatMessage, type InProgressArtifact } from '@/components/MessageItem'
import { type WidgetState } from '@/components/WidgetRenderer'
import { type PlanPhase } from '@/components/PlanProgress'
import { type ContentBlock } from '@/lib/types'
import {
  exportConversationJson,
  exportConversationAsImage,
  type ExportableChatMessage,
} from '@/lib/export-image'

interface StreamMeta { conversationId?: string; artifactId?: string; turnId?: string }

let msgCounter = 0
function nextId() { return `msg_${++msgCounter}` }

let splitBlockCounter = 0
/**
 * Post-processing fallback: scan each text block for embedded <visual type="...">...</visual>
 * sequences and split them into proper text + visual blocks.
 * This catches the edge case where a partial-tag chunk boundary caused the parser to flush
 * the <visual> opening tag as preamble text, resulting in the full visual ending up in a
 * text block.
 */
function extractEmbeddedVisuals(blocks: ContentBlock[]): ContentBlock[] {
  const result: ContentBlock[] = []
  for (const block of blocks) {
    if (block.kind !== 'text') { result.push(block); continue }

    const content = block.content
    // Fast path: no <visual in this block
    if (!content.includes('<visual')) { result.push(block); continue }

    let remaining = content
    let changed = false

    while (remaining.length > 0) {
      const vStart = remaining.indexOf('<visual')
      if (vStart === -1) break

      const gtIdx = remaining.indexOf('>', vStart)
      if (gtIdx === -1) break

      const tagContent = remaining.slice(vStart, gtIdx + 1)
      const typeMatch = tagContent.match(/type\s*=\s*['"]([^'"]+)['"]/)
      if (!typeMatch) { break }

      const visualType = typeMatch[1]
      const closeTag = '</visual>'
      const vEnd = remaining.indexOf(closeTag, gtIdx)
      if (vEnd === -1) break

      // Text before the visual
      const beforeText = remaining.slice(0, vStart)
      if (beforeText) {
        result.push({ kind: 'text', id: `split_${++splitBlockCounter}`, content: beforeText, isStreaming: false })
      }

      // The visual block itself
      const visualContent = remaining.slice(gtIdx + 1, vEnd).trim()
      const safeType = (['svg', 'html', 'threejs'].includes(visualType) ? visualType : 'html') as import('@/lib/types').VisualBlockType
      result.push({
        kind: 'visual',
        id: `split_${++splitBlockCounter}`,
        visualType: safeType,
        content: visualContent,
        isComplete: true,
      })

      remaining = remaining.slice(vEnd + closeTag.length)
      changed = true
    }

    if (!changed) {
      result.push(block)
    } else if (remaining) {
      result.push({ kind: 'text', id: `split_${++splitBlockCounter}`, content: remaining, isStreaming: false })
    }
  }
  return result
}

// ─── Export action state ──────────────────────────────────────────────────────

type ExportBtnState = 'idle' | 'loading' | 'done'

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  // In-progress artifact state (cleared and committed to message on plan.completed)
  const [inProgressWidgets, setInProgressWidgets] = useState<WidgetState[]>([])
  const [inProgressPlanPhases, setInProgressPlanPhases] = useState<PlanPhase[]>([])
  const [inProgressCurrentPhaseId, setInProgressCurrentPhaseId] = useState<string | null>(null)
  const [inProgressIsTransition, setInProgressIsTransition] = useState(false)
  const [inProgressTransitionMessage, setInProgressTransitionMessage] = useState('')
  const [inProgressThinkText, setInProgressThinkText] = useState('')
  const [inProgressStatusMessage, setInProgressStatusMessage] = useState('')

  // ── Visual V2 block state ─────────────────────────────────────────────────
  // Blocks are built in-progress during streaming, then committed to the message
  const [inProgressBlocks, setInProgressBlocks] = useState<ContentBlock[]>([])
  const blockCounterRef = useRef(0)

  // Export states
  const [jsonExportState, setJsonExportState] = useState<ExportBtnState>('idle')
  const [imgExportState, setImgExportState] = useState<ExportBtnState>('idle')

  // Refs
  const messagesRootRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const metaRef = useRef<StreamMeta>({})
  const abortRef = useRef<AbortController | null>(null)
  const currentAssistantMsgIdRef = useRef<string | null>(null)
  const widgetCountRef = useRef(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, inProgressWidgets.length])

  // Auto-focus the input box after the AI finishes responding
  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus()
    }
  }, [isLoading])

  // ─── sendPrompt from visual iframes ────────────────────────────────────────
  // MessageItem re-dispatches SEND_PROMPT from VisualRenderer as a window message
  // so page.tsx can intercept it at the top level.
  const pendingSendPromptRef = useRef<string | null>(null)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'send-prompt') return
      const text = String(e.data.text ?? '').trim()
      if (!text) return
      pendingSendPromptRef.current = text
      setInput(text)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Ref that always points to the latest handleSubmit — set below after declaration.
  const handleSubmitRef = useRef<() => void>(() => {})

  // ─── Theme toggle ──────────────────────────────────────────────────────────

  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      return next
    })
  }

  // ─── Conversation export ───────────────────────────────────────────────────

  const handleJsonExport = () => {
    if (!messages.length) return
    exportConversationJson(messages as ExportableChatMessage[])
    setJsonExportState('done')
    setTimeout(() => setJsonExportState('idle'), 2000)
  }

  const handleImgExport = async () => {
    if (!messagesRootRef.current || !messages.length) return
    setImgExportState('loading')
    try {
      await exportConversationAsImage(messagesRootRef.current, messages as ExportableChatMessage[])
      setImgExportState('done')
    } catch { /* ignore */ }
    setTimeout(() => setImgExportState('idle'), 2000)
  }

  // ─── Widget helpers ────────────────────────────────────────────────────────

  const upsertInProgressWidget = useCallback((id: string, update: Partial<WidgetState> | ((prev: WidgetState) => WidgetState)) => {
    setInProgressWidgets(prev => {
      const idx = prev.findIndex(w => w.id === id)
      if (idx === -1) return prev
      const old = prev[idx]
      const next = typeof update === 'function' ? update(old) : { ...old, ...update }
      return [...prev.slice(0, idx), next, ...prev.slice(idx + 1)]
    })
  }, [])

  // ─── Reset in-progress state ──────────────────────────────────────────────

  const resetInProgress = useCallback(() => {
    setInProgressWidgets([])
    setInProgressPlanPhases([])
    setInProgressCurrentPhaseId(null)
    setInProgressIsTransition(false)
    setInProgressTransitionMessage('')
    setInProgressThinkText('')
    setInProgressStatusMessage('')
    setInProgressBlocks([])
    widgetCountRef.current = 0
    blockCounterRef.current = 0
  }, [])

  // ─── Message helpers ───────────────────────────────────────────────────────

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const full: ChatMessage = { ...msg, id: nextId(), timestamp: Date.now() }
    setMessages(prev => [...prev, full])
    return full.id
  }, [])

  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))
  }, [])

  // ─── Stream event processor ────────────────────────────────────────────────

  const processEvent = useCallback((raw: string) => {
    let event: Record<string, unknown>
    try { event = JSON.parse(raw) } catch { return }

    if (event.conversationId) metaRef.current.conversationId = event.conversationId as string
    if (event.artifactId) metaRef.current.artifactId = event.artifactId as string
    if (event.turnId) metaRef.current.turnId = event.turnId as string

    const type = event.type as string
    const payload = (event.payload as Record<string, unknown>) || {}

    switch (type) {
      case 'status':
        setInProgressStatusMessage((payload.message as string) || '')
        break

      case 'conversational.reply': {
        const text = payload.text as string
        const done = payload.done as boolean
        const msgId = currentAssistantMsgIdRef.current
        if (text && msgId) {
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, content: m.content + text, isStreaming: !done } : m
          ))
        }
        if (done) {
          setIsLoading(false)
          setInProgressStatusMessage('')
          if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isStreaming: false } : m))
        }
        break
      }

      case 'plan.created': {
        const plan = payload.plan as { phases: Array<{ id: string; goal: string }> }
        if (plan?.phases) {
          setInProgressPlanPhases(plan.phases.map(p => ({ id: p.id, goal: p.goal, status: 'pending' as const })))
        }
        break
      }

      case 'phase.started': {
        const id = payload.id as string
        setInProgressCurrentPhaseId(id)
        setInProgressIsTransition(false)
        setInProgressPlanPhases(prev => prev.map(p => p.id === id ? { ...p, status: 'running' } : p))
        break
      }

      case 'phase.transition':
        setInProgressIsTransition(true)
        setInProgressTransitionMessage((payload.message as string) || '正在检查…')
        break

      case 'critic.thinking':
        setInProgressTransitionMessage('检查中…')
        break

      case 'phase.completed':
        setInProgressPlanPhases(prev => prev.map(p => p.id === (payload.id as string) ? { ...p, status: 'done' } : p))
        setInProgressIsTransition(false)
        break

      case 'phase.abandoned':
        setInProgressPlanPhases(prev => prev.map(p => p.id === (payload.id as string) ? { ...p, status: 'abandoned' } : p))
        break

      case 'widget.opened': {
        const { id, type: wType, title } = payload as { id: string; type: string; title?: string }
        widgetCountRef.current++
        setInProgressWidgets(prev => {
          if (prev.some(w => w.id === id)) return prev
          return [...prev, { id, type: wType || 'markdown', title, content: '', isStreaming: true }]
        })
        break
      }

      case 'widget.chunk': {
        const { id, text } = payload as { id: string; text: string }
        upsertInProgressWidget(id, w => ({ ...w, content: w.content + text }))
        break
      }

      case 'widget.closed': {
        const { id, partial } = payload as { id: string; partial?: boolean }
        upsertInProgressWidget(id, w => ({ ...w, isStreaming: false, partial: partial || false }))
        break
      }

      case 'think.chunk':
        setInProgressThinkText(prev => prev + (payload.text as string))
        break

      // ── Visual V2 block events ────────────────────────────────────────────

      case 'block.text_start': {
        const id = `b${++blockCounterRef.current}`
        setInProgressBlocks(prev => [...prev, { kind: 'text', id, content: '', isStreaming: true }])
        break
      }
      case 'block.text_chunk': {
        const text = payload.text as string
        setInProgressBlocks(prev => {
          if (!prev.length) return prev
          const last = prev[prev.length - 1]
          if (last.kind !== 'text') return prev
          return [...prev.slice(0, -1), { ...last, content: last.content + text }]
        })
        break
      }
      case 'block.text_end': {
        setInProgressBlocks(prev => {
          if (!prev.length) return prev
          const last = prev[prev.length - 1]
          if (last.kind !== 'text') return prev
          return [...prev.slice(0, -1), { ...last, isStreaming: false }]
        })
        break
      }
      case 'block.visual_start': {
        const id = `b${++blockCounterRef.current}`
        const visualType = (payload.visualType as string) || 'html'
        setInProgressBlocks(prev => [...prev, {
          kind: 'visual', id,
          visualType: visualType as ContentBlock extends { kind: 'visual' } ? ContentBlock['visualType'] : never,
          content: '',
          isComplete: false,
        }])
        break
      }
      case 'block.visual': {
        const { content, visualType: vt } = payload as { content: string; visualType: string }
        setInProgressBlocks(prev => {
          // Find last incomplete visual block and mark it complete
          for (let i = prev.length - 1; i >= 0; i--) {
            const b = prev[i]
            if (b.kind === 'visual' && !b.isComplete) {
              const updated = [...prev]
              updated[i] = { ...b, content, isComplete: true, visualType: (vt || b.visualType) as ContentBlock extends { kind: 'visual' } ? ContentBlock['visualType'] : never }
              return updated
            }
          }
          return prev
        })
        break
      }
      case 'stream.completed': {
        // Commit blocks to the message
        const msgId = currentAssistantMsgIdRef.current
        setInProgressBlocks(currentBlocks => {
          if (msgId && currentBlocks.length > 0) {
            // Post-process: extract any visuals that ended up embedded in text blocks
            // due to partial-tag chunk boundary issues in the stream parser.
            const committed = extractEmbeddedVisuals(
              currentBlocks.map(b => b.kind === 'text' ? { ...b, isStreaming: false } : b)
            )
            setMessages(prev => prev.map(m =>
              m.id === msgId ? {
                ...m,
                content: '',
                isStreaming: false,
                blocks: committed,
                artifactComplete: true,
              } : m
            ))
          }
          return []
        })
        setIsLoading(false)
        setInProgressStatusMessage('')
        break
      }

      case 'plan.completed': {
        // Commit in-progress artifact state into the current assistant message
        const msgId = currentAssistantMsgIdRef.current
        const count = widgetCountRef.current

        setInProgressWidgets(currentWidgets => {
          setInProgressPlanPhases(currentPhases => {
            setInProgressThinkText(currentThinkText => {
              if (msgId) {
                setMessages(prev => prev.map(m =>
                  m.id === msgId ? {
                    ...m,
                    content: count > 0 ? '' : '生成完成',
                    isStreaming: false,
                    widgets: [...currentWidgets],
                    planPhases: [...currentPhases],
                    thinkText: currentThinkText,
                    artifactComplete: true,
                  } : m
                ))
              }
              return currentThinkText
            })
            return currentPhases
          })
          return currentWidgets
        })

        setIsLoading(false)
        setInProgressStatusMessage('')
        setInProgressIsTransition(false)
        setInProgressCurrentPhaseId(null)
        // Small delay to let the message update settle before clearing in-progress
        setTimeout(resetInProgress, 100)
        break
      }

      case 'error.surfaced': {
        const msgId = currentAssistantMsgIdRef.current
        setIsLoading(false)
        setInProgressStatusMessage('')
        if (msgId) {
          updateMessage(msgId, { content: `⚠ 出错: ${payload.message}`, isStreaming: false })
        }
        resetInProgress()
        break
      }
    }
  }, [upsertInProgressWidget, updateMessage, resetInProgress])

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return
    const userText = input.trim()
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    addMessage({ role: 'user', content: userText })
    const assistantMsgId = addMessage({ role: 'assistant', content: '', isStreaming: true })
    currentAssistantMsgIdRef.current = assistantMsgId

    resetInProgress()
    setInProgressStatusMessage('连接中…')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, conversationId: metaRef.current.conversationId, sessionId: 'default' }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data !== '[DONE]') processEvent(data)
          }
        }
      }

      // Fallback: if stream ended without plan.completed
      setIsLoading(prev => {
        if (prev) {
          const msgId = currentAssistantMsgIdRef.current
          if (msgId) updateMessage(msgId, { isStreaming: false })
          resetInProgress()
        }
        return false
      })
      setInProgressStatusMessage('')

    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        const msgId = currentAssistantMsgIdRef.current
        if (msgId) updateMessage(msgId, { content: `连接失败: ${(err as Error)?.message}`, isStreaming: false })
      }
      setIsLoading(false)
      setInProgressStatusMessage('')
      resetInProgress()
    }
  }, [input, isLoading, addMessage, updateMessage, processEvent, resetInProgress])

  // Keep handleSubmitRef current so the sendPrompt handler (declared earlier)
  // can trigger the latest version without a stale closure.
  handleSubmitRef.current = handleSubmit

  // After setInput settles (input === pendingText), fire the submit.
  useEffect(() => {
    if (pendingSendPromptRef.current && input === pendingSendPromptRef.current) {
      pendingSendPromptRef.current = null
      handleSubmitRef.current()
    }
  }, [input])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isLoading && input.trim()) handleSubmit() }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  // ─── Derived ───────────────────────────────────────────────────────────────

  // Build the InProgressArtifact object for the current streaming message
  const currentInProgress: InProgressArtifact | undefined = isLoading ? {
    widgets: inProgressWidgets,
    planPhases: inProgressPlanPhases,
    currentPhaseId: inProgressCurrentPhaseId,
    isTransition: inProgressIsTransition,
    transitionMessage: inProgressTransitionMessage,
    thinkText: inProgressThinkText,
    statusMessage: inProgressStatusMessage,
    blocks: inProgressBlocks,
  } : undefined

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        flexShrink: 0,
        borderBottom: '0.5px solid var(--border-default)',
        padding: '0 20px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="var(--accent)"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Artifacts
          </span>
        </div>

        {/* Header actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* JSON export — only shown when ARTIFACTS_DEBUG=true */}
          {process.env.NEXT_PUBLIC_DEBUG === 'true' && (
            <HeaderBtn
              label={jsonExportState === 'done' ? '已导出' : 'JSON'}
              icon={<Download width={11} height={11} />}
              disabled={!messages.length}
              done={jsonExportState === 'done'}
              onClick={handleJsonExport}
            />
          )}
          {/* Image export */}
          <HeaderBtn
            label={imgExportState === 'loading' ? '截图中…' : imgExportState === 'done' ? '已保存' : '导出图片'}
            icon={imgExportState === 'loading'
              ? <Loader2 width={11} height={11} style={{ animation: 'spin-accent 0.7s linear infinite' }} />
              : <ImageIcon width={11} height={11} />}
            disabled={!messages.length || imgExportState === 'loading'}
            done={imgExportState === 'done'}
            onClick={handleImgExport}
          />
          {/* Theme toggle */}
          <HeaderBtn
            label=""
            icon={theme === 'dark' ? <Sun width={12} height={12} /> : <Moon width={12} height={12} />}
            onClick={toggleTheme}
            square
          />
        </div>
      </header>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div
          ref={messagesRootRef}
          style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 12px' }}
        >
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 40, opacity: 0.5 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 14px', display: 'block' }}>
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="var(--accent)" opacity="0.6"/>
              </svg>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: 4 }}>有什么可以帮你的？</p>
              <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>发送任意请求，AI 将生成可视化内容</p>
            </div>
          )}

          {messages.map(msg => (
            <MessageItem
              key={msg.id}
              message={msg}
              inProgress={
                msg.id === currentAssistantMsgIdRef.current && isLoading
                  ? currentInProgress
                  : undefined
              }
            />
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input ───────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--border-default)', padding: '14px 20px 16px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div
            style={{
              background: 'var(--bg-input)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '10px 12px 10px 16px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
              transition: 'border-color 150ms ease',
            }}
            onFocusCapture={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKey}
              placeholder="发送消息… (Enter 发送，Shift+Enter 换行)"
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
                fontFamily: 'var(--font-sans)',
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={isLoading || !input.trim()}
              onMouseDown={e => { if (!isLoading && input.trim()) (e.currentTarget.style.transform = 'scale(0.95)') }}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              style={{
                flexShrink: 0,
                width: 30, height: 30,
                borderRadius: 'var(--radius-md)',
                background: (!isLoading && input.trim()) ? 'var(--accent)' : 'var(--bg-secondary)',
                border: 'none',
                cursor: (!isLoading && input.trim()) ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 150ms ease, transform 100ms ease',
              }}
            >
              {isLoading
                ? <Loader2 width={13} height={13} style={{ color: 'var(--text-tertiary)', animation: 'spin-accent 0.7s linear infinite' }} />
                : <ArrowUp width={13} height={13} style={{ color: input.trim() ? '#fff' : 'var(--text-disabled)' }} />
              }
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-disabled)', marginTop: 8 }}>
            {process.env.NEXT_PUBLIC_MODEL_NAME || 'gemini-2.5-flash'} · Streaming Artifacts
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Header button ────────────────────────────────────────────────────────────

function HeaderBtn({ label, icon, disabled, done, onClick, square }: {
  label: string; icon: React.ReactNode; disabled?: boolean; done?: boolean; onClick: () => void; square?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: square ? 0 : 5,
        padding: square ? '0' : '4px 10px',
        width: square ? 28 : undefined,
        height: 28,
        borderRadius: 'var(--radius-md)',
        border: `0.5px solid ${done ? 'var(--success)' : hov ? 'var(--border-hover)' : 'var(--border-default)'}`,
        background: done ? 'var(--success-bg)' : hov ? 'var(--bg-secondary)' : 'transparent',
        color: done ? 'var(--success)' : disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
        fontSize: '11.5px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 150ms ease',
        justifyContent: 'center',
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  )
}
