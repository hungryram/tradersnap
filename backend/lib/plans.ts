import type { SupabaseClient } from "@supabase/supabase-js"

// Every plan rule lives here: what each plan gets, the free Pro trial, and which
// Stripe price sells which plan. Pages and routes read from this file.

export type Plan = "free" | "pro" | "pro_plus" | "admin"

export type PlanFeatures = {
  label: string
  dailyCredits: number        // daily allowance in units (lib/usage CREDIT_COSTS)
  favorites: number           // saved messages Pip remembers
  activeStrategies: number    // strategies checked at once
  rulesets: number            // strategies a trader can keep
  rulesChars: number          // characters per strategy
  historyDays: number | null  // journal, calendar and notes history; null = all of it
  pipReadsNotes: boolean      // Pip uses journal notes in coaching and memory
  journalNotesInMemory: number // how many of the latest journal notes Pip reads (0 = none)
  dayReviewsPerDay: number    // "Review this day" in the journal (0 = not on this plan)
  dayReviewsPerWeek: number   // plans without daily reviews get a taste: this many a week (0 = none)
}

export const PLANS: Record<Plan, PlanFeatures> = {
  // 5 chart checks + 15 messages
  free: { label: "Free", dailyCredits: 40, favorites: 3, activeStrategies: 1, rulesets: 3, rulesChars: 1000, historyDays: 7, pipReadsNotes: false, journalNotesInMemory: 0, dayReviewsPerDay: 0, dayReviewsPerWeek: 1 },
  // 30 chart checks + 150 messages
  pro: { label: "Pro", dailyCredits: 300, favorites: 20, activeStrategies: 5, rulesets: 20, rulesChars: 5000, historyDays: null, pipReadsNotes: true, journalNotesInMemory: 10, dayReviewsPerDay: 5, dayReviewsPerWeek: 0 },
  // 100 chart checks + 400 messages
  pro_plus: { label: "Pro+", dailyCredits: 900, favorites: 50, activeStrategies: 50, rulesets: 50, rulesChars: 5000, historyDays: null, pipReadsNotes: true, journalNotesInMemory: 15, dayReviewsPerDay: 15, dayReviewsPerWeek: 0 },
  admin: { label: "Admin", dailyCredits: 1_000_000, favorites: 100, activeStrategies: 50, rulesets: 999, rulesChars: 10000, historyDays: null, pipReadsNotes: true, journalNotesInMemory: 15, dayReviewsPerDay: 50, dayReviewsPerWeek: 0 },
}

// List prices in USD (shown on the site and used for MRR on the admin page)
export const PRICES = {
  pro: { month: 29, year: 249 },
  pro_plus: { month: 99, year: 990 },
} as const

export const TRIAL_DAYS = 7

const asPlan = (value: unknown): Plan =>
  value === "pro" || value === "pro_plus" || value === "admin" ? value : "free"

export const isPaid = (plan: Plan | string | null | undefined) => asPlan(plan) !== "free"
export const features = (plan: Plan | string | null | undefined) => PLANS[asPlan(plan)]

type ProfileLike = { plan?: string | null; trial_ends_at?: string | null } | null | undefined

// A Free account inside its trial gets Pro
export function inTrial(profile: ProfileLike, now = Date.now()) {
  return asPlan(profile?.plan) === "free" && !!profile?.trial_ends_at && Date.parse(profile.trial_ends_at) > now
}

// The plan whose limits apply right now
export function effectivePlan(profile: ProfileLike): Plan {
  return inTrial(profile) ? "pro" : asPlan(profile?.plan)
}

export function trialDaysLeft(profile: ProfileLike) {
  if (!inTrial(profile)) return 0
  return Math.max(1, Math.ceil((Date.parse(profile!.trial_ends_at!) - Date.now()) / 86_400_000))
}

// For routes that only need the plan: reads the whole row so it works before and after migrations
export async function loadPlan(supabase: SupabaseClient, userId: string): Promise<{ plan: Plan; subscribed: Plan; trialEndsAt: string | null }> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single()
  return { plan: effectivePlan(data), subscribed: asPlan(data?.plan), trialEndsAt: inTrial(data) ? data!.trial_ends_at : null }
}

// Stripe prices, configured on the server only
export type Interval = "month" | "year"
const PRICE_ENV: Record<"pro" | "pro_plus", Record<Interval, string | undefined>> = {
  pro: { month: process.env.STRIPE_PRICE_ID_PRO || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO, year: process.env.STRIPE_PRICE_ID_PRO_YEARLY },
  pro_plus: { month: process.env.STRIPE_PRICE_ID_PRO_PLUS, year: process.env.STRIPE_PRICE_ID_PRO_PLUS_YEARLY },
}

export const priceIdFor = (plan: "pro" | "pro_plus", interval: Interval) => PRICE_ENV[plan][interval] || null

// Which plan a Stripe price sells; null for prices we don't sell (never grant a plan by accident)
export function planForPriceId(priceId: string, lookupKey?: string | null): "pro" | "pro_plus" | null {
  for (const plan of ["pro", "pro_plus"] as const) {
    if (Object.values(PRICE_ENV[plan]).filter(Boolean).includes(priceId)) return plan
  }
  if (lookupKey === "pro" || lookupKey === "pro_yearly") return "pro"
  if (lookupKey === "pro_plus" || lookupKey === "pro_plus_yearly") return "pro_plus"
  return null
}
