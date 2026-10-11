import type { SupabaseClient } from "@supabase/supabase-js"

// Habits computed from a trader's recent trades, with no AI involved. Pip gets
// these as memory, and the dashboard's Memory page shows the same lines.

export type PatternTrade = { opened_at: string | null; closed_at: string; realized_pnl: number | null }
export type PatternLimits = { max_trades_per_day?: number | null } | null

const MIN_TRADES = 10
const REENTRY_MINUTES = 5
const DAYS = 30

const pnl = (t: PatternTrade) => Number(t.realized_pnl ?? 0)
const money = (v: number) => `${v < 0 ? "-" : "+"}$${Math.abs(v).toFixed(0)}`
const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`
const winRate = (trades: PatternTrade[]) => trades.filter(t => pnl(t) > 0).length / trades.length

function localParts(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hour12: false })
    .formatToParts(new Date(iso))
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0"
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 }
}

const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`

// Plain-language lines, most useful first. Empty when there isn't enough data to say anything fair.
export function tradePatterns(trades: PatternTrade[], limits: PatternLimits, timezone = "America/New_York"): string[] {
  const sorted = [...trades].sort((a, b) => a.closed_at.localeCompare(b.closed_at))
  if (sorted.length < MIN_TRADES) return []
  let tz = timezone
  try { localParts(sorted[0].closed_at, tz) } catch { tz = "America/New_York" }

  const lines: string[] = []
  const days = new Map<string, PatternTrade[]>()
  for (const t of sorted) {
    const day = localParts(t.opened_at ?? t.closed_at, tz).day
    days.set(day, [...(days.get(day) ?? []), t])
  }
  const overall = winRate(sorted)
  lines.push(`Last ${DAYS} days: ${sorted.length} trades over ${days.size} trading days (about ${(sorted.length / days.size).toFixed(1)} a day), ${pct(overall * sorted.length, sorted.length)} winners, net ${money(sorted.reduce((s, t) => s + pnl(t), 0))}.`)

  // Quick re-entries after a loss
  const reentries: PatternTrade[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], t = sorted[i]
    if (pnl(prev) >= 0 || !t.opened_at) continue
    const gap = (Date.parse(t.opened_at) - Date.parse(prev.closed_at)) / 60000
    if (gap >= 0 && gap <= REENTRY_MINUTES) reentries.push(t)
  }
  if (reentries.length >= 3) {
    const net = reentries.reduce((s, t) => s + pnl(t), 0)
    lines.push(`Re-entered within ${REENTRY_MINUTES} minutes of a loss ${reentries.length} times: ${pct(winRate(reentries) * reentries.length, reentries.length)} winners (vs ${pct(overall * 100, 100)} overall), net ${money(net)}.`)
  }

  // The trade after two or more losses in a row
  const afterStreak: PatternTrade[] = []
  for (let i = 2; i < sorted.length; i++) {
    if (pnl(sorted[i - 1]) < 0 && pnl(sorted[i - 2]) < 0) afterStreak.push(sorted[i])
  }
  if (afterStreak.length >= 3) {
    lines.push(`After 2+ losses in a row, the next trade won ${pct(winRate(afterStreak) * afterStreak.length, afterStreak.length)} of the time (${afterStreak.length} trades), net ${money(afterStreak.reduce((s, t) => s + pnl(t), 0))}.`)
  }

  // Best and worst hour of the day (by entry time)
  const hours = new Map<number, PatternTrade[]>()
  for (const t of sorted) {
    const h = localParts(t.opened_at ?? t.closed_at, tz).hour
    hours.set(h, [...(hours.get(h) ?? []), t])
  }
  const ranked = [...hours.entries()]
    .filter(([, ts]) => ts.length >= 3)
    .map(([h, ts]) => ({ h, n: ts.length, net: ts.reduce((s, t) => s + pnl(t), 0) }))
    .sort((a, b) => a.net - b.net)
  if (ranked.length >= 2) {
    const worst = ranked[0], best = ranked[ranked.length - 1]
    if (worst.net < 0) lines.push(`Worst hour: trades entered ${hourLabel(worst.h)}-${hourLabel((worst.h + 1) % 24)} (${worst.n} trades, net ${money(worst.net)}).`)
    if (best.net > 0) lines.push(`Best hour: ${hourLabel(best.h)}-${hourLabel((best.h + 1) % 24)} (${best.n} trades, net ${money(best.net)}).`)
  }

  // Days over their own max-trades rule
  const max = limits?.max_trades_per_day
  if (max) {
    const over = [...days.values()].filter(ts => ts.length > max)
    if (over.length > 0) {
      const extra = over.flatMap(ts => ts.slice(max))
      lines.push(`Went past the ${max}-trade daily limit on ${over.length} of ${days.size} days; the trades past the limit netted ${money(extra.reduce((s, t) => s + pnl(t), 0))}.`)
    } else {
      lines.push(`Stayed within the ${max}-trade daily limit every day.`)
    }
  }

  return lines
}

// Patterns from the last 30 days up to the start of today (stable all day, so it caches well)
export async function loadTradePatterns(
  supabase: SupabaseClient,
  userId: string,
  todayStart: Date,
  limits: PatternLimits,
  timezone?: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("trades")
    .select("opened_at, closed_at, realized_pnl")
    .eq("user_id", userId)
    .gte("closed_at", new Date(todayStart.getTime() - DAYS * 24 * 60 * 60 * 1000).toISOString())
    .lt("closed_at", todayStart.toISOString())
    .order("closed_at", { ascending: true })
    .limit(2000)
  if (error || !data) return []
  return tradePatterns(data as PatternTrade[], limits, timezone)
}
