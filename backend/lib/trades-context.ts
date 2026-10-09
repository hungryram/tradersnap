import type { SupabaseClient } from "@supabase/supabase-js"

type TradeRow = {
  symbol: string
  side: "long" | "short"
  qty: number
  entry_price: number | null
  exit_price: number | null
  fill_count: number | null
  realized_pnl: number | null
  pnl_source: string
  closed_at: string
}

// Today's auto-detected trades as context for the coach. Always returns text
// when the lookup works, so the model knows the difference between "no trades
// today" and "I have no trade data".
export async function buildTradesContext(
  supabase: SupabaseClient,
  userId: string,
  since: Date,
  timezone?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("trades")
    .select("symbol, side, qty, entry_price, exit_price, fill_count, realized_pnl, pnl_source, closed_at")
    .eq("user_id", userId)
    .gte("closed_at", since.toISOString())
    .order("closed_at", { ascending: true })
    .limit(100)

  if (error) return null

  const trades = (data ?? []) as TradeRow[]
  if (trades.length === 0) {
    return `TODAY'S TRADES: none recorded. Trades are only recorded when the trader has "Auto-detect trades" on and TradingView's trading panel open, so they may still have traded elsewhere. If it matters, ask.`
  }

  const pnl = (t: TradeRow) => Number(t.realized_pnl ?? 0)
  const wins = trades.filter(t => pnl(t) > 0).length
  const losses = trades.filter(t => pnl(t) < 0).length
  const net = trades.reduce((sum, t) => sum + pnl(t), 0)
  let streak = 0
  for (let i = trades.length - 1; i >= 0 && pnl(trades[i]) < 0; i--) streak++

  const time = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("en-US", { timeZone: timezone || "America/New_York", hour: "numeric", minute: "2-digit" })
    } catch {
      return new Date(iso).toISOString().slice(11, 16) + " UTC"
    }
  }
  const money = (value: number) => `${value < 0 ? "-" : "+"}$${Math.abs(value).toFixed(2)}`
  const price = (value: number | null) => value === null ? "?" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })

  // Most recent 30 in detail; the totals cover the whole day
  const lines = trades.slice(-30).map((t, i, shown) => {
    const n = trades.length - shown.length + i + 1
    const fills = t.fill_count && t.fill_count > 2 ? `, ${t.fill_count} fills` : ""
    const estimated = t.pnl_source === "estimated" ? " (estimated)" : ""
    return `${n}. ${time(t.closed_at)} ${t.symbol.split(":").pop()} ${t.side} ${t.qty} @ ${price(t.entry_price)} -> ${price(t.exit_price)}: ${money(pnl(t))}${estimated}${fills}`
  })

  return `TODAY'S TRADES (auto-detected from the trader's platform, closing times in their local time):
${trades.length} trades, ${wins} wins, ${losses} losses, net ${money(net)}${streak >= 2 ? `, ${streak} losses in a row right now` : ""}.
${lines.join("\n")}

Use these when they ask about their day or when it bears on the rules (max trades, max losses, trading window). Trades made with the trading panel closed or on other platforms may be missing.`
}
