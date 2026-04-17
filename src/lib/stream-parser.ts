/**
 * StreamParser — 03号文档的实现
 * 基于 token 扫描的状态机，不做完整 XML 解析
 * 识别保留标签边界，发出解析事件
 */

import type { ParserEvent, WidgetProps } from './types'

type ParserState =
  | 'idle'
  | 'in_plan'
  | 'in_phase'
  | 'in_widget'
  | 'in_think'
  | 'in_edit'
  | 'in_modify'
  | 'in_append_after'
  | 'in_prepend_before'

// 顶层保留标签名
const RESERVED_TAGS = new Set([
  'plan', 'phase', 'widget', 'think', 'milestone',
  'acceptance', 'criterion', 'edit', 'modify',
  'append_after', 'prepend_before', 'remove',
  'outcome', 'clarify',
])

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const regex = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(attrString)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

export class StreamParser {
  private buffer = ''
  private state: ParserState = 'idle'
  private currentWidget: WidgetProps | null = null
  private currentPhaseId: string | null = null
  private currentEditTarget: string | null = null
  private currentModifyWidgetId: string | null = null
  private planDeclared = false
  private phaseHasMilestone = false
  // Track widget depth to handle nested tags (e.g. SVG/HTML inside widget)
  private widgetDepth = 0

  private handlers: Array<(event: ParserEvent) => void> = []

  on(handler: (event: ParserEvent) => void) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  private emit(event: ParserEvent) {
    for (const h of this.handlers) h(event)
  }

  /**
   * 将新的文本 chunk 送入解析器
   */
  push(text: string) {
    this.buffer += text
    this.processBuffer()
  }

  /**
   * 流结束时调用，强制关闭所有 open 的标签
   */
  end() {
    // 冲出剩余内容
    if (this.buffer.trim()) {
      this.flushContent(this.buffer)
      this.buffer = ''
    }
    // 强制关闭 widget
    if (this.state === 'in_widget' && this.currentWidget) {
      this.emit({ type: 'widget_closed', payload: { id: this.currentWidget.id, partial: true } })
      this.currentWidget = null
    }
    if (this.state === 'in_think') {
      this.emit({ type: 'think_finished', payload: {} })
    }
    if (this.state === 'in_phase' && this.currentPhaseId) {
      if (!this.phaseHasMilestone) {
        this.emit({ type: 'milestone', payload: { phaseId: this.currentPhaseId } })
      }
      this.emit({ type: 'phase_finished', payload: { id: this.currentPhaseId } })
    }
    if (this.state === 'in_plan') {
      this.emit({ type: 'plan_finished', payload: {} })
    }
    if (this.state === 'in_edit') {
      this.emit({ type: 'edit_finished', payload: {} })
    }
    this.state = 'idle'
  }

  private processBuffer() {
    while (true) {
      // 如果在 widget 内部，只寻找 </widget> 结束标签
      if (this.state === 'in_widget') {
        const result = this.processWidgetContent()
        if (!result) break
        continue
      }

      // 在 think 内部，寻找 </think>
      if (this.state === 'in_think') {
        const closeIdx = this.buffer.indexOf('</think>')
        if (closeIdx === -1) {
          // 缓冲末尾可能是半个标签，保留最后 10 个字符
          const safe = Math.max(0, this.buffer.length - 10)
          if (safe > 0) {
            this.emit({ type: 'think_chunk', payload: { text: this.buffer.slice(0, safe) } })
            this.buffer = this.buffer.slice(safe)
          }
          break
        }
        const content = this.buffer.slice(0, closeIdx)
        if (content) this.emit({ type: 'think_chunk', payload: { text: content } })
        this.buffer = this.buffer.slice(closeIdx + 8)
        this.emit({ type: 'think_finished', payload: {} })
        this.state = this.currentPhaseId ? 'in_phase' : 'idle'
        continue
      }

      // 寻找下一个 '<'
      const ltIdx = this.buffer.indexOf('<')
      if (ltIdx === -1) {
        // 没有标签，flush 所有内容
        if (this.buffer) {
          this.flushContent(this.buffer)
          this.buffer = ''
        }
        break
      }

      // flush '<' 之前的内容
      if (ltIdx > 0) {
        this.flushContent(this.buffer.slice(0, ltIdx))
        this.buffer = this.buffer.slice(ltIdx)
      }

      // 确保有完整的标签（找到 >）
      const gtIdx = this.buffer.indexOf('>')
      if (gtIdx === -1) {
        // 标签不完整，等待更多数据
        break
      }

      const tag = this.buffer.slice(0, gtIdx + 1)
      this.buffer = this.buffer.slice(gtIdx + 1)
      this.handleTag(tag)
    }
  }

  private processWidgetContent(): boolean {
    /**
     * 在 widget 内容中寻找真正的 </widget> 闭合标签。
     *
     * 需要跳过以下场景中的假匹配：
     *   1. <script>...</script> 块内部的 </widget>
     *   2. JS 模板字符串（backtick）内部的 </widget>
     *      e.g.  const s = `<widget>...</widget>`
     *
     * 不处理（V1 简化）：
     *   - HTML 注释内的 </widget>：<!-- </widget> -->
     *   - 单/双引号 JS 字符串内的 </widget>
     *   → 解决方式：在 skill pack 里要求模型使用 HTML 实体 &lt;/widget&gt;
     */
    let i = 0
    let found = false
    let scriptDepth = 0      // 跟踪 <script> 嵌套深度
    let backtickCount = 0    // 跟踪 backtick 数量（奇数 = 在模板字符串内）
    let countedUpTo = 0      // backtick 已计数到的位置

    while (i < this.buffer.length) {
      const ltIdx = this.buffer.indexOf('<', i)
      if (ltIdx === -1) break

      // 在到达此 '<' 之前，先更新 backtick 计数
      for (let j = countedUpTo; j < ltIdx; j++) {
        if (this.buffer[j] === '`' && (j === 0 || this.buffer[j - 1] !== '\\')) {
          backtickCount++
        }
      }
      countedUpTo = ltIdx
      const inTemplateLiteral = (backtickCount % 2) === 1

      const gtIdx = this.buffer.indexOf('>', ltIdx)
      if (gtIdx === -1) {
        // 不完整的标签，flush 到 ltIdx 前的内容
        const safe = ltIdx
        if (safe > 0) {
          this.emit({ type: 'widget_chunk', payload: { id: this.currentWidget!.id, text: this.buffer.slice(0, safe) } })
          this.buffer = this.buffer.slice(safe)
          // 重置计数（buffer 已截断）
          backtickCount = 0
          countedUpTo = 0
          scriptDepth = 0
        }
        return false
      }

      const tagContent = this.buffer.slice(ltIdx + 1, gtIdx).trim().toLowerCase()

      // 只在非模板字符串内跟踪 script 深度
      if (!inTemplateLiteral) {
        if (tagContent === 'script' || tagContent.startsWith('script ') || tagContent.startsWith('script\n')) {
          scriptDepth++
        } else if (tagContent === '/script') {
          scriptDepth = Math.max(0, scriptDepth - 1)
        }
      }

      // 只在 script 深度为 0 且不在模板字符串内才匹配 </widget>
      if (tagContent === '/widget' && scriptDepth === 0 && !inTemplateLiteral) {
        const beforeClose = this.buffer.slice(0, ltIdx)
        if (beforeClose) {
          this.emit({ type: 'widget_chunk', payload: { id: this.currentWidget!.id, text: beforeClose } })
        }
        this.buffer = this.buffer.slice(gtIdx + 1)
        this.emit({ type: 'widget_closed', payload: { id: this.currentWidget!.id, partial: false } })
        this.currentWidget = null
        this.state = this.currentPhaseId ? 'in_phase' : 'idle'
        found = true
        break
      }

      // 把 tag 本身也纳入 backtick 计数范围
      for (let j = countedUpTo; j <= gtIdx; j++) {
        if (this.buffer[j] === '`' && (j === 0 || this.buffer[j - 1] !== '\\')) {
          backtickCount++
        }
      }
      countedUpTo = gtIdx + 1
      i = gtIdx + 1
    }

    if (!found) {
      // flush 安全区域（保留末尾足够长度以防 </widget> 跨 chunk 分片）
      const reserve = 30
      const safe = Math.max(0, this.buffer.length - reserve)
      if (safe > 0) {
        this.emit({ type: 'widget_chunk', payload: { id: this.currentWidget!.id, text: this.buffer.slice(0, safe) } })
        this.buffer = this.buffer.slice(safe)
        // 对截断后的新 buffer 重置计数（简化：重新全扫）
        backtickCount = 0
        countedUpTo = 0
        scriptDepth = 0
      }
    }
    return found
  }

  private handleTag(tag: string) {
    // 自闭合
    if (tag.startsWith('<milestone')) {
      this.phaseHasMilestone = true
      this.emit({ type: 'milestone', payload: { phaseId: this.currentPhaseId } })
      return
    }

    if (tag.startsWith('<remove ') || tag === '<remove/>') {
      const attrs = parseAttributes(tag)
      this.emit({ type: 'remove', payload: { widgetId: attrs.widget_id } })
      return
    }

    // 开标签
    if (!tag.startsWith('</')) {
      const spaceIdx = tag.indexOf(' ')
      const tagName = spaceIdx === -1
        ? tag.slice(1, -1).trim()
        : tag.slice(1, spaceIdx).trim()

      if (!RESERVED_TAGS.has(tagName)) {
        this.flushContent(tag)
        return
      }

      const attrStr = spaceIdx === -1 ? '' : tag.slice(spaceIdx, -1)
      const attrs = parseAttributes(attrStr)

      switch (tagName) {
        case 'plan':
          this.planDeclared = true
          this.state = 'in_plan'
          this.emit({ type: 'plan_started', payload: { ...attrs } })
          break

        case 'phase':
          if (this.state === 'in_plan') break // 声明态，忽略内容
          this.currentPhaseId = attrs.id || `p_${Date.now()}`
          this.phaseHasMilestone = false
          this.state = 'in_phase'
          this.emit({ type: 'phase_started', payload: { id: this.currentPhaseId, goal: attrs.goal } })
          break

        case 'widget':
          if (this.state !== 'in_phase' && this.state !== 'in_modify' && this.state !== 'in_append_after' && this.state !== 'in_prepend_before') {
            // 孤儿 widget，降级处理
            this.emit({ type: 'warning', payload: { code: 'orphan_widget', detail: 'widget outside phase' } })
          }
          if (this.currentWidget) {
            // 非法嵌套，发 warning 忽略
            this.emit({ type: 'warning', payload: { code: 'nested_widget', detail: `nested widget ${attrs.id}` } })
            return
          }
          this.currentWidget = { id: attrs.id || `w_${Date.now()}`, type: attrs.type || 'markdown', title: attrs.title, ...attrs }
          this.state = 'in_widget'
          this.emit({ type: 'widget_opened', payload: { ...this.currentWidget } })
          break

        case 'think':
          if (this.state === 'in_phase' || this.state === 'in_edit') {
            const prevState = this.state
            this.state = 'in_think'
            this.emit({ type: 'think_started', payload: { prevState } })
          }
          break

        case 'edit':
          this.currentEditTarget = attrs.target_artifact || null
          this.state = 'in_edit'
          this.emit({ type: 'edit_started', payload: { targetArtifact: this.currentEditTarget } })
          break

        case 'modify':
          this.currentModifyWidgetId = attrs.widget_id || null
          this.state = 'in_modify'
          this.emit({ type: 'modify_started', payload: { widgetId: this.currentModifyWidgetId } })
          break

        case 'append_after':
          this.state = 'in_append_after'
          this.emit({ type: 'append_after', payload: { widgetId: attrs.widget_id } })
          break

        case 'prepend_before':
          this.state = 'in_prepend_before'
          this.emit({ type: 'append_after', payload: { widgetId: attrs.widget_id, prepend: true } })
          break

        // acceptance/criterion 在 in_plan 时跳过
        case 'acceptance':
        case 'criterion':
          break
      }
    } else {
      // 闭标签
      const tagName = tag.slice(2, -1).trim()

      switch (tagName) {
        case 'plan':
          this.state = 'idle'
          this.emit({ type: 'plan_finished', payload: {} })
          break

        case 'phase':
          if (this.state === 'in_plan') break
          if (this.currentPhaseId && !this.phaseHasMilestone) {
            this.emit({ type: 'milestone', payload: { phaseId: this.currentPhaseId } })
          }
          const pid = this.currentPhaseId
          this.currentPhaseId = null
          this.state = 'idle'
          this.emit({ type: 'phase_finished', payload: { id: pid } })
          break

        case 'widget':
          // 正常闭合由 processWidgetContent 处理，这里是 fallback
          if (this.currentWidget) {
            this.emit({ type: 'widget_closed', payload: { id: this.currentWidget.id, partial: false } })
            this.currentWidget = null
            this.state = this.currentPhaseId ? 'in_phase' : 'idle'
          }
          break

        case 'modify':
          this.state = 'in_edit'
          this.emit({ type: 'modify_finished', payload: { widgetId: this.currentModifyWidgetId } })
          this.currentModifyWidgetId = null
          break

        case 'edit':
          this.state = 'idle'
          this.emit({ type: 'edit_finished', payload: {} })
          break
      }
    }
  }

  private flushContent(text: string) {
    if (!text.trim()) return

    if (this.state === 'in_widget' && this.currentWidget) {
      this.emit({ type: 'widget_chunk', payload: { id: this.currentWidget.id, text } })
    } else if (this.state === 'in_think') {
      this.emit({ type: 'think_chunk', payload: { text } })
    } else if (this.state === 'in_phase') {
      // 裸文本 → 隐式 markdown widget
      const implicitId = `w_implicit_${Date.now()}`
      this.emit({ type: 'warning', payload: { code: 'bare_text_in_phase', detail: 'text wrapped as markdown' } })
      this.emit({ type: 'widget_opened', payload: { id: implicitId, type: 'markdown' } })
      this.emit({ type: 'widget_chunk', payload: { id: implicitId, text } })
      this.emit({ type: 'widget_closed', payload: { id: implicitId, partial: false } })
    }
    // idle 状态的裸文本丢弃
  }

  reset() {
    this.buffer = ''
    this.state = 'idle'
    this.currentWidget = null
    this.currentPhaseId = null
    this.currentEditTarget = null
    this.currentModifyWidgetId = null
    this.planDeclared = false
    this.phaseHasMilestone = false
  }
}
