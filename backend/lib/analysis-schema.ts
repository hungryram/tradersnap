import { z } from "zod"

// Structured output of /api/analyze (also used as the model's output format)
export const analysisResponseSchema = z.object({
  chart_readable: z.boolean().optional(),
  setup_status: z.enum(["aligned", "incomplete", "violated"]),
  rule_checks: z.array(z.object({
    rule: z.string(),
    status: z.enum(["pass", "fail", "unclear"]),
    note: z.string().optional()
  })).optional(),
  validity_estimate: z.object({
    percent_range: z.tuple([z.number(), z.number()]),
    confidence: z.enum(["low", "medium", "high"]),
    reason: z.string()
  }).nullable(),
  summary: z.string(),
  bullets: z.array(z.string()),
  levels_to_watch: z.array(z.object({
    label: z.string(),
    type: z.enum(["support", "resistance", "structure", "invalidation", "trendline", "breakout_level", "consolidation"]),
    relative_location: z.string(),
    when_observed: z.string(),
    why_it_matters: z.string(),
    confidence: z.enum(["low", "medium", "high"])
  })),
  rule_violations: z.array(z.string()),
  missing_confirmations: z.array(z.string()),
  behavioral_nudge: z.string(),
  follow_up_questions: z.array(z.string()).optional(),
  drawings: z.array(z.union([
    z.object({
      type: z.literal("trendline"),
      anchors: z.array(z.object({
        x_rel: z.number().min(0).max(1),
        price: z.number()
      })).length(2),
      label: z.string(),
      color: z.enum(["blue", "red", "green", "yellow", "purple"]),
      style: z.enum(["solid", "dashed"]).optional(),
      confidence: z.enum(["low", "medium", "high"]).optional()
    }),
    z.object({
      type: z.literal("zone"),
      x_start_rel: z.number().min(0).max(1),
      x_end_rel: z.number().min(0).max(1),
      price_min: z.number(),
      price_max: z.number(),
      label: z.string(),
      color: z.enum(["blue", "red", "green", "yellow", "purple"]),
      style: z.enum(["solid", "dashed"]).optional(),
      confidence: z.enum(["low", "medium", "high"]).optional()
    })
  ])).optional()
})

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>
