/**
 * visual-stream-parser.ts
 * Stateful streaming parser for the <text>/<visual> protocol.
 *
 * Protocol grammar:
 *   response   ::= (think | text_block | visual_block | bare_text)*
 *   think      ::= <think>…</think>
 *   text_block ::= <text>…</text>
 *   visual_block ::= <visual type="svg|html|threejs">…</visual>
 *   bare_text  ::= any text not wrapped in a tag (treated as text_block)
 *
 * Events:
 *   think_chunk    — CoT content (not shown to user, useful for debugging)
 *   think_end
 *   text_start     — beginning of a new text block
 *   text_chunk     — streaming text content (fired as bytes arrive)
 *   text_end       — text block complete
 *   visual_start   — visual block opening tag seen (shows skeleton)
 *   visual_end     — visual block complete (content + type available)
 *   warning        — soft parse issue (non-fatal)
 */

export type VisualParserEventType =
  | 'think_chunk'
  | 'think_end'
  | 'text_start'
  | 'text_chunk'
  | 'text_end'
  | 'visual_start'
  | 'visual_end'
  | 'warning'

export interface VisualParserEvent {
  type: VisualParserEventType
  payload: Record<string, unknown>
}

type InternalState = 'idle' | 'in_think' | 'in_text' | 'in_visual'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any

export class VisualStreamParser {
  private state: InternalState = 'idle'
  private buffer = ''
  private currentVisualType = ''
  private handlers: Array<(e: VisualParserEvent) => void> = []
  private textBlockOpen = false

  on(handler: (e: VisualParserEvent) => void) {
    this.handlers.push(handler)
    return () => { this.handlers = this.handlers.filter(h => h !== handler) }
  }

  private emit(type: VisualParserEventType, payload: Record<string, unknown> = {}) {
    for (const h of this.handlers) h({ type, payload })
  }

  push(chunk: string) {
    this.buffer += chunk
    this.process()
  }

  end() {
    // Flush remaining buffer
    if (this.buffer.trim()) {
      if (this.state === 'in_text') {
        this.emit('text_chunk', { text: this.buffer })
        this.emit('text_end', {})
      } else if (this.state === 'in_visual') {
        // Incomplete visual — still emit what we have
        this.emit('visual_end', {
          visualType: this.currentVisualType,
          content: this.buffer,
          isComplete: false,
        })
      } else if (this.state === 'idle' && this.buffer.trim()) {
        // Bare text at end
        this.emit('text_start', {})
        this.emit('text_chunk', { text: this.buffer })
        this.emit('text_end', {})
      } else if (this.state === 'in_think') {
        this.emit('think_chunk', { text: this.buffer })
        this.emit('think_end', {})
      }
    }

    // Close any open text block
    if (this.textBlockOpen) {
      this.emit('text_end', {})
      this.textBlockOpen = false
    }

    this.buffer = ''
    this.state = 'idle'
  }

  /**
   * Find the opening <visual type="..."> tag in `buf`.
   * More robust than a simple regex — handles extra attributes and single quotes.
   * Returns null if the tag isn't found or is incomplete (need more data).
   */
  private findVisualOpen(buf: string): { idx: number; type: string; length: number } | null {
    const ltIdx = buf.indexOf('<visual')
    if (ltIdx === -1) return null
    const gtIdx = buf.indexOf('>', ltIdx)
    if (gtIdx === -1) return null  // Incomplete tag

    const tagContent = buf.slice(ltIdx, gtIdx + 1)
    const typeMatch = tagContent.match(/type\s*=\s*['"]([^'"]+)['"]/)
    if (!typeMatch) return null

    return { idx: ltIdx, type: typeMatch[1], length: gtIdx - ltIdx + 1 }
  }

  private process() {
    while (true) {
      // ── In <think> ────────────────────────────────────────────────────────
      if (this.state === 'in_think') {
        const end = this.buffer.indexOf('</think>')
        if (end === -1) {
          // Flush safe portion (keep 8 chars for closing tag overlap)
          const safe = this.buffer.slice(0, Math.max(0, this.buffer.length - 8))
          if (safe) {
            this.emit('think_chunk', { text: safe })
            this.buffer = this.buffer.slice(safe.length)
          }
          break
        }
        const content = this.buffer.slice(0, end)
        if (content) this.emit('think_chunk', { text: content })
        this.emit('think_end', {})
        this.buffer = this.buffer.slice(end + 8)
        this.state = 'idle'
        continue
      }

      // ── In <text> ─────────────────────────────────────────────────────────
      if (this.state === 'in_text') {
        // Look for <visual> opening tag (handles extra attributes, single quotes)
        const vm = this.findVisualOpen(this.buffer)

        // Find </text> but ONLY for the OUTER </text>, not SVG <text> close tags.
        // Strategy: if <visual> starts before </text>, the </text> might belong to
        // SVG content inside the visual — process visual first.
        const textEnd = this.buffer.indexOf('</text>')

        if (vm === null && textEnd === -1) {
          // Neither found yet — flush safe portion.
          // Reserve enough to detect a partial '<visual' tag at the buffer end.
          // '<visual type="threejs">' is 24 chars; keep 40 to be safe.
          // Also: never flush past a '<' that could start '<visual'.
          const ltIdx = this.buffer.lastIndexOf('<')
          const reserveByTag = ltIdx !== -1 ? this.buffer.length - ltIdx : 0
          const reserve = Math.max(40, reserveByTag)
          const safe = this.buffer.slice(0, Math.max(0, this.buffer.length - reserve))
          if (safe) {
            this.emit('text_chunk', { text: safe })
            this.buffer = this.buffer.slice(safe.length)
          }
          break
        }

        const visualIdx = vm?.idx ?? -1

        if (vm !== null && (textEnd === -1 || visualIdx < textEnd)) {
          // <visual> appears before </text> — model nested visual inside text.
          // Close text block early, then start the visual block.
          const before = this.buffer.slice(0, visualIdx)
          if (before.trim()) this.emit('text_chunk', { text: before })
          this.emit('text_end', {})
          this.textBlockOpen = false
          this.buffer = this.buffer.slice(visualIdx + vm.length)
          this.currentVisualType = vm.type
          this.emit('visual_start', { visualType: vm.type })
          this.state = 'in_visual'
          continue
        }

        // Normal </text> close
        const content = this.buffer.slice(0, textEnd)
        if (content) this.emit('text_chunk', { text: content })
        this.emit('text_end', {})
        this.textBlockOpen = false
        this.buffer = this.buffer.slice(textEnd + 7)
        this.state = 'idle'
        continue
      }

      // ── In <visual> ───────────────────────────────────────────────────────
      if (this.state === 'in_visual') {
        // Use robust detection to skip </visual> inside <script> blocks and
        // JS template literals — same technique as StreamParser.processWidgetContent.
        const end = this.findVisualEnd()
        if (end === -1) {
          // Not found yet — buffer until complete (rendered atomically)
          break
        }
        const content = this.buffer.slice(0, end).trim()
        this.emit('visual_end', {
          visualType: this.currentVisualType,
          content,
          isComplete: true,
        })
        this.buffer = this.buffer.slice(end + 9) // 9 === '</visual>'.length
        this.state = 'idle'
        continue
      }

      // ── Idle: look for next tag ───────────────────────────────────────────
      if (this.state === 'idle') {
        // Find earliest opening tag
        type TagEntry = { tag: string; idx: number; next: InternalState; prefix: number }
        const positions: TagEntry[] = [
          { tag: '<think>', idx: this.buffer.indexOf('<think>'), next: 'in_think', prefix: 7 },
          { tag: '<text>', idx: this.buffer.indexOf('<text>'), next: 'in_text', prefix: 6 },
        ]

        // <visual type="..."> — use robust helper to handle extra attributes
        const vm = this.findVisualOpen(this.buffer)
        if (vm) {
          positions.push({
            tag: this.buffer.slice(vm.idx, vm.idx + vm.length),
            idx: vm.idx,
            next: 'in_visual',
            prefix: vm.length,
          })
        }

        const valid = positions.filter(p => p.idx !== -1).sort((a, b) => a.idx - b.idx)

        if (valid.length === 0) {
          // No complete tag found — treat leading content as bare text (preamble).
          // CRITICAL: reserve from the last '<' so we never flush a partial
          // '<visual type="...">' opening tag across chunk boundaries.
          const ltIdx = this.buffer.lastIndexOf('<')
          const reserveByLt = ltIdx !== -1 ? this.buffer.length - ltIdx : 0
          const reserve = Math.max(12, reserveByLt)
          const safe = this.buffer.length > reserve ? this.buffer.slice(0, this.buffer.length - reserve) : ''
          if (safe) {
            if (!this.textBlockOpen) {
              this.emit('text_start', {})
              this.textBlockOpen = true
            }
            this.emit('text_chunk', { text: safe })
            this.buffer = this.buffer.slice(safe.length)
          }
          break
        }

        const first = valid[0]

        // Text before the tag = bare text
        if (first.idx > 0) {
          const before = this.buffer.slice(0, first.idx)
          if (before.trim()) {
            if (!this.textBlockOpen) {
              this.emit('text_start', {})
              this.textBlockOpen = true
            }
            this.emit('text_chunk', { text: before })
          }
        }

        // Close any open bare-text block if entering a structured block
        if (this.textBlockOpen && first.next !== 'in_text') {
          this.emit('text_end', {})
          this.textBlockOpen = false
        }

        this.buffer = this.buffer.slice(first.idx + first.prefix)

        if (first.next === 'in_visual' && vm) {
          this.currentVisualType = vm.type
          this.emit('visual_start', { visualType: vm.type })
        } else if (first.next === 'in_text') {
          this.emit('text_start', {})
          this.textBlockOpen = true
        }

        this.state = first.next
        continue
      }

      break
    }
  }

  /**
   * Robust search for the closing </visual> tag.
   * Skips matches that appear inside:
   *   • <script>...</script> blocks  (scriptDepth > 0)
   *   • JS template literals delimited by backticks  (backtickCount is odd)
   *
   * Returns the index of the '<' in '</visual>', or -1 if not found.
   */
  private findVisualEnd(): number {
    let scriptDepth = 0
    let backtickCount = 0
    let countedUpTo = 0
    let i = 0

    while (i < this.buffer.length) {
      const ltIdx = this.buffer.indexOf('<', i)
      if (ltIdx === -1) break

      // Count backticks between last counted position and ltIdx
      for (let j = countedUpTo; j < ltIdx; j++) {
        if (this.buffer[j] === '`' && (j === 0 || this.buffer[j - 1] !== '\\')) {
          backtickCount++
        }
      }
      countedUpTo = ltIdx
      const inTemplateLiteral = (backtickCount % 2) === 1

      const gtIdx = this.buffer.indexOf('>', ltIdx)
      if (gtIdx === -1) {
        // Incomplete tag — caller should wait for more data
        break
      }

      const tagContent = this.buffer.slice(ltIdx + 1, gtIdx).trim().toLowerCase()

      // Track <script> depth (only outside template literals)
      if (!inTemplateLiteral) {
        if (tagContent === 'script' || tagContent.startsWith('script ') || tagContent.startsWith('script\n')) {
          scriptDepth++
        } else if (tagContent === '/script') {
          scriptDepth = Math.max(0, scriptDepth - 1)
        }
      }

      // Also count backticks within the tag itself
      for (let j = countedUpTo; j <= gtIdx; j++) {
        if (this.buffer[j] === '`' && (j === 0 || this.buffer[j - 1] !== '\\')) {
          backtickCount++
        }
      }
      countedUpTo = gtIdx + 1

      // Match only when outside script blocks and template literals
      if (tagContent === '/visual' && scriptDepth === 0 && !inTemplateLiteral) {
        return ltIdx
      }

      i = gtIdx + 1
    }

    return -1
  }

  reset() {
    this.buffer = ''
    this.state = 'idle'
    this.currentVisualType = ''
    this.textBlockOpen = false
  }
}
