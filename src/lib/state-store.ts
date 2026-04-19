/**
 * State Store — V1 内存存储
 * 支持 Session / Conversation / Turn / Artifact / Widget
 */

import type {
  Session, Conversation, Turn, Artifact, StoredWidget,
  SessionPreferences, TurnStatus, ArtifactStatus,
} from './types'

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

const DEFAULT_PREFS: SessionPreferences = {
  theme: 'dark',
  defaultDepth: 'standard',
  animationEnabled: true,
  hilTolerance: 'normal',
}

class StateStore {
  private sessions = new Map<string, Session>()
  private conversations = new Map<string, Conversation>()
  private turns = new Map<string, Turn>()
  private artifacts = new Map<string, Artifact>()
  private widgets = new Map<string, StoredWidget>()

  // ─── Session ──────────────────────────────────────────────────────────────

  getOrCreateSession(id?: string): Session {
    const sessionId = id || 'default_session'
    if (!this.sessions.has(sessionId)) {
      const session: Session = {
        id: sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preferences: { ...DEFAULT_PREFS },
      }
      this.sessions.set(sessionId, session)
    }
    return this.sessions.get(sessionId)!
  }

  updatePreferences(sessionId: string, prefs: Partial<SessionPreferences>) {
    const s = this.sessions.get(sessionId)
    if (s) {
      s.preferences = { ...s.preferences, ...prefs }
      s.updatedAt = Date.now()
    }
  }

  // ─── Conversation ─────────────────────────────────────────────────────────

  createConversation(sessionId: string, title = '新对话'): Conversation {
    const conv: Conversation = {
      id: genId('conv'),
      sessionId,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.conversations.set(conv.id, conv)
    return conv
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id)
  }

  listConversations(sessionId: string): Conversation[] {
    return Array.from(this.conversations.values())
      .filter(c => c.sessionId === sessionId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  // ─── Turn ─────────────────────────────────────────────────────────────────

  createTurn(conversationId: string, userInput: string): Turn {
    const existing = this.listTurns(conversationId)
    const turn: Turn = {
      id: genId('turn'),
      conversationId,
      sequence: existing.length + 1,
      role: 'user',
      userInput,
      status: 'running',
      createdAt: Date.now(),
    }
    this.turns.set(turn.id, turn)
    // update conversation timestamp
    const conv = this.conversations.get(conversationId)
    if (conv) conv.updatedAt = Date.now()
    return turn
  }

  updateTurnStatus(id: string, status: TurnStatus, artifactId?: string, error?: string) {
    const t = this.turns.get(id)
    if (t) {
      t.status = status
      if (artifactId) t.artifactId = artifactId
      if (error) t.errorInfo = error
      if (status !== 'running') t.completedAt = Date.now()
    }
  }

  setAssistantReply(turnId: string, reply: string) {
    const t = this.turns.get(turnId)
    if (t) (t as Turn & { assistantReply?: string }).assistantReply = reply
  }

  getRecentHistory(conversationId: string, maxTurns = 6): Array<{ role: 'user' | 'assistant', content: string }> {
    const turns = this.listTurns(conversationId).slice(-maxTurns)
    const messages: Array<{ role: 'user' | 'assistant', content: string }> = []
    for (const turn of turns) {
      messages.push({ role: 'user', content: turn.userInput })
      if (turn.artifactId) {
        const artifact = this.artifacts.get(turn.artifactId)
        if (artifact && artifact.status === 'ready') {
          const t = turn as Turn & { assistantReply?: string }
          if (artifact.widgets.length > 0) {
            const widgetSummary = artifact.widgets.map(w => `[${w.type}] ${w.title || ''}`.trim()).join(', ')
            messages.push({ role: 'assistant', content: `[已产出 artifact: ${widgetSummary}]` })
          } else if (t.assistantReply) {
            const preview = t.assistantReply.length > 300
              ? t.assistantReply.slice(0, 300) + '…'
              : t.assistantReply
            messages.push({ role: 'assistant', content: preview })
          }
        }
      }
    }
    return messages
  }

  listTurns(conversationId: string): Turn[] {
    return Array.from(this.turns.values())
      .filter(t => t.conversationId === conversationId)
      .sort((a, b) => a.sequence - b.sequence)
  }

  getTurn(id: string): Turn | undefined {
    return this.turns.get(id)
  }

  // ─── Artifact ─────────────────────────────────────────────────────────────

  createArtifact(turnId: string, parentArtifactId?: string): Artifact {
    const artifact: Artifact = {
      id: genId('art'),
      turnId,
      status: 'generating',
      widgets: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentArtifactId,
    }
    this.artifacts.set(artifact.id, artifact)
    return artifact
  }

  updateArtifactStatus(id: string, status: ArtifactStatus) {
    const a = this.artifacts.get(id)
    if (a) {
      a.status = status
      a.updatedAt = Date.now()
    }
  }

  getArtifact(id: string): Artifact | undefined {
    return this.artifacts.get(id)
  }

  getLatestArtifactForConversation(conversationId: string): Artifact | undefined {
    const turns = this.listTurns(conversationId)
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].artifactId) {
        return this.artifacts.get(turns[i].artifactId!)
      }
    }
    return undefined
  }

  // ─── Widget ───────────────────────────────────────────────────────────────

  addWidget(artifactId: string, widget: Omit<StoredWidget, 'artifactId' | 'sequence'>): StoredWidget {
    const artifact = this.artifacts.get(artifactId)
    const sequence = artifact ? artifact.widgets.length : 0
    const stored: StoredWidget = { ...widget, artifactId, sequence }
    this.widgets.set(stored.id, stored)
    if (artifact) {
      artifact.widgets.push(stored)
      artifact.updatedAt = Date.now()
    }
    return stored
  }

  updateWidget(id: string, updates: Partial<StoredWidget>) {
    const w = this.widgets.get(id)
    if (w) Object.assign(w, updates)
  }

  getWidgets(artifactId: string): StoredWidget[] {
    return this.artifacts.get(artifactId)?.widgets ?? []
  }

}

// Singleton
export const stateStore = new StateStore()
