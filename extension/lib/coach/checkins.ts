// Coach check-ins: short messages the coach starts on its own, only when
// something real happened in the trader's day. Pure logic (no DOM/storage) so
// it can be tested; content.tsx decides delivery, dedupe and the user's setting.

export type CheckInKind =
  | "morning_plan" | "loss_streak" | "daily_loss" | "revenge"
  | "max_trades" | "over_max" | "outside_hours" | "big_win" | "session_recap" | "announcement"

export type CheckIn = {
  id: string // unique per day and event, so the same check-in never repeats
  kind: CheckInKind
  level: "warning" | "info"
  text: string
}

export type CoachTrade = {
  symbol: string
  realized_pnl: number | null
  opened_at: string | null
  closed_at: string
}

export type CoachLimits = {
  max_trades_per_day: number | null
  max_daily_loss: number | null
  stop_after_losses: number | null
  session_start: string | null // "09:30", trader's local time
  session_end: string | null
}

export type CoachContext = {
  now: Date
  trades: CoachTrade[] // closed today, any order
  limits: CoachLimits | null
}

export const REVENGE_MINUTES = 5

const pnlOf = (t: CoachTrade) => Number(t.realized_pnl ?? 0)
const money = (v: number) => `${v < 0 ? "-" : "+"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: Math.abs(v) % 1 ? 2 : 0 })}`
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const clock = (hhmm: string) => new Date(2000, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

function sorted(trades: CoachTrade[]) {
  return [...trades].sort((a, b) => a.closed_at.localeCompare(b.closed_at))
}

function lossStreak(trades: CoachTrade[]) {
  let streak = 0
  for (const t of sorted(trades).reverse()) {
    if (pnlOf(t) < 0) streak++
    else break
  }
  return streak
}

function outsideWindow(limits: CoachLimits | null, at: Date) {
  if (!limits?.session_start || !limits?.session_end) return false
  const m = minutesOf(at)
  return m < toMinutes(limits.session_start) || m >= toMinutes(limits.session_end)
}

// First visit of the day: today's plan in one breath
export function morningPlan(ctx: CoachContext): CheckIn {
  const l = ctx.limits
  const parts = [
    l?.max_trades_per_day && `max ${l.max_trades_per_day} trades`,
    l?.stop_after_losses && `stop after ${l.stop_after_losses} losses in a row`,
    l?.max_daily_loss && `stop if down $${l.max_daily_loss}`,
    l?.session_start && l?.session_end && `trade ${clock(l.session_start)} to ${clock(l.session_end)}`
  ].filter(Boolean)
  const greeting = ctx.now.getHours() < 12 ? "Morning." : "Hey."
  return {
    id: `${dayKey(ctx.now)}:morning_plan`,
    kind: "morning_plan",
    level: "info",
    text: parts.length
      ? `${greeting} Today's plan: ${parts.join(", ")}. One good setup beats five forced ones.`
      : `${greeting} You haven't set daily limits yet. A max-trades rule is the fastest way to stop overtrading. You can add one under Rules in your dashboard.`
  }
}

// After a trade closes (or today's trades load)
export function afterTrades(ctx: CoachContext): CheckIn[] {
  const day = dayKey(ctx.now)
  const trades = sorted(ctx.trades)
  if (trades.length === 0) return []
  const l = ctx.limits
  const out: CheckIn[] = []
  const last = trades[trades.length - 1]

  // Losing streak, measured against their rule (or 3 without one)
  const streak = lossStreak(trades)
  const streakLimit = l?.stop_after_losses ?? null
  if (streakLimit && streak >= streakLimit) {
    out.push({
      id: `${day}:loss_streak:${streak}`,
      kind: "loss_streak",
      level: "warning",
      text: streak === streakLimit
        ? `That's ${streak} losses in a row. Your rule says you're done for today. Want to talk it through before you close the chart?`
        : `${streak} losses in a row now, past your limit of ${streakLimit}. Stepping away is what protects the account today.`
    })
  } else if (!streakLimit && streak >= 3) {
    out.push({ id: `${day}:loss_streak:${streak}`, kind: "loss_streak", level: "warning", text: `${streak} losses in a row. This is a good moment for a 15-minute break before anything else.` })
  }

  // Daily loss limit
  const net = trades.reduce((sum, t) => sum + pnlOf(t), 0)
  if (l?.max_daily_loss && net <= -l.max_daily_loss) {
    out.push({ id: `${day}:daily_loss`, kind: "daily_loss", level: "warning", text: `You're ${money(net)} today, past your $${l.max_daily_loss} daily loss limit. Your rule says stop here.` })
  }

  // Reached max trades
  if (l?.max_trades_per_day && trades.length === l.max_trades_per_day) {
    out.push({ id: `${day}:max_trades`, kind: "max_trades", level: "warning", text: `That's trade ${trades.length} of ${l.max_trades_per_day}. Anything else today breaks your rule.` })
  }

  // Unusually big win: at least twice the typical size of today's other trades and the best so far
  const pnl = pnlOf(last)
  if (pnl > 0 && trades.length >= 2) {
    const others = trades.slice(0, -1).map(t => Math.abs(pnlOf(t))).filter(v => v > 0)
    const typical = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0
    const bestBefore = Math.max(0, ...trades.slice(0, -1).map(pnlOf))
    if (typical > 0 && pnl >= 2 * typical && pnl > bestBefore) {
      out.push({ id: `${day}:big_win:${last.closed_at}`, kind: "big_win", level: "info", text: `Nice, ${money(pnl)}. Right after a big win is when overconfidence sneaks in. Good moment to stop while you're green.` })
    }
  }

  return out
}

// A new position just opened (seen live in the trading panel)
export function onPositionOpened(ctx: CoachContext, openedAt: Date): CheckIn[] {
  const day = dayKey(ctx.now)
  const trades = sorted(ctx.trades)
  const l = ctx.limits
  const out: CheckIn[] = []

  // Back in soon after a loss: the classic revenge trade
  const last = trades[trades.length - 1]
  if (last && pnlOf(last) < 0) {
    const minutes = (openedAt.getTime() - Date.parse(last.closed_at)) / 60000
    if (minutes >= 0 && minutes <= REVENGE_MINUTES) {
      const m = Math.max(1, Math.round(minutes))
      out.push({
        id: `${day}:revenge:${last.closed_at}`,
        kind: "revenge",
        level: "warning",
        text: `You're back in ${m} ${m === 1 ? "minute" : "minutes"} after a ${money(pnlOf(last))} loss. Was this setup on your plan, or is it the last trade talking?`
      })
    }
  }

  // Opening a trade past the daily max
  if (l?.max_trades_per_day && trades.length >= l.max_trades_per_day) {
    out.push({
      id: `${day}:over_max:${trades.length + 1}`,
      kind: "over_max",
      level: "warning",
      text: `This is trade ${trades.length + 1} today. Your limit is ${l.max_trades_per_day}.`
    })
  }

  // Outside their trading hours (once per hour)
  if (outsideWindow(l, openedAt)) {
    out.push({
      id: `${day}:outside_hours:${openedAt.getHours()}`,
      kind: "outside_hours",
      level: "warning",
      text: `It's ${openedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Your trading window is ${clock(l!.session_start!)} to ${clock(l!.session_end!)}.`
    })
  }

  return out
}

// End of the session: their window closed (or 4pm without one), they traded, and they're flat
export function sessionRecap(ctx: CoachContext, hasOpenPositions: boolean): CheckIn | null {
  const trades = sorted(ctx.trades)
  if (trades.length === 0 || hasOpenPositions) return null
  const l = ctx.limits
  const end = l?.session_end ? toMinutes(l.session_end) : 16 * 60
  if (minutesOf(ctx.now) < end) return null
  // Wait until 10 minutes after their last trade
  if (ctx.now.getTime() - Date.parse(trades[trades.length - 1].closed_at) < 10 * 60000) return null

  const wins = trades.filter(t => pnlOf(t) > 0).length
  const losses = trades.filter(t => pnlOf(t) < 0).length
  const net = trades.reduce((sum, t) => sum + pnlOf(t), 0)

  const broken: string[] = []
  if (l?.max_trades_per_day && trades.length > l.max_trades_per_day) broken.push(`took ${trades.length} trades (limit ${l.max_trades_per_day})`)
  let streak = 0, worst = 0
  for (const t of trades) { streak = pnlOf(t) < 0 ? streak + 1 : 0; worst = Math.max(worst, streak) }
  if (l?.stop_after_losses && worst > l.stop_after_losses) broken.push(`kept trading after ${l.stop_after_losses} losses in a row`)
  if (l?.max_daily_loss && net < -l.max_daily_loss) broken.push(`went past your $${l.max_daily_loss} daily loss limit`)
  const outside = trades.filter(t => outsideWindow(l, new Date(t.opened_at ?? t.closed_at))).length
  if (outside) broken.push(`${outside} ${outside === 1 ? "trade" : "trades"} outside your hours`)

  return {
    id: `${dayKey(ctx.now)}:session_recap`,
    kind: "session_recap",
    level: "info",
    text: `Today: ${trades.length} ${trades.length === 1 ? "trade" : "trades"}, ${wins}W ${losses}L, ${money(net)}. ${broken.length ? `Rules broken: ${broken.join("; ")}.` : "No rules broken. That's the win."} What's one thing to do differently tomorrow?`
  }
}
