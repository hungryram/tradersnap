import type { SupabaseClient } from "@supabase/supabase-js"
import { features, loadPlan } from "./plans"

// A trader can have several strategies (rulesets) active at once. Pip checks a
// chart against all of them and says which one fits; rules that apply to every
// trade ("always-on") and the daily limits sit above them.

export type Strategy = { id: string; name: string; rules_text: string; is_primary: boolean; is_active: boolean }

// How many strategies can be active at once (pass the effective plan)
export const activeStrategyLimit = (plan?: string | null) => features(plan).activeStrategies

type Limits = {
  max_trades_per_day?: number | null
  max_daily_loss?: number | null
  stop_after_losses?: number | null
  session_start?: string | null
  session_end?: string | null
} | null

// Active strategies, falling back to the primary one (or `fallbackId`) before the
// 20261020_strategies.sql migration has run or if none is marked active.
export async function loadActiveStrategies(supabase: SupabaseClient, userId: string, fallbackId?: string | null): Promise<Strategy[]> {
  const withActive = await supabase
    .from("rulesets")
    .select("id, name, rules_text, is_primary, is_active")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  let rows: Strategy[]
  if (withActive.error) {
    const legacy = await supabase.from("rulesets").select("id, name, rules_text, is_primary").eq("user_id", userId)
    rows = (legacy.data ?? []).map(r => ({ ...r, is_active: !!r.is_primary })) as Strategy[]
  } else {
    rows = (withActive.data ?? []) as Strategy[]
  }
  // More switched on than the plan allows (after a downgrade): use the main one first, then the oldest. Nothing is switched off or deleted.
  const limit = activeStrategyLimit((await loadPlan(supabase, userId)).plan)
  const active = rows.filter(r => r.is_active).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).slice(0, limit)
  if (active.length) return active
  const fallback = rows.find(r => r.id === fallbackId) ?? rows.find(r => r.is_primary) ?? rows[0]
  return fallback ? [fallback] : []
}

export async function loadAlwaysRules(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("always_rules").eq("id", userId).single()
  if (error) return null
  return (data?.always_rules as string | null)?.trim() || null
}

function limitsLines(limits: Limits): string[] {
  if (!limits) return []
  return [
    limits.max_trades_per_day && `Max ${limits.max_trades_per_day} trades per day`,
    limits.stop_after_losses && `Stop for the day after ${limits.stop_after_losses} losses in a row`,
    limits.max_daily_loss && `Stop for the day if down $${limits.max_daily_loss}`,
    limits.session_start && limits.session_end && `Only trade between ${limits.session_start} and ${limits.session_end} (trader's local time)`,
  ].filter(Boolean) as string[]
}

// The rules text Pip sees: always-on rules and limits, then each active strategy by name
export function strategiesBlock(strategies: Strategy[], alwaysRules: string | null, limits: Limits): string {
  const always = [alwaysRules, ...limitsLines(limits).map(l => `- ${l}`)].filter(Boolean).join("\n")
  const parts: string[] = []
  if (always) parts.push(`RULES FOR EVERY TRADE (whatever the setup):\n${always}`)
  if (strategies.length === 1) {
    parts.push(`STRATEGY "${strategies[0].name}":\n${strategies[0].rules_text}`)
  } else if (strategies.length > 1) {
    parts.push(`The trader trades ${strategies.length} different strategies. A setup only needs to fit ONE of them.\n\n` +
      strategies.map(s => `STRATEGY "${s.name}":\n${s.rules_text}`).join("\n\n"))
  }
  return parts.join("\n\n") || "No rules written yet."
}

// The strategy a model named, matched leniently against the trader's strategy names
export function matchStrategy(strategies: Strategy[], name: string | null | undefined): Strategy | null {
  if (!name) return null
  const wanted = name.trim().toLowerCase().replace(/^"|"$/g, "")
  return strategies.find(s => s.name.trim().toLowerCase() === wanted)
    ?? strategies.find(s => wanted.includes(s.name.trim().toLowerCase()) || s.name.trim().toLowerCase().includes(wanted))
    ?? null
}

// The trader picked one strategy in the chat box: use just that one (if it's theirs), otherwise all the active ones
export async function strategiesFor(supabase: SupabaseClient, userId: string, active: Strategy[], strategyId?: string | null): Promise<Strategy[]> {
  if (!strategyId) return active
  const found = active.find(s => s.id === strategyId)
  if (found) return [found]
  const { data } = await supabase.from("rulesets").select("id, name, rules_text, is_primary").eq("id", strategyId).eq("user_id", userId).maybeSingle()
  return data ? [{ ...data, is_active: true } as Strategy] : active
}
