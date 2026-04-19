import { z } from 'zod'

export const RouterDecisionSchema = z.object({
  mode: z.enum(['artifact', 'conversational']),
  reason: z.string().optional(),
})
export type RouterDecision = z.infer<typeof RouterDecisionSchema>
