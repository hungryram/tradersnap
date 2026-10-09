import { z } from "zod"

const levelSchema = z.object({
  label: z.string(),
  type: z.enum(["support", "resistance", "structure", "invalidation", "trendline", "breakout_level", "consolidation"]),
  relative_location: z.string(),
  when_observed: z.string(),
  why_it_matters: z.string(),
  confidence: z.enum(["low", "medium", "high"])
})

// What the model must return (used as Claude's structured output format).
// Older extension versions read setup_status, rule_checks, summary, bullets,
// levels_to_watch and behavioral_nudge, so those keep their shape.
export const analysisOutputSchema = z.object({
  chart_readable: z.boolean(),
  setup_status: z.enum(["aligned", "incomplete", "violated"]),
  headline: z.string(),
  headline_reason: z.string(),
  summary: z.string(),
  wait_for: z.array(z.string()),
  levels_to_watch: z.array(levelSchema),
  // Only rules the chart itself can show
  rule_checks: z.array(z.object({
    rule: z.string(),
    status: z.enum(["pass", "fail", "unclear"]),
    note: z.string()
  })),
  // Rules the trader has to confirm themselves (trade count, P&L, risk, ...)
  self_check_rules: z.array(z.string()),
  bullets: z.array(z.string()),
  behavioral_nudge: z.string()
})

// What /api/analyze accepts back from a model. Lenient on the newer fields so a
// provider without schema enforcement (OpenAI JSON mode) can't fail the request.
export const analysisResponseSchema = analysisOutputSchema.partial({
  chart_readable: true,
  headline: true,
  headline_reason: true,
  wait_for: true,
  self_check_rules: true
}).extend({
  rule_checks: z.array(z.object({
    rule: z.string(),
    status: z.enum(["pass", "fail", "unclear"]),
    note: z.string().optional()
  })).optional()
})

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>

// Keep the card short no matter what the model returns
export function trimAnalysis(analysis: AnalysisResponse): AnalysisResponse {
  return {
    ...analysis,
    wait_for: analysis.wait_for?.slice(0, 2),
    levels_to_watch: analysis.levels_to_watch.slice(0, 3),
    bullets: analysis.bullets.slice(0, 3)
  }
}
