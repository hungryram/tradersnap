import type { SupabaseClient } from "@supabase/supabase-js"

export type UsageLimits = {
  maxMessages: number
  maxScreenshots: number
  maxFavoritesInContext: number
}

export function getLimits(plan?: string | null): UsageLimits {
  if (plan === "admin") return { maxMessages: 999999, maxScreenshots: 999999, maxFavoritesInContext: 100 }
  if (plan === "pro") return { maxMessages: 200, maxScreenshots: 50, maxFavoritesInContext: 20 }
  return { maxMessages: 15, maxScreenshots: 5, maxFavoritesInContext: 3 }
}

export type UsageCost = { messages: number; screenshots: number }

export type ConsumeResult = {
  allowed: boolean
  messages: number
  screenshots: number
}

// Atomically resets the daily window (UTC) if needed, then checks and increments
// usage in a single statement. Requires the consume_usage SQL function.
export async function consumeUsage(
  supabase: SupabaseClient,
  userId: string,
  cost: UsageCost,
  limits: UsageLimits
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc("consume_usage", {
    p_user_id: userId,
    p_messages: cost.messages,
    p_screenshots: cost.screenshots,
    p_max_messages: limits.maxMessages,
    p_max_screenshots: limits.maxScreenshots
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: !!row?.out_allowed,
    messages: row?.out_message_count ?? 0,
    screenshots: row?.out_screenshot_count ?? 0
  }
}

export type WelcomeCredit = "welcome_analysis_used" | "welcome_chart_chat_used"

// The getting-started checklist's first analysis and first "send with chart"
// question are free. Called after a successful response: flips the profile flag
// only if it was still false, so exactly one request per account wins. Returns
// false (no credit) until 20261012_welcome_credits.sql has run.
export async function claimWelcomeCredit(supabase: SupabaseClient, userId: string, credit: WelcomeCredit): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ [credit]: true })
    .eq("id", userId)
    .eq(credit, false)
    .select("id")
  if (error) return false
  return (data?.length ?? 0) > 0
}

// Gives back usage reserved by consumeUsage when the request fails afterwards.
export async function refundUsage(supabase: SupabaseClient, userId: string, cost: UsageCost) {
  if (cost.messages === 0 && cost.screenshots === 0) return
  const { error } = await supabase.rpc("refund_usage", {
    p_user_id: userId,
    p_messages: cost.messages,
    p_screenshots: cost.screenshots
  })
  if (error) console.error("[Usage] Refund failed:", error)
}
