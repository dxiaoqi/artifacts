'use client'

import type { WidgetState } from '@/components/WidgetRenderer'
import type { PlanPhase } from '@/components/PlanProgress'
import type { ContentBlock } from '@/lib/types'
import { SVG_CLASS_SYSTEM } from '@/lib/build-iframe-doc'

// ─── Shared ChatMessage type (for export) ────────────────────────────────────

export interface ExportableChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  // Legacy plan/phase/widget protocol
  widgets?: WidgetState[]
  planPhases?: PlanPhase[]
  thinkText?: string
  artifactComplete?: boolean
  // Visual V2 block protocol
  blocks?: ContentBlock[]
}

// ─── JSON Export ─────────────────────────────────────────────────────────────

export function exportConversationJson(messages: ExportableChatMessage[]): void {
  const exportedAt = new Date().toISOString()

  const serialised = messages.map((m, idx) => {
    const base = {
      index: idx,
      id: m.id,
      role: m.role,
      timestamp: m.timestamp,
      timestampHuman: new Date(m.timestamp).toISOString(),
      content: m.content || null,
    }

    // ── Visual V2 blocks ────────────────────────────────────────────────────
    if (m.blocks?.length) {
      return {
        ...base,
        protocol: 'visual-v2',
        blocks: m.blocks.map((b, bi) => {
          if (b.kind === 'text') {
            return {
              blockIndex: bi,
              kind: 'text',
              id: b.id,
              isStreaming: b.isStreaming,
              contentLength: b.content.length,
              contentPreview: b.content.slice(0, 300) + (b.content.length > 300 ? '…' : ''),
              // Full content for debugging
              content: b.content,
            }
          }
          return {
            blockIndex: bi,
            kind: 'visual',
            id: b.id,
            visualType: b.visualType,
            isComplete: b.isComplete,
            contentLength: b.content.length,
            contentPreview: b.content.slice(0, 200) + (b.content.length > 200 ? '…' : ''),
            // Full visual code for debugging
            content: b.content,
          }
        }),
      }
    }

    // ── Legacy plan/widget blocks ────────────────────────────────────────────
    if (m.widgets?.length) {
      return {
        ...base,
        protocol: 'legacy-widget',
        planPhases: m.planPhases?.map(p => ({
          id: p.id, goal: p.goal, status: p.status,
        })),
        widgets: m.widgets.map((w, wi) => ({
          widgetIndex: wi,
          id: w.id,
          type: w.type,
          title: w.title ?? null,
          isStreaming: w.isStreaming,
          partial: w.partial ?? false,
          contentLength: w.content.length,
          content: w.content,
        })),
      }
    }

    // ── Pure conversational ─────────────────────────────────────────────────
    return {
      ...base,
      protocol: 'conversational',
    }
  })

  const data = {
    exportedAt,
    appVersion: 'visual-v2',
    messageCount: messages.length,
    summary: {
      userMessages: messages.filter(m => m.role === 'user').length,
      assistantMessages: messages.filter(m => m.role === 'assistant').length,
      visualV2Messages: messages.filter(m => m.blocks?.length).length,
      legacyWidgetMessages: messages.filter(m => !m.blocks?.length && m.widgets?.length).length,
      conversationalMessages: messages.filter(m => !m.blocks?.length && !m.widgets?.length && m.role === 'assistant').length,
    },
    messages: serialised,
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `artifacts-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Visual block inline renderer ────────────────────────────────────────────
// Converts a completed visual block into a DOM element suitable for html2canvas.
// Used by both exportConversationAsImage and exportMessageAsImage to replace
// sandboxed iframes (which html2canvas can't capture) with equivalent inline content.

function renderVisualBlock(block: ContentBlock & { kind: 'visual' }): HTMLElement {
  const wrap = document.createElement('div')
  wrap.style.cssText = `
    border-radius: 10px;
    overflow: hidden;
    border: 0.5px solid rgba(61,57,41,0.12);
    background: #FAFAF8;
    margin: 2px 0;
  `

  if (block.visualType === 'svg') {
    // Inject the SVG class system so colours render correctly
    const style = document.createElement('style')
    style.textContent = SVG_CLASS_SYSTEM
    wrap.appendChild(style)
    const inner = document.createElement('div')
    inner.style.cssText = 'padding: 12px; display: flex; justify-content: center;'
    inner.innerHTML = block.content
    wrap.appendChild(inner)

  } else if (block.visualType === 'html') {
    // Strip scripts — the static markup is enough for a screenshot
    const stripped = block.content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    const inner = document.createElement('div')
    inner.style.cssText = 'padding: 0; overflow: hidden;'
    inner.innerHTML = stripped
    wrap.appendChild(inner)

  } else {
    // Three.js — can't be rendered statically
    wrap.style.background = '#0f172a'
    wrap.innerHTML = `
      <div style="
        padding: 32px 20px;
        text-align: center;
        color: #475569;
        font-family: system-ui, sans-serif;
        font-size: 13px;
      ">
        <div style="font-size:24px;margin-bottom:8px;">🌐</div>
        3D 场景（仅在交互模式下可用）
      </div>`
  }

  return wrap
}

/** Collect all complete visual blocks from a flat array of content blocks */
function visualBlocksFromBlocks(blocks: ContentBlock[]): Array<ContentBlock & { kind: 'visual' }> {
  return blocks.filter((b): b is ContentBlock & { kind: 'visual' } =>
    b.kind === 'visual' && b.isComplete
  )
}

/** Collect all complete visual blocks across multiple messages */
function visualBlocksFromMessages(messages: ExportableChatMessage[]): Array<ContentBlock & { kind: 'visual' }> {
  return messages.flatMap(m => visualBlocksFromBlocks(m.blocks ?? []))
}

/**
 * Replace every <iframe> in a cloned element with an inline visual block.
 * `visualBlocks` must be ordered the same way the iframes appear in the DOM.
 */
function inlineVisuals(clone: HTMLElement, visualBlocks: Array<ContentBlock & { kind: 'visual' }>) {
  const iframes = Array.from(clone.querySelectorAll('iframe'))
  iframes.forEach((iframe, i) => {
    const block = visualBlocks[i]
    let replacement: HTMLElement
    if (block) {
      replacement = renderVisualBlock(block)
    } else {
      replacement = document.createElement('div')
      replacement.style.cssText = `
        padding: 12px 16px;
        border-radius: 8px;
        border: 0.5px solid rgba(61,57,41,0.1);
        background: #F0EEE6;
        color: #83827D;
        font-family: system-ui, sans-serif;
        font-size: 12px;
      `
      replacement.textContent = '交互组件（无法在截图中显示）'
    }
    // Match the iframe's rendered height if possible
    const h = (iframe as HTMLIFrameElement).style.height || iframe.getAttribute('height')
    if (h) replacement.style.minHeight = h
    iframe.parentNode?.replaceChild(replacement, iframe)
  })
}

// ─── Shared canvas helpers ────────────────────────────────────────────────────

function getVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

async function captureElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default
  return html2canvas(el, {
    backgroundColor: getVar('--bg-primary', '#262624'),
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  })
}

// ─── Conversation image export ────────────────────────────────────────────────

export async function exportConversationAsImage(
  messagesRoot: HTMLElement,
  messages: ExportableChatMessage[],
): Promise<void> {
  const bgColor = getVar('--bg-primary', '#262624')

  const container = document.createElement('div')
  container.style.cssText = `
    background: ${bgColor};
    padding: 32px 40px 40px;
    font-family: ${getVar('--font-sans', 'system-ui')};
    max-width: 840px;
    position: fixed;
    left: -9999px;
    top: 0;
    z-index: -1;
  `

  // Header
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  const header = document.createElement('div')
  header.style.cssText = `display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:0.5px solid ${getVar('--border-default', 'rgba(245,244,238,0.1)')}`
  header.innerHTML = `
    <span style="font-size:13px;font-weight:500;color:${getVar('--accent','#D97757')};">✦ Artifacts</span>
    <span style="font-size:11px;color:${getVar('--text-tertiary','#83827D')};">${date}</span>
  `
  container.appendChild(header)

  // Clone messages and inline visuals from block data
  const clone = messagesRoot.cloneNode(true) as HTMLElement
  inlineVisuals(clone, visualBlocksFromMessages(messages))
  container.appendChild(clone)

  document.body.appendChild(container)
  try {
    const canvas = await captureElement(container)
    downloadCanvas(canvas, `conversation-${new Date().toISOString().slice(0, 10)}.png`)
  } finally {
    document.body.removeChild(container)
  }
}

// ─── Single message image export ─────────────────────────────────────────────

export async function exportMessageAsImage(
  msgElement: HTMLElement,
  _origMsgElement: HTMLElement,
  label?: string,
  blocks?: ContentBlock[],
): Promise<void> {
  const bgColor = getVar('--bg-primary', '#262624')

  const container = document.createElement('div')
  container.style.cssText = `
    background: ${bgColor};
    padding: 28px 36px 36px;
    font-family: ${getVar('--font-sans', 'system-ui')};
    max-width: 800px;
    position: fixed;
    left: -9999px;
    top: 0;
    z-index: -1;
  `

  if (label) {
    const lbl = document.createElement('div')
    lbl.style.cssText = `font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:${getVar('--text-tertiary','#83827D')};margin-bottom:16px;`
    lbl.textContent = `✦ Artifacts · Message`
    container.appendChild(lbl)
  }

  const clone = msgElement.cloneNode(true) as HTMLElement
  inlineVisuals(clone, visualBlocksFromBlocks(blocks ?? []))
  container.appendChild(clone)

  document.body.appendChild(container)
  try {
    const canvas = await captureElement(container)
    downloadCanvas(canvas, `message-${Date.now()}.png`)
  } finally {
    document.body.removeChild(container)
  }
}

// ─── (legacy) Single artifact export — kept for compat ───────────────────────

/**
 * Export the current artifact as a PNG image.
 *
 * Layout (top → bottom):
 *   ┌─────────────────────────┐
 *   │  Streaming Artifacts      date │  ← header row
 *   ├─────────────────────────┤
 *   │  问题: {question}        │  ← user question card
 *   ├─────────────────────────┤
 *   │  widget 1               │
 *   │  widget 2               │  ← artifact content
 *   │  widget 3               │
 *   ├─────────────────────────┤
 *   │            Generated... │  ← footer
 *   └─────────────────────────┘
 *
 * Implementation notes:
 *  - html2canvas can't see iframe content (sandbox restriction).
 *    We clone each widget-container and replace every <iframe> with
 *    either its contentDocument body (scripts stripped) or a fallback pill.
 *  - Charts render on <canvas> elements that html2canvas captures fine.
 *  - SVG elements are captured inline.
 *  - The container is mounted off-screen, captured, then removed.
 */

export interface ExportOptions {
  question: string
  /** Ref to the div that wraps all .widget-container elements */
  widgetsRoot: HTMLDivElement
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripScripts(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}

/** Resolve the iframe: try to read its contentDocument, else return null */
function resolveIframe(iframe: HTMLIFrameElement): string | null {
  try {
    const doc = iframe.contentDocument
    if (doc?.body) {
      return stripScripts(doc.body.innerHTML)
    }
  } catch {
    // cross-origin / sandbox error
  }
  return null
}

/** Replace all <iframe> elements inside a cloned node with inline <div> equivalents */
function inlineIframes(clone: HTMLElement, original: Element) {
  const cloneIframes = Array.from(clone.querySelectorAll('iframe'))
  const origIframes = Array.from(original.querySelectorAll('iframe')) as HTMLIFrameElement[]

  cloneIframes.forEach((cloneIframe, idx) => {
    const origIframe = origIframes[idx]
    const replacement = document.createElement('div')
    replacement.style.cssText = `
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #1e293b;
      background: #f8fafc;
      color: #1e293b;
    `

    const innerHtml = origIframe ? resolveIframe(origIframe) : null
    if (innerHtml !== null) {
      // Apply some basic reset so the captured iframe content looks reasonable
      replacement.innerHTML = `
        <div style="font-family:system-ui,sans-serif;padding:16px;max-width:100%">
          ${innerHtml}
        </div>`
    } else {
      replacement.innerHTML = `
        <div style="
          padding: 16px 20px;
          color: #64748b;
          font-size: 13px;
          font-family: system-ui, sans-serif;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #1e293b;
          border-radius: 8px;
        ">
          <span style="font-size:16px">⚡</span>
          <span>交互组件（导出时显示为静态截图不可用）</span>
        </div>`
    }

    cloneIframe.parentNode?.replaceChild(replacement, cloneIframe)
  })
}

function buildContainer(question: string, widgetsRoot: HTMLDivElement): HTMLDivElement {
  const EXPORT_WIDTH = 860
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

  const container = document.createElement('div')
  container.style.cssText = `
    width: ${EXPORT_WIDTH}px;
    background: #020817;
    padding: 40px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    position: fixed;
    left: -9999px;
    top: 0;
    z-index: -1;
  `

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:24px'
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          fill="#6366f1" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span style="color:#94a3b8;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">
        Streaming Artifacts
      </span>
    </div>
    <span style="color:#475569;font-size:11px">${escapeHtml(date)}</span>
  `
  container.appendChild(header)

  // ── Divider ────────────────────────────────────────────────────────────────
  const divider1 = document.createElement('div')
  divider1.style.cssText = 'height:1px;background:#1e293b;margin-bottom:24px'
  container.appendChild(divider1)

  // ── Question card ──────────────────────────────────────────────────────────
  const questionCard = document.createElement('div')
  questionCard.style.cssText = `
    background: rgba(99,102,241,0.08);
    border: 1px solid rgba(99,102,241,0.25);
    border-radius: 14px;
    padding: 18px 22px;
    margin-bottom: 32px;
  `
  questionCard.innerHTML = `
    <div style="color:#a78bfa;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px">
      用户问题
    </div>
    <div style="color:#e2e8f0;font-size:15px;line-height:1.75;word-break:break-word">
      ${escapeHtml(question)}
    </div>
  `
  container.appendChild(questionCard)

  // ── Widgets ────────────────────────────────────────────────────────────────
  const widgetWrap = document.createElement('div')
  widgetWrap.style.cssText = 'display:flex;flex-direction:column;gap:24px'

  const widgetNodes = widgetsRoot.querySelectorAll('.widget-container')
  widgetNodes.forEach((original) => {
    const clone = original.cloneNode(true) as HTMLElement
    // Reset any transform / animation state from the live widget
    clone.style.animation = 'none'
    clone.style.transform = 'none'
    clone.style.opacity = '1'
    inlineIframes(clone, original)
    widgetWrap.appendChild(clone)
  })

  container.appendChild(widgetWrap)

  // ── Footer ─────────────────────────────────────────────────────────────────
  const divider2 = document.createElement('div')
  divider2.style.cssText = 'height:1px;background:#1e293b;margin-top:32px;margin-bottom:16px'
  container.appendChild(divider2)

  const footer = document.createElement('div')
  footer.style.cssText = 'display:flex;justify-content:flex-end'
  footer.innerHTML = `
    <span style="color:#334155;font-size:10px;font-family:system-ui,sans-serif">
      Generated with Streaming Artifacts
    </span>`
  container.appendChild(footer)

  return container
}

export async function exportArtifact(opts: ExportOptions): Promise<void> {
  const { question, widgetsRoot } = opts

  // Dynamic import so html2canvas is only loaded when needed
  const html2canvas = (await import('html2canvas')).default

  const container = buildContainer(question, widgetsRoot)
  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: '#020817',
      scale: 2,          // retina quality
      useCORS: true,
      allowTaint: true,
      logging: false,
      // Ensure the full height is captured
      windowWidth: container.scrollWidth,
      windowHeight: container.scrollHeight,
    })

    const slug = question.slice(0, 24).trim().replace(/[\s/\\?#]+/g, '-')
    const ts = new Date().toISOString().slice(0, 10)
    const filename = `artifact-${slug}-${ts}.png`

    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    document.body.removeChild(container)
  }
}
