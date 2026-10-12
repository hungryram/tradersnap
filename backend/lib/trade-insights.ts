import type { SupabaseClient } from "@supabase/supabase-js"

// Two things Pip tells traders from their own data:
// - whether each trade was checked first (a chart check shortly before it opened)
// - their discipline streak (trading days in a row with no daily rule broken)

export const CHECK_WINDOW_MS = 20 * 60 * 1000

type TradeTimes = { opened_at: string | null; closed_at: string }

// Adds `checked` to each trade: a chart check within 20 minutes before it opened
export async function markChecked<T extends TradeTimes & { source?: string }>(supabase: SupabaseClient, userId: string, trades: T[]): Promise<(T & { checked?: boolean })[]> {
  if (!trades.length) return []
  const opens = trades.map(t => Date.parse(t.opened_at ?? t.closed_at))
  const { data } = await supabase
    .from("analyses")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", new Date(Math.min(...opens) - CHECK_WINDOW_MS).toISOString())
    .lte("created_at", new Date(Math.max(...opens) + 60_000).toISOString())
    .limit(2000)
  const checks = (data ?? []).map(r => Date.parse(r.created_at))
  // Trades the trader reported in chat have no entry time, so they are neither checked nor unchecked
  return trades.map((t, i) => t.source === "manual" ? t : {
    ...t,
    checked: checks.some(at => at <= opens[i] + 60_000 && at >= opens[i] - CHECK_WINDOW_MS)
  })
}

type Limits = {
  max_trades_per_day?: number | null
  max_daily_loss?: number | null
  stop_after_losses?: number | null
  session_start?: string | null
  session_end?: string | null
} | null

function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date(iso))
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00"
  return { day: `${get("year")}-${get("month")}-${get("day")}`, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) }
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

// Same checks as the journal calendar and Pip's recap, in the trader's timezone
function dayBroken(trades: { opened_at: string | null; closed_at: string; realized_pnl: number | null; kind?: string }[], limits: NonNullable<Limits>, timeZone: string) {
  const all = [...trades].sort((a, b) => a.closed_at.localeCompare(b.closed_at))
  // A day-total entry counts in the day's P&L but is not a trade
  const sorted = all.filter(t => t.kind !== "day_total")
  const pnl = (t: { realized_pnl: number | null }) => Number(t.realized_pnl ?? 0)
  if (limits.max_trades_per_day && sorted.length > limits.max_trades_per_day) return true
  if (limits.stop_after_losses) {
    let streak = 0
    for (const t of sorted) { streak = pnl(t) < 0 ? streak + 1 : 0; if (streak > limits.stop_after_losses) return true }
  }
  if (limits.max_daily_loss && all.reduce((s, t) => s + pnl(t), 0) < -limits.max_daily_loss) return true
  if (limits.session_start && limits.session_end) {
    const start = minutesOf(limits.session_start), end = minutesOf(limits.session_end)
    if (sorted.some(t => { const m = localParts(t.opened_at ?? t.closed_at, timeZone).minutes; return m < start || m >= end })) return true
  }
  return false
}

export type Streak = { days: number; brokenToday: boolean } | null

// Trading days in a row (most recent first) with no daily rule broken. Days without
// trades don't count or break it. Null when the trader has no limits to keep.
export async function disciplineStreak(supabase: SupabaseClient, userId: string, timeZone = "America/New_York"): Promise<Streak> {
  let tz = timeZone
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }) } catch { tz = "America/New_York" }

  const { data: profile } = await supabase.from("profiles").select("trading_limits").eq("id", userId).single()
  const limits = profile?.trading_limits as Limits
  if (!limits || !(limits.max_trades_per_day || limits.stop_after_losses || limits.max_daily_loss || (limits.session_start && limits.session_end))) return null

  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString()
  const load = (cols: string) => supabase.from("trades").select(cols).eq("user_id", userId).gte("closed_at", since).order("closed_at", { ascending: false }).limit(3000)
  let { data, error } = await load("opened_at, closed_at, realized_pnl, kind")
  if (error) ({ data, error } = await load("opened_at, closed_at, realized_pnl")) // before 20261024_day_totals.sql
  type DayRow = { opened_at: string | null; closed_at: string; realized_pnl: number | null; kind?: string }
  const rows = (data ?? []) as unknown as DayRow[]
  const byDay = new Map<string, DayRow[]>()
  for (const t of rows) {
    const day = localParts(t.closed_at, tz).day
    byDay.set(day, [...(byDay.get(day) ?? []), t])
  }
  const days = [...byDay.keys()].sort().reverse()
  const today = localParts(new Date().toISOString(), tz).day

  let count = 0
  for (const day of days) {
    if (dayBroken(byDay.get(day)!, limits, tz)) break
    count++
  }
  return { days: count, brokenToday: days[0] === today && dayBroken(byDay.get(today)!, limits, tz) }
}
