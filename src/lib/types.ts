// ─── Protocol types ───────────────────────────────────────────────────────────

export type WidgetType = 'markdown' | 'svg' | 'html' | 'chart' | string

export interface WidgetProps {
  id: string
  type: WidgetType
  title?: string
  [key: string]: string | undefined
}

export type CriterionType =
  | 'widget_exists'
  | 'widget_count'
  | 'word_count'
  | 'covers_topics'
  | 'has_title'
  | 'semantic'

export interface Criterion {
  type: CriterionType
  params: Record<string, string | number>
  weight?: number
}

// ─── Plan / Phase ─────────────────────────────────────────────────────────────

export type PhaseStatus = 'pending' | 'running' | 'review' | 'done' | 'abandoned' | 'skipped'

export interface PhaseBudget {
  maxOutputTokens: number
  maxAttempts: number
  timeoutMs: number
}

export interface WidgetSnapshot {
  id: string
  type: WidgetType
  title?: string
  preview: string
  charCount: number
}

export interface PhaseOutcome {
  phaseId: string
  goal: string
  status: 'done' | 'abandoned'
  widgetsProduced: WidgetSnapshot[]
  keyPoints: string[]
  topicsCovered: string[]
}

export interface Phase {
  id: string
  goal: string
  acceptance: Criterion[]
  expectedWidgetTypes: string[]
  dependsOn: string[]
  budget: PhaseBudget
  status: PhaseStatus
  attempts: number
  output: {
    widgets: WidgetSnapshot[]
    tokensUsed: number
    durationMs: number
  }
  outcome?: PhaseOutcome
}

export type Modality = 'visual-heavy' | 'text-heavy' | 'interactive' | 'mixed'
export type Depth = 'skim' | 'standard' | 'deep-dive'
export type Interactivity = 'static' | 'explorable' | 'conversational'
export type Audience = 'novice' | 'practitioner' | 'expert'
export type Certainty = 'clear' | 'ambiguous' | 'exploratory'

export interface Dimensions {
  modality: Modality
  depth: Depth
  interactivity: Interactivity
  audience: Audience
  certainty: Certainty
}

export interface PlanBudget {
  maxTotalOutputTokens: number
  maxPhaseCount: number
  maxReplanCount: number
  maxHilCount: number
}

export interface Plan {
  id: string
  recipeId: string | null
  dimensions: Dimensions
  phases: Phase[]
  budget: PlanBudget
  state: {
    currentPhaseId: string | null
    completedPhaseIds: string[]
    abandonedPhaseIds: string[]
    replanCount: number
  }
}

// ─── Artifact / Turn / Session ────────────────────────────────────────────────

export type ArtifactStatus = 'generating' | 'ready' | 'editing' | 'archived'
export type TurnStatus = 'pending' | 'running' | 'completed' | 'interrupted' | 'errored' | 'timeout'
export type TurnRole = 'user' | 'assistant'

export interface StoredWidget {
  id: string
  artifactId: string
  sequence: number
  type: WidgetType
  title?: string
  content: string
  status: 'complete' | 'partial' | 'failed'
  metadata: Record<string, unknown>
}

export interface Artifact {
  id: string
  turnId: string
  status: ArtifactStatus
  planSnapshot?: Plan
  widgets: StoredWidget[]
  createdAt: number
  updatedAt: number
  parentArtifactId?: string
}

export interface Turn {
  id: string
  conversationId: string
  sequence: number
  role: TurnRole
  userInput: string
  status: TurnStatus
  artifactId?: string
  errorInfo?: string
  createdAt: number
  completedAt?: number
}

export interface Conversation {
  id: string
  sessionId: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface SessionPreferences {
  theme: 'dark' | 'light'
  defaultDepth: Depth
  animationEnabled: boolean
  hilTolerance: 'low' | 'normal' | 'high'
}

export interface Session {
  id: string
  userId?: string
  createdAt: number
  updatedAt: number
  preferences: SessionPreferences
}

// ─── Display Stream Events (Server → Client) ──────────────────────────────────

export type DisplayEventType =
  | 'plan.created'
  | 'phase.started'
  | 'phase.completed'
  | 'phase.abandoned'
  | 'widget.opened'
  | 'widget.chunk'
  | 'widget.closed'
  | 'think.started'
  | 'think.chunk'
  | 'think.finished'
  | 'milestone'
  | 'critic.thinking'
  | 'phase.transition'
  | 'hil.requested'
  | 'plan.completed'
  | 'error.surfaced'
  | 'status'
  /** 用于纯对话回复（无 plan/widget 的响应）*/
  | 'conversational.reply'

export interface DisplayEvent {
  type: DisplayEventType
  payload: Record<string, unknown>
}

// ─── Stream Parser Events (Internal) ─────────────────────────────────────────

export type ParserEventType =
  | 'plan_started'
  | 'plan_finished'
  | 'phase_started'
  | 'phase_finished'
  | 'widget_opened'
  | 'widget_chunk'
  | 'widget_closed'
  | 'think_started'
  | 'think_chunk'
  | 'think_finished'
  | 'milestone'
  | 'warning'
  | 'edit_started'
  | 'edit_finished'
  | 'modify_started'
  | 'modify_finished'
  | 'append_after'
  | 'remove'

export interface ParserEvent {
  type: ParserEventType
  payload: Record<string, unknown>
}

// ─── Critic ───────────────────────────────────────────────────────────────────

export interface CriticResult {
  passed: boolean
  reason: string
  checkType: 'structural' | 'semantic' | 'quality'
  failedCriteria?: string[]
}

// ─── Error ────────────────────────────────────────────────────────────────────

export type ErrorCategory = 'protocol' | 'validation' | 'semantic' | 'resource' | 'tool' | 'system' | 'user'

export interface AppError {
  category: ErrorCategory
  code: string
  message: string
  userMessage?: string
  context?: {
    turnId?: string
    artifactId?: string
    phaseId?: string
    widgetId?: string
  }
  retryable: boolean
  retryCount?: number
}

// ─── Recipe ───────────────────────────────────────────────────────────────────

export interface RecipeMeta {
  id: string
  when: {
    dimensions?: Partial<Dimensions>
    keywords?: string[]
  }
  minPhases: number
  maxPhases: number
  maxTotalTokens: number
  skillFilesToLoad: string[]
  widgetPalette: WidgetType[]
}
