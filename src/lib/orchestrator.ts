/**
 * Orchestrator — 核心编排层
 * V1 (legacy): plan/phase/widget protocol
 * V2 (visual):  text/visual block protocol  ← active
 */

import type {
  Plan, Phase, Dimensions, Criterion, WidgetSnapshot,
  DisplayEvent, PhaseOutcome,
} from './types'
import { streamCall, callOnce, callStructured, type Message } from './llm-client'
import { RouterDecisionSchema } from './tools'
import { VisualStreamParser } from './visual-stream-parser'
import { StreamParser } from './stream-parser'
import { buildVisualSystemPrompt } from './skill-loader'
import { buildSystemPrompt } from './skill-loader'
import { stateStore } from './state-store'
import { runCritic } from './critic'
import { artifactsDefaultEnabled, projectConfig } from './config'

// ─── Trivial input check (shared by both orchestrators) ──────────────────────

function isTrivialInput(input: string): boolean {
  const t = input.trim()
  // \W is ASCII-only in JS — Chinese chars match \W and get stripped, making all
  // Chinese input appear "trivial". Use \s-only replacement to count meaningful chars.
  if (t.replace(/\s/g, '').length < 4) return true
  if (/^[?？!！.。…,，、~～\s]+$/.test(t)) return true
  if (/^(hi|hello|hey|你好|在吗|早上好|嗨)[\s!！。~]*$/i.test(t)) return true
  if (/^(嗯+|好的|收到|谢谢|ok|哦)[\s!！。]*$/i.test(t)) return true
  return false
}

// ─── Conversational reply helper (shared) ────────────────────────────────────

const CONVERSATIONAL_SYSTEM =
  '你是一个友好的 AI 助手。用自然语言直接回复用户，语气匹配用户的调性。\n' +
  '禁止输出任何 XML 标签（<plan>、<widget>、<text>、<visual> 等）。'

async function runConversationalReply(
  conversationId: string,
  turnId: string,
  artifactId: string,
  userInput: string,
  signal: AbortSignal | undefined,
  emit: (type: import('./types').DisplayEvent['type'], payload?: Record<string, unknown>) => void,
  systemOverride?: string,
) {
  const history = stateStore.getRecentHistory(conversationId, 4)
  let reply = ''
  try {
    await streamCall({
      messages: [
        { role: 'system', content: systemOverride ?? CONVERSATIONAL_SYSTEM },
        ...history,
        { role: 'user', content: userInput },
      ],
      maxTokens: 600,
      temperature: 0.8,
      signal,
      onChunk: (text) => {
        reply += text
        emit('conversational.reply', { text, done: false })
      },
    })
  } catch {
    const fallback = '抱歉，我暂时没法回复，请稍后再试。'
    emit('conversational.reply', { text: fallback, done: false })
    reply = fallback
  }
  if (reply) stateStore.setAssistantReply(turnId, reply)
  emit('conversational.reply', { text: '', done: true, full: reply })
  stateStore.updateTurnStatus(turnId, 'completed', artifactId)
}

// ─── Visual Orchestrator (V2) ────────────────────────────────────────────────

export interface VisualOrchestratorOptions {
  conversationId: string
  turnId: string
  artifactId: string
  userInput: string
  signal?: AbortSignal
  onEvent: (event: DisplayEvent) => void
}

export async function runVisualOrchestrator(opts: VisualOrchestratorOptions) {
  const { conversationId, turnId, artifactId, userInput, signal, onEvent } = opts

  const emit = (type: DisplayEvent['type'], payload: Record<string, unknown> = {}) => {
    onEvent({ type, payload })
  }

  emit('status', { message: '正在思考…' })

  // ── 0. Trivial gate ──────────────────────────────────────────────────────
  if (isTrivialInput(userInput)) {
    await runConversationalReply(conversationId, turnId, artifactId, userInput, signal, emit,
      '你是一个友好的 AI 助手。用户发来的是打招呼或简短消息，直接用自然语言简短回复，不要输出任何 XML 标签。')
    return
  }

  // ── 1. Routing decision ──────────────────────────────────────────────────
  const history = stateStore.getRecentHistory(conversationId, 4)

  if (!artifactsDefaultEnabled) {
    const ROUTING_SYSTEM =
      'Decide if the user needs a visual artifact or a conversational reply.\n' +
      'mode="artifact": needs diagrams, interactive components, data charts, or structured visual content.\n' +
      'mode="conversational": chat, opinions, open-ended learning, greetings.\n' +
      'Respond ONLY with the JSON object.'
    emit('tool.start', { tool: 'routing', description: '分析请求意图…' })
    let routing: { mode: 'artifact' | 'conversational' }
    try {
      routing = await callStructured(
        [...history, { role: 'user', content: userInput }],
        RouterDecisionSchema,
        { system: ROUTING_SYSTEM, maxTokens: projectConfig.llm.routingMaxTokens, fallback: { mode: 'artifact' } },
      )
    } catch { routing = { mode: 'artifact' } }
    emit('tool.done', { tool: 'routing', result: routing.mode })
    if (routing.mode === 'conversational') {
      await runConversationalReply(conversationId, turnId, artifactId, userInput, signal, emit)
      return
    }
  }

  // ── 2. Build system prompt ───────────────────────────────────────────────
  emit('status', { message: '正在生成…' })

  const artifactHint = artifactsDefaultEnabled
    ? '\n\n[STRICT OUTPUT RULE]\n' +
      '- ALL interactive components, calculators, charts, diagrams MUST use <visual type="html"> or <visual type="svg">.\n' +
      '- NEVER wrap HTML/SVG code in markdown fences (```html). Use <visual type="html"> ONLY.\n' +
      '- NEVER output "Here is the code:" followed by a code block. Render it directly.\n' +
      '- If the user asks to build/create/show something interactive, output <visual type="html"> immediately.'
    : ''
  const systemPrompt = buildVisualSystemPrompt() + artifactHint

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userInput },
  ]

  // ── 3. Stream and parse ──────────────────────────────────────────────────
  let blockCounter = 0
  const parser = new VisualStreamParser()
  let fullResponse = ''
  let hasAnyBlock = false

  // Track incomplete visual blocks for continuation
  interface IncompleteVisual {
    blockId: string
    visualType: string
    partialContent: string
  }
  let incompleteVisual: IncompleteVisual | null = null
  let lastVisualBlockId = ''
  let lastVisualType = ''

  parser.on((event) => {
    switch (event.type) {
      case 'think_chunk':
        emit('think.chunk', { text: event.payload.text })
        break
      case 'think_end':
        emit('think.finished', {})
        break

      case 'text_start':
        blockCounter++
        emit('block.text_start', { blockId: `b${blockCounter}` })
        hasAnyBlock = true
        break
      case 'text_chunk':
        emit('block.text_chunk', { text: event.payload.text })
        hasAnyBlock = true
        break
      case 'text_end':
        emit('block.text_end', {})
        break

      case 'visual_start':
        blockCounter++
        lastVisualBlockId = `b${blockCounter}`
        lastVisualType = String(event.payload.visualType ?? 'html')
        emit('block.visual_start', { blockId: lastVisualBlockId, visualType: lastVisualType })
        hasAnyBlock = true
        incompleteVisual = null  // reset
        break
      case 'visual_end':
        if (event.payload.isComplete) {
          emit('block.visual', {
            blockId: lastVisualBlockId,
            visualType: event.payload.visualType,
            content: event.payload.content,
          })
          incompleteVisual = null
        } else {
          // Stream ended before </visual> — save partial for continuation
          incompleteVisual = {
            blockId: lastVisualBlockId,
            visualType: lastVisualType,
            partialContent: String(event.payload.content ?? ''),
          }
        }
        break
    }
  })

  let finishReason: 'stop' | 'length' | null = null
  try {
    const result = await streamCall({
      messages,
      maxTokens: projectConfig.llm.maxTokens,
      temperature: projectConfig.llm.temperature,
      signal,
      onChunk: (text) => {
        fullResponse += text
        parser.push(text)
      },
    })
    finishReason = result.finishReason
  } catch (err: unknown) {
    const name = (err as Error)?.name
    if (name === 'AbortError' || signal?.aborted) {
      emit('error.surfaced', { message: '生成被中断' })
    } else {
      emit('error.surfaced', { message: `生成失败: ${(err as Error)?.message || '未知错误'}` })
    }
    stateStore.updateArtifactStatus(artifactId, 'ready')
    stateStore.updateTurnStatus(turnId, 'errored', artifactId)
    return
  }

  parser.end()


  // ── 3b. Continuation: if truncated, keep completing the visual ───────────
  const MAX_CONTINUATIONS = 3
  let continuationCount = 0

  while (
    finishReason === 'length' &&
    incompleteVisual !== null &&
    !signal?.aborted &&
    continuationCount < MAX_CONTINUATIONS
  ) {
    continuationCount++
    // snapshot so TypeScript knows it's non-null inside this iteration
    const snap = incompleteVisual as IncompleteVisual
    emit('status', { message: `补全中… (${continuationCount}/${MAX_CONTINUATIONS})` })

    const contMessages: Message[] = [
      ...messages,
      { role: 'assistant', content: fullResponse },
      {
        role: 'user',
        content: '[CONTINUE] Continue generating exactly from where you stopped. ' +
          'Do NOT repeat content. Do NOT add any preamble. ' +
          'Just continue the code from the exact cutoff point.',
      },
    ]

    incompleteVisual = null   // reset before next parse
    finishReason = null

    const contParser = new VisualStreamParser()
    let contVisualContent = ''

    contParser.on((event) => {
      switch (event.type) {
        case 'text_chunk':
          contVisualContent += String(event.payload.text ?? '')
          break
        case 'visual_end':
          if (event.payload.isComplete) {
            contVisualContent += String(event.payload.content ?? '')
          } else {
            incompleteVisual = {
              blockId: snap.blockId,
              visualType: snap.visualType,
              partialContent: snap.partialContent + contVisualContent + String(event.payload.content ?? ''),
            }
          }
          break
        case 'visual_start':
          break
      }
    })

    try {
      const contResult = await streamCall({
        messages: contMessages,
        maxTokens: projectConfig.llm.maxTokens,
        temperature: 0,
        signal,
        onChunk: (text) => {
          fullResponse += text
          contParser.push(text)
        },
      })
      finishReason = contResult.finishReason
    } catch {
      break
    }

    contParser.end()

    const mergedContent = snap.partialContent + contVisualContent

    if (incompleteVisual === null) {
      emit('block.visual', {
        blockId: snap.blockId,
        visualType: snap.visualType,
        content: mergedContent,
      })
    } else {
      ;(incompleteVisual as IncompleteVisual).partialContent = mergedContent
    }
  }

  // Hit max continuations — emit whatever we have so the user sees something
  if (incompleteVisual !== null) {
    const iv = incompleteVisual as IncompleteVisual
    emit('block.visual', {
      blockId: iv.blockId,
      visualType: iv.visualType,
      content: iv.partialContent,
    })
  }

  // ── 4. Safety net ────────────────────────────────────────────────────────
  if (!hasAnyBlock && fullResponse.trim()) {
    // Before degrading: check if the model output markdown fenced code blocks
    // (```html / ```svg / ```javascript) instead of <visual> tags.
    // Extract the first fenced block and emit it as a visual so the user
    // still sees a rendered result rather than raw code text.
    const fenceMatch = fullResponse.match(/```(html?|svg|javascript|js|threejs)\s*\n([\s\S]*?)(?:```|$)/i)
    if (fenceMatch) {
      const lang = fenceMatch[1].toLowerCase()
      const code = fenceMatch[2].trim()
      const visualType = (lang === 'svg') ? 'svg'
        : (lang === 'threejs') ? 'threejs'
        : 'html'

      // Emit any preamble text before the fence
      const preamble = fullResponse.slice(0, fullResponse.indexOf('```')).trim()
      if (preamble) {
        emit('block.text_start', { blockId: 'b0' })
        emit('block.text_chunk', { text: preamble })
        emit('block.text_end', {})
      }

      // Emit the code block as a visual
      blockCounter++
      emit('block.visual_start', { blockId: `b${blockCounter}`, visualType })
      emit('block.visual', { blockId: `b${blockCounter}`, visualType, content: code })
      emit('stream.completed', { artifactId })
    } else {
      // No recoverable code block found — degrade to conversational text
      const clean = fullResponse
        .replace(/<think[\s\S]*?<\/think>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      emit('conversational.reply', { text: clean || '…', done: false })
      emit('conversational.reply', { text: '', done: true })
    }
  } else {
    emit('stream.completed', { artifactId })
  }

  stateStore.updateArtifactStatus(artifactId, 'ready')
  stateStore.updateTurnStatus(turnId, 'completed', artifactId)
}

// ─── Budget defaults ──────────────────────────────────────────────────────

const DEFAULT_PLAN_BUDGET = {
  maxTotalOutputTokens: 20000,
  maxPhaseCount: 5,
  maxReplanCount: 2,
  maxHilCount: 2,
}

const DEFAULT_PHASE_BUDGET = {
  maxOutputTokens: 6000,
  maxAttempts: 2,
  timeoutMs: 90000,
}

// ─── Requestability check (v4.1) ─────────────────────────────────────────

/**
 * 判断用户输入是否应该触发 artifact 生成。
 * 返回 true → 纯对话回复；false → 进入正常 artifact 生成流程。
 *
 * 判断顺序（v4.1 §0）：
 *  1. 极短输入（< 5 个有效字符）
 *  2. 纯打招呼 / 情绪 / 简短确认 / 闲聊
 *  3. 元对话（"你是谁"）
 *  4. 有具体主题名词 → 不是纯对话，进入正常流程
 */
function isConversationalInput(input: string): boolean {
  const t = input.trim()

  // 1. 极短
  if (t.replace(/[\s\W]/g, '').length < 5) return true

  // 2. 纯打招呼
  if (/^(hi|hello|你好|在吗|早上好|晚上好|早|嗨|hey|哈哈+|呵呵+|haha|hehe)[\s!！。~～]*$/i.test(t)) return true

  // 3. 情绪表达（独立出现，无具体求助）
  if (/^(累了|头疼|头痛|心情不好|烦死了|好累|压力好大|好烦|难受)[\s!！。]*$/.test(t)) return true

  // 4. 简短确认 / 反馈
  if (/^(嗯+|好的|收到|明白了?|谢谢|知道了?|ok|好|对|是的|没错|厉害|太棒了|哦|噢|啊|哇)[\s!！。]*$/i.test(t)) return true

  // 5. 元对话
  if (/^(你是谁|你能做什么|你会什么|你有什么功能|介绍一下你自己|你叫什么)[\s?？!！]*$/.test(t)) return true

  // 6. 单符号 / 无意义
  if (/^[?？!！.。…,，、]+$/.test(t)) return true

  // 7. 极短且无主题名词（"帮我"、"然后呢"、"这个"……）
  if (t.length <= 8 && !/[\u4e00-\u9fa5a-zA-Z]{2,}/.test(t.replace(/\s/g, ''))) return true

  return false
}

// ─── Recipe matching ──────────────────────────────────────────────────────

// ─── Intent type detection ────────────────────────────────────────────────

type IntentType = 'topic' | 'pain' | 'self' | 'exploration' | 'mixed'

function detectIntentType(input: string): IntentType {
  const lower = input.toLowerCase()

  // Self signals: user describing their own state/trait
  const hasSelf = /我的思维|我希望改变|我太|我不够|帮我培养|我想改变|我总是|我的习惯|我缺乏|我不擅长|我比较/.test(lower)

  // Pain signals: user has a frustration/problem
  const hasPain = /我遇到|我没法|怎么办|总是会|困扰|解决不了|做不好|想不到|发现不了|说不清|想不出/.test(lower)

  // Topic signals: user wants to learn something
  const hasTopic = /什么是|怎么工作|原理|介绍|如何实现|怎么做|学习|了解|教我|帮我了解/.test(lower)

  // Exploration signals: open-ended chat
  const hasExploration = /聊聊|随便|你怎么看|觉得|感觉|有什么看法|分享/.test(lower)

  const signals = [hasSelf, hasPain, hasTopic, hasExploration].filter(Boolean).length

  if (signals >= 2) return 'mixed'
  if (hasSelf) return 'self'
  if (hasPain) return 'pain'
  if (hasExploration) return 'exploration'
  return 'topic'
}

const RECIPES: Record<string, { keywords: string[], widgetPalette: string[] }> = {
  consulting: {
    keywords: ['我的', '我想改变', '我希望', '我太', '帮我', '我遇到', '我没法', '怎么办', '困扰', '学习', '培养'],
    widgetPalette: ['html', 'svg', 'markdown'],
  },
  explainer: {
    keywords: ['解释', '是什么', '怎么工作', '原理', '机制', 'explain', 'what is', 'how does'],
    widgetPalette: ['svg', 'markdown'],
  },
  dashboard: {
    keywords: ['数据', '统计', '对比', '趋势', '分析', 'data', 'chart', 'dashboard'],
    widgetPalette: ['chart', 'html', 'markdown'],
  },
  tutorial: {
    keywords: ['怎么做', '如何', '步骤', '教程', '入门', 'how to', 'tutorial', 'guide'],
    widgetPalette: ['markdown', 'html'],
  },
  exploration: {
    keywords: ['演示', '试试', '交互', '玩', '模拟', 'demo', 'interactive', 'play'],
    widgetPalette: ['html', 'markdown'],
  },
}

function detectRecipe(input: string): { recipeId: string; widgetTypes: string[] } {
  const lower = input.toLowerCase()
  const intentType = detectIntentType(input)

  // Self/Pain/Mixed → always consulting
  if (intentType === 'self' || intentType === 'pain' || intentType === 'mixed') {
    return { recipeId: 'consulting', widgetTypes: ['html', 'svg', 'markdown'] }
  }

  let best = { recipeId: 'explainer', score: 0, widgetTypes: ['markdown', 'svg'] }
  for (const [id, recipe] of Object.entries(RECIPES)) {
    if (id === 'consulting') continue // Only via intent detection
    const score = recipe.keywords.filter(k => lower.includes(k)).length
    if (score > best.score) {
      best = { recipeId: id, score, widgetTypes: recipe.widgetPalette }
    }
  }
  return { recipeId: best.recipeId, widgetTypes: best.widgetTypes }
}

function needsVisual(widgetTypes: string[]): boolean {
  return widgetTypes.some(t => ['svg', 'html', 'chart'].includes(t))
}

// ─── Parse plan from LLM output ──────────────────────────────────────────

function parsePlanFromMarkup(markup: string): { phases: Array<{ id: string; goal: string; acceptance: Criterion[] }> } {
  const phases: Array<{ id: string; goal: string; acceptance: Criterion[] }> = []
  const phaseRegex = /<phase\s+id="([^"]+)"\s+goal="([^"]+)"[^>]*>([\s\S]*?)<\/phase>/g
  let m: RegExpExecArray | null

  while ((m = phaseRegex.exec(markup)) !== null) {
    const id = m[1]
    const goal = m[2]
    const body = m[3]
    const criteria: Criterion[] = []

    const criterionRegex = /<criterion\s+type="([^"]+)"([^/]*)\/?>/g
    let cm: RegExpExecArray | null
    while ((cm = criterionRegex.exec(body)) !== null) {
      const type = cm[1] as Criterion['type']
      const attrStr = cm[2]
      const params: Record<string, string | number> = {}
      const attrRe = /(\w+)="([^"]*)"/g
      let am: RegExpExecArray | null
      while ((am = attrRe.exec(attrStr)) !== null) {
        const v = am[2]
        params[am[1]] = isNaN(Number(v)) ? v : Number(v)
      }
      criteria.push({ type, params })
    }

    phases.push({ id, goal, acceptance: criteria })
  }

  return { phases }
}

// ─── Detect dimensions ───────────────────────────────────────────────────

function detectDimensions(input: string): Dimensions {
  const lower = input.toLowerCase()

  // Expert/co-creator 信号（规则 5）
  const expertSignals = /帮我(打磨|审视|优化|改进)|还有哪些问题|对这个设计|有什么看法|review|trade.?off|什么缺陷|潜在问题/
  const noviceSignals = /什么是|是什么|请介绍|我想了解|入门|初学|怎么理解|explain|what is|beginner/
  const audience: Dimensions['audience'] = expertSignals.test(lower) ? 'expert'
    : noviceSignals.test(lower) ? 'novice'
    : 'practitioner'

  return {
    modality: lower.match(/图|图形|流程|架构|可视|chart|graph|demo|演示/) ? 'visual-heavy' : 'text-heavy',
    depth: lower.length < 20 ? 'skim' : lower.length > 100 ? 'deep-dive' : 'standard',
    interactivity: lower.match(/交互|点击|动态|演示|interactive|demo/) ? 'explorable' : 'static',
    audience,
    certainty: lower.length < 8 || (lower.match(/\?/g) || []).length > 2 ? 'ambiguous' : 'clear',
  }
}

// ─── Extract phase content from streaming buffer ─────────────────────────

function extractWidgetSnapshots(
  widgetBuffers: Map<string, { type: string; title?: string; content: string }>
): WidgetSnapshot[] {
  return Array.from(widgetBuffers.entries()).map(([id, w]) => ({
    id,
    type: w.type,
    title: w.title,
    preview: w.content.slice(0, 200),
    charCount: w.content.length,
  }))
}

// ─── Main Orchestrator ────────────────────────────────────────────────────

export interface OrchestratorOptions {
  conversationId: string
  turnId: string
  artifactId: string
  userInput: string
  previousArtifactId?: string
  signal?: AbortSignal
  onEvent: (event: DisplayEvent) => void
}

export async function runOrchestrator(opts: OrchestratorOptions) {
  const { conversationId, turnId, artifactId, userInput, signal, onEvent } = opts

  const emit = (type: DisplayEvent['type'], payload: Record<string, unknown> = {}) => {
    onEvent({ type, payload })
  }

  emit('status', { message: '正在分析请求...' })

  // ─── 0. Requestability check (v4.1) ──────────────────────────────────────
  // 对话类输入（打招呼/情绪/闲聊/元对话）→ 直接走纯对话回复，跳过 artifact 流程

  const isConvo = isConversationalInput(userInput)

  if (isConvo) {
    const convoSystemPrompt =
      '你是一个友好的 AI 助手。用户发来的是对话性消息（打招呼、情绪表达、闲聊等），' +
      '**不要**生成 <plan>、<phase>、<widget> 等标签，直接用自然语言回复。' +
      '保持简洁，语气匹配用户，如果用户有隐含需求可以轻轻引导，但不要主动推销功能。'

    const history = stateStore.getRecentHistory(conversationId, 4)
    const messages: Message[] = [
      { role: 'system', content: convoSystemPrompt },
      ...history,
      { role: 'user', content: userInput },
    ]

    let replyText = ''
    try {
      await streamCall({
        messages,
        maxTokens: 300,
        temperature: 0.8,
        signal,
        onChunk: (text) => {
          replyText += text
          // 实时流式发送对话回复
          emit('conversational.reply', { text, done: false })
        },
      })
    } catch {
      emit('conversational.reply', { text: '抱歉，我暂时没法回复。', done: false })
    }

    emit('conversational.reply', { text: '', done: true, full: replyText })
    stateStore.updateTurnStatus(turnId, 'completed', artifactId)
    return
  }

  // ─── 1. Intent Detection ───────────────────────────────────────────────

  const dimensions = detectDimensions(userInput)
  const { recipeId, widgetTypes } = detectRecipe(userInput)
  const needsTheme = needsVisual(widgetTypes)

  // ─── Intent + Audience hints ─────────────────────────────────────────────

  const intentType = detectIntentType(userInput)

  // ─── v5 Principle-based context hints ───────────────────────────────────
  // 不做分类标签，只给基于原则的上下文提示

  const lower = userInput.toLowerCase()

  const intentHint = (() => {
    // Co-creator / review 信号 → 给尖锐的问题和 trade-off，不是教学
    if (/帮我打磨|帮我审视|帮我优化|有什么问题|有哪些问题|打磨它|review/.test(lower)) {
      return '\n\n[Context - v5 原则1] 用户在寻求 co-creator 视角。给尖锐的问题和 trade-off 分析，不是教学内容。预设用户已深入理解这个系统/方案。'
    }

    // 纯构建型请求（做一个能用的东西）→ 功能完整优先，不加原理介绍
    if (/^帮我(做|写|建|搭|实现)|^做一个|^给我(做|写)|^帮我写/.test(lower) &&
        !/我的思维|我希望|我太|我不够|帮我培养|我想改变|我遇到|我没法/.test(lower)) {
      return '\n\n[Context - v5 原则1+3] 用户要能用的工具/产品。功能完整优先。不要加原理介绍、方法论讲解、流程图说明——直接做出来。'
    }

    // 用户提到了自身状态/困扰 → 回应真正想改变的，不是领域知识
    if (/我的思维|我希望改变|我太|我不够|帮我培养|我想改变|我缺乏|我不擅长/.test(lower) ||
        /我遇到|我没法|总是被/.test(lower)) {
      return '\n\n[Context - v5 原则1] 用户提到了自身状态或困扰。回应他真正想改变/解决的，不是领域知识本身。精确引用用户的原话（"你说\'X\'，这个X可能具体指..."）。'
    }

    // 理解型请求（搭建直觉、帮我理解）→ 先体验再命名，先隐喻再术语
    if (/搭建直觉|帮我理解|建立直觉|快速理解/.test(lower)) {
      return '\n\n[Context - v5 原则3] 用户想"理解"而不是"使用"。先隐喻后术语，先体验后命名，先最小可理解版本再展开。术语在用户体验到概念之后才出现。'
    }

    return ''
  })()

  // Audience hint (v5: 只在有意义时注入)
  const audienceHint = (() => {
    if (dimensions.audience === 'expert') {
      return '\n\n[Context] 用户信号表明他有领域基础。跳过入门定义，给有深度的内容和洞察。'
    }
    if (dimensions.audience === 'novice') {
      return '\n\n[Context] 先让用户体验概念再给命名，多用日常隐喻，避免过早引入术语。'
    }
    return ''
  })()

  // Self-referential detection
  const isSelfReferential = /流式.?artifact|widget.*(渲染|类型)|xml.?协议|本系统|artifact.?系统|skill.?pack/i.test(userInput)
  const selfRefHint = isSelfReferential
    ? '\n\n[Self-referential] 用户在讨论本系统。必须：1) html demo（可运行）；2) svg 架构图；3) markdown ≤ 40%。'
    : ''

  const systemPrompt = buildSystemPrompt({ recipeId, widgetTypes, needsTheme })
    + intentHint + audienceHint + selfRefHint

  // Get conversation history
  const history = stateStore.getRecentHistory(conversationId, 4)

  // ─── 2. Plan + Phase Generation ───────────────────────────────────────

  // We'll run a combined call: plan + all phases
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(0, -1), // previous turns (excluding the last user message)
    { role: 'user', content: userInput },
  ]

  // Plan storage
  let planParsed = false
  let planData: Plan | null = null
  const phaseQueue: Array<{ id: string; goal: string; acceptance: Criterion[] }> = []
  const completedPhases: PhaseOutcome[] = []
  const phaseAttempts = new Map<string, number>()
  let currentPhaseWidgets = new Map<string, { type: string; title?: string; content: string }>()
  let currentPhaseId: string | null = null
  let hasProtocolError = false
  let totalTokensUsed = 0

  const parser = new StreamParser()

  // ─── Parser event handlers ─────────────────────────────────────────────

  parser.on(async (event) => {
    switch (event.type) {
      case 'plan_started': {
        // Will collect phases from plan markup
        break
      }

      case 'plan_finished': {
        // Plan markup collected; emit plan.created with phases
        if (!planParsed && planData) {
          emit('plan.created', {
            plan: {
              id: planData.id,
              phases: planData.phases.map(p => ({ id: p.id, goal: p.goal })),
              recipeId,
            }
          })
          planParsed = true
        }
        break
      }

      case 'phase_started': {
        const id = event.payload.id as string
        currentPhaseId = id
        currentPhaseWidgets = new Map()
        emit('phase.started', { id, goal: event.payload.goal || planData?.phases.find(p => p.id === id)?.goal || '' })
        break
      }

      case 'widget_opened': {
        const props = event.payload as { id: string; type: string; title?: string }
        currentPhaseWidgets.set(props.id, { type: props.type, title: props.title, content: '' })
        emit('widget.opened', { id: props.id, type: props.type, title: props.title })
        break
      }

      case 'widget_chunk': {
        const { id, text } = event.payload as { id: string; text: string }
        const w = currentPhaseWidgets.get(id)
        if (w) w.content += text
        totalTokensUsed += Math.ceil((text as string).length / 4)
        emit('widget.chunk', { id, text })
        break
      }

      case 'widget_closed': {
        const { id, partial } = event.payload as { id: string; partial: boolean }
        if (partial) hasProtocolError = true
        const w = currentPhaseWidgets.get(id)
        if (w) {
          stateStore.addWidget(artifactId, {
            id,
            type: w.type as any,
            title: w.title,
            content: w.content,
            status: partial ? 'partial' : 'complete',
            metadata: {},
          })
        }
        emit('widget.closed', { id, partial })
        break
      }

      case 'think_started':
        emit('status', { message: '思考中...' })
        break

      case 'think_chunk':
        emit('think.chunk', { text: event.payload.text })
        break

      case 'think_finished':
        emit('think.finished', {})
        break

      case 'milestone': {
        const phaseId = event.payload.phaseId as string || currentPhaseId
        emit('milestone', { phaseId })
        break
      }

      case 'phase_finished': {
        const phaseId = event.payload.id as string || currentPhaseId
        if (!phaseId) break

        emit('phase.transition', { phaseId, message: '正在检查...' })
        emit('critic.thinking', { phaseId })

        // Run Critic
        const widgets = extractWidgetSnapshots(currentPhaseWidgets)
        const phase = planData?.phases.find(p => p.id === phaseId)

        if (phase) {
          const attempts = phaseAttempts.get(phaseId) || 0
          const isLast = planData?.phases[planData.phases.length - 1]?.id === phaseId
          const criticResult = await runCritic({
            phase,
            widgets,
            hasProtocolErrors: hasProtocolError,
            isLastPhase: isLast,
            audience: dimensions.audience,
            runQuality: isLast && attempts === 0,
          }).catch(() => ({ passed: true, results: [], reason: 'critic skipped' }))

          if (!criticResult.passed && attempts < DEFAULT_PHASE_BUDGET.maxAttempts - 1) {
            // Retry not implemented in streaming mode for V1
            // Just log and continue
            emit('status', { message: `Phase ${phaseId}: ${criticResult.reason}（跳过重试）` })
          }

          const outcome: PhaseOutcome = {
            phaseId,
            goal: phase.goal,
            status: 'done',
            widgetsProduced: widgets,
            keyPoints: [],
            topicsCovered: phase.acceptance.filter(c => c.type === 'covers_topics').map(c => c.params.topics as string),
          }
          completedPhases.push(outcome)
        }

        emit('phase.completed', { id: phaseId })
        currentPhaseId = null
        hasProtocolError = false
        break
      }

      case 'warning':
        // Log warnings but don't surface to user
        if ((event.payload.code as string) === 'unclosed_widget' || (event.payload.code as string) === 'protocol_error') {
          hasProtocolError = true
        }
        break
    }
  })

  // ─── 3. First pass: collect plan ──────────────────────────────────────

  // We'll do a single streaming call and let the parser handle everything
  // The parser events are handled synchronously above
  // But we need to create the Plan structure before the first phase starts

  // Pre-create a plan structure
  const planId = `plan_${Date.now()}`
  planData = {
    id: planId,
    recipeId,
    dimensions,
    phases: [],
    budget: DEFAULT_PLAN_BUDGET,
    state: {
      currentPhaseId: null,
      completedPhaseIds: [],
      abandonedPhaseIds: [],
      replanCount: 0,
    },
  }

  // We'll parse plan phases as they come in a plan block
  // Add a special handler to collect plan phases
  let planMarkupBuffer = ''
  let inPlanBlock = false

  // Stream the full response
  let fullResponse = ''

  try {
    await streamCall({
      messages,
      maxTokens: DEFAULT_PLAN_BUDGET.maxTotalOutputTokens,
      temperature: 0.7,
      signal,
      onChunk: (text) => {
        fullResponse += text

        // Collect plan markup as it comes in
        if (!planParsed) {
          planMarkupBuffer += text

          // Check if we have a complete <plan>...</plan> block
          const planEnd = planMarkupBuffer.indexOf('</plan>')
          if (planEnd !== -1) {
            const planSection = planMarkupBuffer.slice(0, planEnd + 7)
            const parsed = parsePlanFromMarkup(planSection)

            if (parsed.phases.length > 0 && planData) {
              planData.phases = parsed.phases.map(p => ({
                id: p.id,
                goal: p.goal,
                acceptance: p.acceptance,
                expectedWidgetTypes: widgetTypes,
                dependsOn: [],
                budget: DEFAULT_PHASE_BUDGET,
                status: 'pending' as const,
                attempts: 0,
                output: { widgets: [], tokensUsed: 0, durationMs: 0 },
              }))

              emit('plan.created', {
                plan: {
                  id: planData.id,
                  phases: planData.phases.map(p => ({ id: p.id, goal: p.goal })),
                  recipeId,
                }
              })
              planParsed = true
            }
          }
        }

        // Feed to parser
        parser.push(text)
      }
    })
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError' || signal?.aborted) {
      emit('error.surfaced', { message: '生成被中断' })
    } else {
      emit('error.surfaced', { message: `生成失败: ${(err as Error)?.message || '未知错误'}` })
    }
    stateStore.updateArtifactStatus(artifactId, 'ready')
    stateStore.updateTurnStatus(turnId, 'errored', artifactId)
    return
  }

  // End of stream
  parser.end()

  // If no plan was detected, create a minimal one
  if (!planParsed) {
    emit('plan.created', {
      plan: { id: planId, phases: [{ id: 'p1', goal: '内容生成' }], recipeId }
    })
  }

  // ─── 4. Complete ─────────────────────────────────────────────────────

  emit('plan.completed', {
    artifactId,
    widgetCount: stateStore.getWidgets(artifactId).length,
  })

  stateStore.updateArtifactStatus(artifactId, 'ready')
  stateStore.updateTurnStatus(turnId, 'completed', artifactId)
}
