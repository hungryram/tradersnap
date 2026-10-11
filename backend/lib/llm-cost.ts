import type { SupabaseClient } from "@supabase/supabase-js"

// Token counts for one AI request. inputTokens is the uncached part only.
export type LlmUsage = {
  model: string
  inputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  outputTokens: number
}

// List prices in USD per million tokens (Anthropic pricing page, October 2026).
// Cache writes are the 5-minute price; 1-hour writes cost more (see oneHourWrite).
const PRICES: { match: string; input: number; cacheWrite: number; oneHourWrite: number; cacheRead: number; output: number }[] = [
  { match: "opus-5-5", input: 4, cacheWrite: 5, oneHourWrite: 8, cacheRead: 0.2, output: 20 },
  { match: "sonnet-5-5", input: 2, cacheWrite: 2.5, oneHourWrite: 4, cacheRead: 0.1, output: 10 },
  { match: "haiku-5-5", input: 0.1, cacheWrite: 0.125, oneHourWrite: 0.2, cacheRead: 0.01, output: 0.5 },
]

// Estimated cost in USD, or null for a model without a price above.
// Cache writes are priced at the 1-hour rate, the more expensive one, so this never undercounts.
export function estimateCost(usage: LlmUsage): number | null {
  const price = PRICES.find(p => usage.model.includes(p.match))
  if (!price) return null
  return (
    usage.inputTokens * price.input +
    usage.cacheWriteTokens * price.oneHourWrite +
    usage.cacheReadTokens * price.cacheRead +
    usage.outputTokens * price.output
  ) / 1_000_000
}

// Records one request. Never throws: cost tracking must not break the feature.
export async function logLlmUsage(
  supabase: SupabaseClient,
  userId: string | null,
  feature: "chat" | "analysis" | "notes",
  usage: LlmUsage | null | undefined
) {
  if (!usage) return
  const { error } = await supabase.from("llm_usage").insert({
    user_id: userId,
    feature,
    model: usage.model,
    input_tokens: usage.inputTokens,
    cache_write_tokens: usage.cacheWriteTokens,
    cache_read_tokens: usage.cacheReadTokens,
    output_tokens: usage.outputTokens,
    cost_usd: estimateCost(usage)
  })
  if (error && error.code !== "42P01" && error.code !== "PGRST205") console.error("[LLM usage] Log failed:", error.message) // table missing: migration not run yet
}
