// Coach check-ins: short messages the coach starts on its own, only when
// something real happened in the trader's day. Pure logic (no DOM/storage) so
// it can be tested; content.tsx decides delivery, dedupe and the user's setting.
//
// Each check-in has several phrasings in Pip's voice so it doesn't read like the
// same notification every day. Numbers always come from the trader's own data.

export type CheckInKind =
  | "morning_plan" | "loss_streak" | "daily_loss" | "revenge"
  | "max_trades" | "over_max" | "outside_hours" | "big_win" | "session_recap" | "announcement" | "loss_reset"

export type CheckIn = {
  id: string // unique per day and event, so the same check-in never repeats
  kind: CheckInKind
  level: "warning" | "info"
  text: string
  // Facts for an AI-written version (morning plan and recap); `text` is the fallback
  compose?: Record<string, unknown>
  // Offer the 60-second reset with this check-in (after losses)
  offerReset?: boolean
}

export type CoachTrade = {
  symbol: string
  realized_pnl: number | null
  opened_at: string | null
  closed_at: string
  kind?: string // "day_total": an adjustment so the day matches the total the trader reported; counts in P&L, not as a trade
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
  name?: string | null // first name, when the trader gave one
  streak?: number | null // trading days in a row with no rule broken
}

export const REVENGE_MINUTES = 5

const pnlOf = (t: CoachTrade) => Number(t.realized_pnl ?? 0)
const money = (v: number) => `${v < 0 ? "-" : "+"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: Math.abs(v) % 1 ? 2 : 0 })}`
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const clock = (hhmm: string) => new Date(2000, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`

// Same id, same phrasing (every tab agrees); a new day or event picks again
export function pick<T>(options: T[], seed: string): T {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return options[(h >>> 0) % options.length]
}

// Trades only: day-total entries stay out of counts, streaks and the last-trade checks (net P&L uses ctx.trades)
function sorted(trades: CoachTrade[]) {
  return trades.filter(t => t.kind !== "day_total").sort((a, b) => a.closed_at.localeCompare(b.closed_at))
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
  const id = `${dayKey(ctx.now)}:morning_plan`
  const parts = [
    l?.max_trades_per_day && `max ${l.max_trades_per_day} trades`,
    l?.stop_after_losses && `stop after ${l.stop_after_losses} losses in a row`,
    l?.max_daily_loss && `stop if down $${l.max_daily_loss}`,
    l?.session_start && l?.session_end && `trade ${clock(l.session_start)} to ${clock(l.session_end)}`
  ].filter(Boolean) as string[]
  const name = ctx.name?.trim()
  const morning = ctx.now.getHours() < 12
  const hi = pick(morning ? ["Morning", "Good morning", "Hey", "Morning"] : ["Hey", "Hi", "Welcome back"], id + ":hi")
  const greeting = `${hi}${name ? `, ${name}` : ""}.`
  const plan = parts.join(", ")

  const streakLine = ctx.streak && ctx.streak >= 2 ? ` That's ${ctx.streak} days in a row with no rules broken. Let's make it ${ctx.streak + 1}.` : ""
  const text = (parts.length
    ? pick([
        `${greeting} Today's plan: ${plan}. One good setup beats five forced ones.`,
        `${greeting} Same rules as always: ${plan}. Let the setups come to you.`,
        `${greeting} Here's the plan: ${plan}. Patience is the edge today.`,
        `${greeting} Quick reminder of today's plan: ${plan}. Only your A setups.`,
        `${greeting} The plan for today: ${plan}. Waiting is a position too.`,
        `${greeting} Today: ${plan}. Trade your plan, not the P&L.`,
      ], id)
    : pick([
        `${greeting} You haven't set daily limits yet. A max-trades rule is the fastest way to stop overtrading. You can add one under Rules in your dashboard.`,
        `${greeting} No daily limits set yet. Even a simple "max 3 trades" makes a big difference. Add one under Rules in your dashboard.`,
        `${greeting} Want me to keep you honest today? Set a max-trades or daily loss limit under Rules in your dashboard and I'll hold you to it.`,
      ], id)) + streakLine

  return {
    id,
    kind: "morning_plan",
    level: "info",
    text,
    compose: {
      name: name || null,
      local_time: ctx.now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      plan: parts,
      streak_days: ctx.streak ?? null,
    }
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
  const streakId = `${day}:loss_streak:${streak}`
  if (streakLimit && streak >= streakLimit) {
    out.push({
      id: streakId,
      kind: "loss_streak",
      level: "warning",
      text: streak === streakLimit
        ? pick([
            `That's ${streak} losses in a row. Your rule says you're done for today. Want to talk it through before you close the chart?`,
            `${streak} in a row. That's your stop rule, so today's trading is done. Want to talk about it before you log off?`,
            `That's ${streak} losses in a row, which is where your plan says to stop. Closing the chart now is the disciplined move.`,
            `${streak} losses in a row. You wrote this rule for exactly this moment: done for today. I'm here if you want to talk it through.`,
          ], streakId)
        : pick([
            `${streak} losses in a row now, past your limit of ${streakLimit}. Stepping away is what protects the account today.`,
            `That's ${streak} in a row, past your ${streakLimit}-loss rule. Every trade from here is fighting the plan. Time to step away.`,
            `${streak} losses in a row, and your limit is ${streakLimit}. The best trade left today is no trade.`,
          ], streakId)
    })
  } else if (!streakLimit && streak >= 3) {
    out.push({
      id: streakId,
      kind: "loss_streak",
      level: "warning",
      text: pick([
        `${streak} losses in a row. This is a good moment for a 15-minute break before anything else.`,
        `That's ${streak} in a row. Take 15 minutes away from the screen before the next one.`,
        `${streak} losses in a row. Losing streaks are when the worst trades happen. A short break resets your head.`,
      ], streakId)
    })
  }

  for (const c of out) if (c.kind === "loss_streak") c.offerReset = true

  // A single loss (no streak warning above): a gentle offer to reset before the next trade
  if (pnlOf(last) < 0 && !out.some(c => c.kind === "loss_streak")) {
    const id = `${day}:loss_reset:${last.closed_at}`
    out.push({
      id,
      kind: "loss_reset",
      level: "info",
      offerReset: true,
      text: pick([
        `That one was a loss, ${money(pnlOf(last))}. Before the next trade, take 60 seconds to reset.`,
        `Loss on that one (${money(pnlOf(last))}). It happens. A quick reset now keeps it from turning into two.`,
        `${money(pnlOf(last))} on that trade. Shake it off with a 60-second reset before you look for the next one.`,
      ], id)
    })
  }

  // Daily loss limit
  const net = ctx.trades.reduce((sum, t) => sum + pnlOf(t), 0)
  if (l?.max_daily_loss && net <= -l.max_daily_loss) {
    const id = `${day}:daily_loss`
    out.push({
      id,
      kind: "daily_loss",
      level: "warning",
      offerReset: true,
      text: pick([
        `You're ${money(net)} today, past your $${l.max_daily_loss} daily loss limit. Your rule says stop here.`,
        `That's ${money(net)} on the day, past your $${l.max_daily_loss} limit. Today's done. Protecting the account is the win now.`,
        `${money(net)} today, and your daily loss limit is $${l.max_daily_loss}. This is the rule that keeps a bad day from becoming a bad week. Time to stop.`,
      ], id)
    })
  }

  // Reached max trades
  if (l?.max_trades_per_day && trades.length === l.max_trades_per_day) {
    const id = `${day}:max_trades`
    out.push({
      id,
      kind: "max_trades",
      level: "warning",
      text: pick([
        `That's trade ${trades.length} of ${l.max_trades_per_day}. Anything else today breaks your rule.`,
        `${trades.length} of ${l.max_trades_per_day} trades done. That's your day. Anything more breaks your plan.`,
        `That was trade ${trades.length}, your max for today. Nice work sticking to it. Let's call it here.`,
      ], id)
    })
  }

  // Unusually big win: at least twice the typical size of today's other trades and the best so far
  const pnl = pnlOf(last)
  if (pnl > 0 && trades.length >= 2) {
    const others = trades.slice(0, -1).map(t => Math.abs(pnlOf(t))).filter(v => v > 0)
    const typical = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0
    const bestBefore = Math.max(0, ...trades.slice(0, -1).map(pnlOf))
    if (typical > 0 && pnl >= 2 * typical && pnl > bestBefore) {
      const id = `${day}:big_win:${last.closed_at}`
      out.push({
        id,
        kind: "big_win",
        level: "info",
        text: pick([
          `Nice, ${money(pnl)}. Right after a big win is when overconfidence sneaks in. Good moment to stop while you're green.`,
          `${money(pnl)}, nice trade. Big wins make the next trade feel easy. It isn't. Consider calling it a day.`,
          `Great trade, ${money(pnl)}. The urge to size up after a win like that is real. Protect it.`,
        ], id)
      })
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
      const id = `${day}:revenge:${last.closed_at}`
      const loss = money(pnlOf(last))
      out.push({
        id,
        kind: "revenge",
        level: "warning",
        offerReset: true,
        text: pick([
          `You're back in ${plural(m, "minute")} after a ${loss} loss. Was this setup on your plan, or is it the last trade talking?`,
          `${plural(m, "minute")} after a ${loss} loss and you're in again. Is this an A setup, or a make-it-back trade?`,
          `Quick check: you re-entered ${plural(m, "minute")} after a ${loss} loss. Would you take this trade if the last one had been a winner?`,
        ], id)
      })
    }
  }

  // Opening a trade past the daily max
  if (l?.max_trades_per_day && trades.length >= l.max_trades_per_day) {
    const id = `${day}:over_max:${trades.length + 1}`
    out.push({
      id,
      kind: "over_max",
      level: "warning",
      text: pick([
        `This is trade ${trades.length + 1} today. Your limit is ${l.max_trades_per_day}.`,
        `Trade ${trades.length + 1}, and your limit is ${l.max_trades_per_day}. What's different about this one?`,
        `That's ${trades.length + 1} trades today against a limit of ${l.max_trades_per_day}. Worth closing this one and calling it a day.`,
      ], id)
    })
  }

  // Outside their trading hours (once per hour)
  if (outsideWindow(l, openedAt)) {
    const id = `${day}:outside_hours:${openedAt.getHours()}`
    const now = openedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    const window = `${clock(l!.session_start!)} to ${clock(l!.session_end!)}`
    out.push({
      id,
      kind: "outside_hours",
      level: "warning",
      text: pick([
        `It's ${now}. Your trading window is ${window}.`,
        `Heads up: it's ${now}, outside your ${window} window.`,
        `It's ${now}, and you set your hours to ${window} for a reason. Is this trade worth breaking that?`,
      ], id)
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
  const net = ctx.trades.reduce((sum, t) => sum + pnlOf(t), 0)

  const broken: string[] = []
  if (l?.max_trades_per_day && trades.length > l.max_trades_per_day) broken.push(`took ${trades.length} trades (limit ${l.max_trades_per_day})`)
  let streak = 0, worst = 0
  for (const t of trades) { streak = pnlOf(t) < 0 ? streak + 1 : 0; worst = Math.max(worst, streak) }
  if (l?.stop_after_losses && worst > l.stop_after_losses) broken.push(`kept trading after ${l.stop_after_losses} losses in a row`)
  if (l?.max_daily_loss && net < -l.max_daily_loss) broken.push(`went past your $${l.max_daily_loss} daily loss limit`)
  const outside = trades.filter(t => outsideWindow(l, new Date(t.opened_at ?? t.closed_at))).length
  if (outside) broken.push(`${plural(outside, "trade")} outside your hours`)

  const id = `${dayKey(ctx.now)}:session_recap`
  const summary = `${plural(trades.length, "trade")}, ${wins}W ${losses}L, ${money(net)}`
  const verdict = broken.length
    ? `Rules broken: ${broken.join("; ")}.`
    : pick(["No rules broken. That's the win.", "Every rule kept. That's the win.", "No rules broken. That's how good habits get built."], id + ":clean")
  const question = pick([
    "What's one thing to do differently tomorrow?",
    "What's one thing you want to repeat tomorrow?",
    "What did today teach you?",
    "Anything you want me to watch for tomorrow?",
  ], id)

  return {
    id,
    kind: "session_recap",
    level: "info",
    text: `${pick(["Today:", "That's the session:", "Day done:"], id + ":lead")} ${summary}. ${verdict} ${question}`,
    compose: {
      trades: trades.length,
      wins,
      losses,
      net: money(net),
      rules_broken: broken,
      limits: l ?? null,
    }
  }
}
