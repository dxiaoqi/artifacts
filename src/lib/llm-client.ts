/**
 * LLM Client — OpenAI-compatible 流式调用
 * 使用 .env.local 里的 ARTIFACTS_LLM_* 变量
 */

import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.ARTIFACTS_LLM_API_KEY,
  baseURL: process.env.ARTIFACTS_LLM_BASE_URL,
})

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

  const stream = await client.chat.completions.create({
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
  const res = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: 0,
    stream: false,
  })
  return res.choices[0]?.message?.content ?? ''
}
