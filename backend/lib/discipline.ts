import { tradingDayKey } from "./trading-day"
import { accountLabel, accountsOf, type Trade, type TradingLimits } from "./dashboard-data"

// Which of the trader's daily limits a day's trades broke. Same checks as Pip's
// end-of-session recap in the extension (lib/coach/checkins.ts).

const pnl = (t: Trade) => Number(t.realized_pnl ?? 0)
// A trade copied to several accounts wins or loses as a group
const decision = (t: Trade) => t.group_pnl ?? pnl(t)
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

// Which trading day a time belongs to (see lib/trading-day: an evening futures trade is part of the next day)
export function dayKeyOf(iso: string, dayRule?: string | null) {
  return tradingDayKey(iso, dayRule)
}

// Each account has its own limits (an eval's loss limit is per account), so with several accounts each one is
// checked on its own and the messages say which account broke what
export function brokenRules(dayTrades: Trade[], limits: TradingLimits | null): string[] {
  const accounts = accountsOf(dayTrades.filter(t => t.kind !== "day_total"))
  if (accounts.length > 1) {
    return accounts.flatMap(a =>
      brokenRulesFor(dayTrades.filter(t => t.account === a).map(t => ({ ...t, is_copy: false, group_pnl: undefined })), limits).map(m => `${accountLabel(a)}: ${m}`)
    )
  }
  return brokenRulesFor(dayTrades, limits)
}

function brokenRulesFor(dayTrades: Trade[], limits: TradingLimits | null): string[] {
  if (!limits || dayTrades.length === 0) return []
  // Day-total entries count in the day's P&L but are not trades
  const trades = dayTrades.filter(t => t.kind !== "day_total" && !t.is_copy).sort((a, b) => a.closed_at.localeCompare(b.closed_at))
  const broken: string[] = []

  if (limits.max_trades_per_day && trades.length > limits.max_trades_per_day) {
    broken.push(`${trades.length} trades (limit ${limits.max_trades_per_day})`)
  }
  if (limits.stop_after_losses) {
    let streak = 0, worst = 0
    for (const t of trades) { streak = decision(t) < 0 ? streak + 1 : 0; worst = Math.max(worst, streak) }
    if (worst > limits.stop_after_losses) broken.push(`Kept trading after ${limits.stop_after_losses} losses in a row`)
  }
  const net = dayTrades.reduce((sum, t) => sum + pnl(t), 0)
  if (limits.max_daily_loss && net < -limits.max_daily_loss) broken.push(`Past the $${limits.max_daily_loss} daily loss limit`)
  if (limits.session_start && limits.session_end) {
    const start = minutes(limits.session_start), end = minutes(limits.session_end)
    const outside = trades.filter(t => {
      const d = new Date(t.opened_at ?? t.closed_at)
      const m = d.getHours() * 60 + d.getMinutes()
      return m < start || m >= end
    }).length
    if (outside) broken.push(`${outside} ${outside === 1 ? "trade" : "trades"} outside your hours`)
  }
  return broken
}

// Whether the trader has any limit set at all (otherwise there's nothing to keep)
export const hasLimits = (limits: TradingLimits | null) =>
  !!limits && !!(limits.max_trades_per_day || limits.stop_after_losses || limits.max_daily_loss || (limits.session_start && limits.session_end))
