/**
 * LLM Client — OpenAI-compatible 流式调用
 * 使用 .env.local 里的 ARTIFACTS_LLM_* 变量
 */

import OpenAI from 'openai'

// Lazily created so the module can be imported at build time without
// ARTIFACTS_LLM_API_KEY being present (Vercel build env has no .env.local).
let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.ARTIFACTS_LLM_API_KEY ?? 'missing-key',
      baseURL: process.env.ARTIFACTS_LLM_BASE_URL,
    })
  }
  return _client
}

export const MODEL = process.env.ARTIFACTS_LLM_MODEL || 'gpt-4o-mini'

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamCallOptions {
  messages: Message[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  onChunk?: (text: string) => void
}

/**
 * 流式调用 LLM，返回完整响应文本
 */
export async function streamCall(opts: StreamCallOptions): Promise<string> {
  const { messages, maxTokens = 8000, temperature = 0.7, signal, onChunk } = opts

  const stream = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  })

  let full = ''
  for await (const chunk of stream) {
    if (signal?.aborted) break
    const text = chunk.choices[0]?.delta?.content ?? ''
    if (text) {
      full += text
      onChunk?.(text)
    }
  }
  return full
}

/**
 * 非流式短调用（用于 Critic）
 */
export async function callOnce(messages: Message[], maxTokens = 200): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: 0,
    stream: false,
  })
  return res.choices[0]?.message?.content ?? ''
}

/**
 * 结构化调用 — JSON mode + Zod 验证
 */
export async function callStructured<T extends import('zod').ZodTypeAny>(
  messages: Message[],
  schema: T,
  opts: { system?: string; maxTokens?: number; fallback?: import('zod').infer<T> } = {},
): Promise<import('zod').infer<T>> {
  const { system, maxTokens = 200, fallback } = opts
  const allMessages: Message[] = system
    ? [{ role: 'system', content: system + '\nRespond with a valid JSON object only.' }, ...messages]
    : messages

  let raw = ''
  try {
    raw = await callOnce(allMessages, maxTokens)
  } catch { if (fallback !== undefined) return fallback; throw new Error('callStructured failed') }

  let parsed: unknown
  try { parsed = JSON.parse(raw.trim()) } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    try { parsed = m ? JSON.parse(m[0]) : {} } catch { parsed = {} }
  }

  const result = schema.safeParse(parsed)
  if (result.success) return result.data
  if (fallback !== undefined) return fallback
  throw new Error(`Schema validation failed: ${result.error.message}`)
}
