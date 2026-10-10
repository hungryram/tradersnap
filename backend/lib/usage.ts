import type { SupabaseClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Usage is one daily allowance of units. Users see a percentage ("62% used,
// about 3 chart checks left"); these numbers are estimates to tune as real
// usage comes in. Bought units (top-ups) are used after the daily allowance.
// ---------------------------------------------------------------------------
export const CREDIT_COSTS = {
  message: 1,      // a chat message
  chartMessage: 3, // a chat message that sends a new chart screenshot
  analysis: 5      // "Analyze this chart"
}

export const DAILY_CREDITS = {
  free: 40,   // about 5 chart checks + 15 messages
  pro: 450,   // about 50 chart checks + 200 messages
  admin: 1_000_000
}

// A top-up pack (Stripe price STRIPE_PRICE_ID_TOPUP)
export const TOPUP_UNITS = Number(process.env.TOPUP_UNITS) || 100

export type UsageLimits = {
  maxMessages: number
  maxScreenshots: number
  maxFavoritesInContext: number
  dailyCredits: number
}

export function getLimits(plan?: string | null): UsageLimits {
  if (plan === "admin") return { maxMessages: 999999, maxScreenshots: 999999, maxFavoritesInContext: 100, dailyCredits: DAILY_CREDITS.admin }
  if (plan === "pro") return { maxMessages: 200, maxScreenshots: 50, maxFavoritesInContext: 20, dailyCredits: DAILY_CREDITS.pro }
  return { maxMessages: 15, maxScreenshots: 5, maxFavoritesInContext: 3, dailyCredits: DAILY_CREDITS.free }
}

// units: explicit cost (analysis); otherwise a message, plus extra for a new chart screenshot
export type UsageCost = { messages: number; screenshots: number; units?: number }

export function unitsOf(cost: UsageCost) {
  return cost.units ?? cost.messages * CREDIT_COSTS.message + cost.screenshots * (CREDIT_COSTS.chartMessage - CREDIT_COSTS.message)
}

// What a request took, so a refund can give back exactly that
export type Reservation = { units: number; fromBonus: number; messages: number; screenshots: number; legacy: boolean }

export type CreditState = {
  used: number
  daily: number
  bonus: number
  percent: number      // of today's allowance
  checksLeft: number   // rough translation for people, including bought units
  messagesLeft: number
}

export type ConsumeResult = {
  allowed: boolean
  messages: number
  screenshots: number
  credits: CreditState | null
  reservation: Reservation
}

export function creditState(used: number, bonus: number, limits: UsageLimits): CreditState {
  const left = Math.max(0, limits.dailyCredits - used) + Math.max(0, bonus)
  return {
    used,
    daily: limits.dailyCredits,
    bonus,
    percent: Math.min(100, Math.round((used / limits.dailyCredits) * 100)),
    checksLeft: Math.floor(left / CREDIT_COSTS.analysis),
    messagesLeft: Math.floor(left / CREDIT_COSTS.message)
  }
}

const isMissingFunction = (error: any) =>
  error?.code === "PGRST202" || /could not find the function|does not exist/i.test(error?.message ?? "")

// Atomically resets the daily window (UTC) if needed, then checks and takes the cost
export async function consumeUsage(
  supabase: SupabaseClient,
  userId: string,
  cost: UsageCost,
  limits: UsageLimits
): Promise<ConsumeResult> {
  const units = unitsOf(cost)
  const { data, error } = await supabase.rpc("consume_credits", {
    p_user_id: userId,
    p_units: units,
    p_messages: cost.messages,
    p_screenshots: cost.screenshots,
    p_daily_units: limits.dailyCredits
  })

  // Until 20261016_credits.sql has run, count messages and screenshots as before
  if (error && isMissingFunction(error)) return consumeLegacy(supabase, userId, cost, limits)
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: !!row?.out_allowed,
    messages: row?.out_message_count ?? 0,
    screenshots: row?.out_screenshot_count ?? 0,
    credits: creditState(row?.out_used ?? 0, row?.out_bonus ?? 0, limits),
    reservation: { units, fromBonus: row?.out_from_bonus ?? 0, messages: cost.messages, screenshots: cost.screenshots, legacy: false }
  }
}

async function consumeLegacy(supabase: SupabaseClient, userId: string, cost: UsageCost, limits: UsageLimits): Promise<ConsumeResult> {
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
    screenshots: row?.out_screenshot_count ?? 0,
    credits: null,
    reservation: { units: unitsOf(cost), fromBonus: 0, messages: cost.messages, screenshots: cost.screenshots, legacy: true }
  }
}

// Gives back what consumeUsage took when the request fails or is free
export async function refundUsage(supabase: SupabaseClient, userId: string, reservation: Reservation | null) {
  if (!reservation || reservation.units === 0) return
  const { error } = reservation.legacy
    ? await supabase.rpc("refund_usage", { p_user_id: userId, p_messages: reservation.messages, p_screenshots: reservation.screenshots })
    : await supabase.rpc("refund_credits", {
        p_user_id: userId,
        p_daily_units: reservation.units - reservation.fromBonus,
        p_bonus_units: reservation.fromBonus,
        p_messages: reservation.messages,
        p_screenshots: reservation.screenshots
      })
  if (error) console.error("[Usage] Refund failed:", error)
}

// Usage numbers for responses: the new credit fields plus the old message/screenshot
// fields that extension builds before 1.1 read (expressed so their checks still work)
export function usagePayload(credits: CreditState | null, counts: { messages: number; screenshots: number }, limits: UsageLimits) {
  if (!credits) {
    return { messages: counts.messages, screenshots: counts.screenshots, limits }
  }
  const maxScreenshots = Math.floor((credits.daily + credits.bonus) / CREDIT_COSTS.analysis)
  const maxMessages = Math.floor((credits.daily + credits.bonus) / CREDIT_COSTS.message)
  return {
    messages: maxMessages - credits.messagesLeft,
    screenshots: maxScreenshots - credits.checksLeft,
    limits: { ...limits, maxMessages, maxScreenshots },
    credits
  }
}

// Today's state from a profile row (counters from a previous UTC day count as zero)
export function creditStateFromProfile(profile: any, limits: UsageLimits): CreditState | null {
  if (profile?.credits_used === undefined) return null // 20261016_credits.sql not run yet
  const today = new Date().toISOString().slice(0, 10)
  const used = profile.usage_reset_date === today ? profile.credits_used ?? 0 : 0
  return creditState(used, profile.bonus_credits ?? 0, limits)
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
