/**
 * POST /api/chat
 * Streaming SSE endpoint — runs Orchestrator and sends Display Stream events
 */

import { NextRequest } from 'next/server'
import { stateStore } from '@/lib/state-store'
import { runOrchestrator } from '@/lib/orchestrator'
import type { DisplayEvent } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { message, conversationId: reqConvId, sessionId: reqSessionId } = body as {
    message?: string
    conversationId?: string
    sessionId?: string
  }

  if (!message?.trim()) {
    return new Response('Missing message', { status: 400 })
  }

  // Session + Conversation setup
  const session = stateStore.getOrCreateSession(reqSessionId || 'default')
  let conversation = reqConvId ? stateStore.getConversation(reqConvId) : null
  if (!conversation) {
    conversation = stateStore.createConversation(session.id, message.slice(0, 50))
  }

  // Create turn + artifact
  const turn = stateStore.createTurn(conversation.id, message)
  const artifact = stateStore.createArtifact(turn.id)

  // SSE stream
  const encoder = new TextEncoder()
  const abortController = new AbortController()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: DisplayEvent) => {
        try {
          const data = `data: ${JSON.stringify({ ...event, conversationId: conversation!.id, turnId: turn.id, artifactId: artifact.id })}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch {
          // controller closed
        }
      }

      // Send initial metadata
      send({
        type: 'status',
        payload: {
          conversationId: conversation!.id,
          turnId: turn.id,
          artifactId: artifact.id,
          sessionId: session.id,
          message: '连接成功，正在初始化...',
        }
      })

      try {
        await runOrchestrator({
          conversationId: conversation!.id,
          turnId: turn.id,
          artifactId: artifact.id,
          userInput: message,
          signal: abortController.signal,
          onEvent: send,
        })
      } catch (err: unknown) {
        send({
          type: 'error.surfaced',
          payload: { message: (err as Error)?.message || '生成失败' }
        })
      }

      // Send done sentinel
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
    cancel() {
      abortController.abort()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// GET for conversation history
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  const sessionId = searchParams.get('sessionId') || 'default'

  if (conversationId) {
    const turns = stateStore.listTurns(conversationId)
    const result = turns.map(t => {
      const artifact = t.artifactId ? stateStore.getArtifact(t.artifactId) : null
      return {
        turn: t,
        artifact: artifact ? {
          id: artifact.id,
          status: artifact.status,
          widgets: artifact.widgets,
        } : null
      }
    })
    return Response.json({ turns: result })
  }

  const session = stateStore.getOrCreateSession(sessionId)
  const conversations = stateStore.listConversations(session.id)
  return Response.json({ conversations, sessionId: session.id })
}
