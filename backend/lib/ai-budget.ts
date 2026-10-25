import type { SupabaseClient } from "@supabase/supabase-js"
import { isPaid } from "./plans"

// Spending guards on top of the daily allowance. The allowance counts messages and chart checks, not what each one
// costs, and anyone can start a free trial, so two limits keep the AI bill bounded:
// - per account: what one account's AI use may cost in a day (UTC), lower for Free and trial accounts
// - across Free and trial accounts together: a daily budget; past it they wait until tomorrow. Paying customers are
//   never stopped by it.
// Costs come from llm_usage (logged after every AI call). All amounts are in USD and can be set on Vercel.
const num = (value: string | undefined, fallback: number) => (value && Number.isFinite(Number(value)) ? Number(value) : fallback)
const PER_ACCOUNT_FREE = num(process.env.AI_DAILY_LIMIT_FREE_USD, 3)
const PER_ACCOUNT_PAID = num(process.env.AI_DAILY_LIMIT_PAID_USD, 15)
const FREE_POOL = num(process.env.AI_DAILY_BUDGET_FREE_USD, 75)

const startOfDayUtc = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

const sum = (rows: { cost_usd: number | null }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)

// What Free and trial accounts have cost today, checked at most once a minute per server instance
let freePool: { at: number; day: string; usd: number } | null = null
async function freeSpendToday(supabase: SupabaseClient) {
  const day = startOfDayUtc()
  if (freePool && freePool.day === day && Date.now() - freePool.at < 60_000) return freePool.usd
  const { data: paying } = await supabase.from("profiles").select("id").not("plan", "is", null).neq("plan", "free")
  const payingIds = new Set((paying ?? []).map(p => p.id))
  const { data } = await supabase.from("llm_usage").select("user_id, cost_usd").gte("created_at", day).limit(100_000)
  const usd = sum((data ?? []).filter(r => !payingIds.has(r.user_id)))
  freePool = { at: Date.now(), day, usd }
  return usd
}

// A reason to stop this request, or null to go ahead. Never blocks if the check itself fails.
export async function aiBudgetBlock(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data: profile } = await supabase.from("profiles").select("plan").eq("id", userId).single()
    const paying = isPaid(profile?.plan)
    const { data: mine } = await supabase.from("llm_usage").select("cost_usd").eq("user_id", userId).gte("created_at", startOfDayUtc()).limit(5000)
    if (sum(mine) >= (paying ? PER_ACCOUNT_PAID : PER_ACCOUNT_FREE)) {
      console.warn(`[AI budget] Account ${userId} reached its daily AI limit`)
      return "You've hit today's limit for Pip. It resets at midnight UTC."
    }
    if (!paying && (await freeSpendToday(supabase)) >= FREE_POOL) {
      console.warn("[AI budget] Free and trial accounts reached today's budget")
      return "Pip is very busy right now, so Free and trial accounts are paused until midnight UTC. Pro keeps working."
    }
    return null
  } catch (error) {
    console.error("[AI budget] Check failed:", error)
    return null
  }
}
