/**
 * Critic — 三层检查
 * Structural (代码) + Semantic (模型) + Quality (模型，选择性)
 */

import type { Criterion, CriticResult, WidgetSnapshot, Phase } from './types'
import { callOnce } from './llm-client'

// ─── Structural Check (代码) ───────────────────────────────────────────────

export function structuralCheck(
  criteria: Criterion[],
  widgets: WidgetSnapshot[],
  hasProtocolErrors: boolean,
): CriticResult {
  const failed: string[] = []

  if (hasProtocolErrors) {
    return { passed: false, reason: '协议错误（未闭合标签或非法结构）', checkType: 'structural', failedCriteria: ['protocol_error'] }
  }

  for (const c of criteria) {
    switch (c.type) {
      case 'widget_exists': {
        const targetType = c.params.widget as string
        if (!widgets.some(w => w.type === targetType)) {
          failed.push(`缺少 ${targetType} widget`)
        }
        break
      }
      case 'widget_count': {
        const targetType = c.params.widget as string
        const count = widgets.filter(w => w.type === targetType).length
        const min = (c.params.min as number) || 0
        const max = (c.params.max as number) || Infinity
        if (count < min || count > max) {
          failed.push(`${targetType} widget 数量应在 ${min}-${max} 之间，实际 ${count}`)
        }
        break
      }
      case 'word_count': {
        const totalWords = widgets
          .filter(w => w.type === 'markdown')
          .reduce((sum, w) => sum + w.preview.length, 0)
        const min = (c.params.min as number) || 0
        const max = (c.params.max as number) || Infinity
        if (totalWords < min || totalWords > max) {
          failed.push(`文字量应在 ${min}-${max} 字之间，实际 ~${totalWords}`)
        }
        break
      }
      case 'has_title': {
        if (!widgets.some(w => w.title)) {
          failed.push('至少一个 widget 需要有 title')
        }
        break
      }
    }
  }

  if (failed.length > 0) {
    return { passed: false, reason: failed.join('；'), checkType: 'structural', failedCriteria: failed }
  }
  return { passed: true, reason: '结构检查通过', checkType: 'structural' }
}

// ─── Semantic Check (模型) ─────────────────────────────────────────────────

export async function semanticCheck(
  phase: Pick<Phase, 'id' | 'goal' | 'acceptance'>,
  widgets: WidgetSnapshot[],
): Promise<CriticResult> {
  const semanticCriteria = phase.acceptance.filter(
    c => c.type === 'covers_topics' || c.type === 'semantic'
  )
  if (semanticCriteria.length === 0) {
    return { passed: true, reason: '无语义检查项', checkType: 'semantic' }
  }

  const widgetSummary = widgets.map(w =>
    `[${w.type}] ${w.title || ''}: ${w.preview.slice(0, 150)}`
  ).join('\n')

  const criteriaDesc = semanticCriteria.map(c => {
    if (c.type === 'covers_topics') return `必须覆盖主题: ${c.params.topics}`
    if (c.type === 'semantic') return `语义要求: ${c.params.desc}`
    return ''
  }).join('\n')

  const prompt = `你是质量检查员。只回答 YES 或 NO，加不超过 20 字的原因。不要提改进方案。

Phase 目标: ${phase.goal}
Phase 产出摘要:
${widgetSummary}

验收要求:
${criteriaDesc}

这个 phase 是否达成验收要求？`

  try {
    const answer = await callOnce([
      { role: 'system', content: '你是严格的质量检查员。只回答 YES 或 NO + 简短原因（≤20字）。' },
      { role: 'user', content: prompt },
    ], 80)

    const passed = answer.trim().toUpperCase().startsWith('YES')
    const reason = answer.replace(/^(YES|NO)[:\s]*/i, '').trim() || (passed ? '语义检查通过' : '语义检查未通过')
    return { passed, reason, checkType: 'semantic' }
  } catch {
    // Critic 失败时降级通过，不阻塞主流程
    return { passed: true, reason: '语义检查跳过（调用失败）', checkType: 'semantic' }
  }
}

// ─── Quality Check (模型，选择性) ──────────────────────────────────────────

export async function qualityCheck(
  goal: string,
  widgets: WidgetSnapshot[],
  audience: string,
): Promise<CriticResult> {
  const widgetSummary = widgets.map(w =>
    `[${w.type}] ${w.preview.slice(0, 200)}`
  ).join('\n')

  const prompt = `你是内容质量审阅员。只回答 YES 或 NO，加不超过 20 字的原因。

目标受众: ${audience}
Phase 目标: ${goal}
产出摘要:
${widgetSummary}

内容是否：1.与目标受众匹配 2.与 phase 目标相关 3.没有明显事实错误？`

  try {
    const answer = await callOnce([
      { role: 'system', content: '你是内容质量审阅员。只回答 YES 或 NO + 简短原因（≤20字）。' },
      { role: 'user', content: prompt },
    ], 80)

    const passed = answer.trim().toUpperCase().startsWith('YES')
    const reason = answer.replace(/^(YES|NO)[:\s]*/i, '').trim() || (passed ? '质量检查通过' : '质量检查未通过')
    return { passed, reason, checkType: 'quality' }
  } catch {
    return { passed: true, reason: '质量检查跳过（调用失败）', checkType: 'quality' }
  }
}

// ─── Combined check ───────────────────────────────────────────────────────

export async function runCritic(opts: {
  phase: Phase
  widgets: WidgetSnapshot[]
  hasProtocolErrors?: boolean
  isLastPhase?: boolean
  audience?: string
  runQuality?: boolean
}): Promise<{ passed: boolean; results: CriticResult[]; reason: string }> {
  const { phase, widgets, hasProtocolErrors = false, isLastPhase = false, audience = 'practitioner', runQuality = false } = opts
  const results: CriticResult[] = []

  // Step 1: Structural
  const structural = structuralCheck(phase.acceptance, widgets, hasProtocolErrors)
  results.push(structural)
  if (!structural.passed) {
    return { passed: false, results, reason: structural.reason }
  }

  // Step 2: Semantic
  const semantic = await semanticCheck(phase, widgets)
  results.push(semantic)
  if (!semantic.passed) {
    return { passed: false, results, reason: semantic.reason }
  }

  // Step 3: Quality (selective)
  if (runQuality && (isLastPhase || runQuality)) {
    const quality = await qualityCheck(phase.goal, widgets, audience)
    results.push(quality)
    if (!quality.passed) {
      return { passed: false, results, reason: quality.reason }
    }
  }

  return { passed: true, results, reason: '全部检查通过' }
}
