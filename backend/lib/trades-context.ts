import type { SupabaseClient } from "@supabase/supabase-js"
import { markCopies } from "./copy-trades"

type TradeRow = {
  symbol: string | null
  side: "long" | "short" | null
  qty: number | null
  source?: string
  kind?: string
  account?: string | null
  opened_at?: string | null
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
    .select("symbol, side, qty, source, kind, account, opened_at, entry_price, exit_price, fill_count, realized_pnl, pnl_source, closed_at")
    .eq("user_id", userId)
    .gte("closed_at", since.toISOString())
    .order("closed_at", { ascending: true })
    .limit(100)

  // Before 20261022_manual_trades.sql there is no source column
  let rows: unknown[] | null = data
  if (error) {
    const retry = await supabase
      .from("trades")
      .select("symbol, side, qty, account, opened_at, entry_price, exit_price, fill_count, realized_pnl, pnl_source, closed_at")
      .eq("user_id", userId)
      .gte("closed_at", since.toISOString())
      .order("closed_at", { ascending: true })
      .limit(100)
    if (retry.error) return null
    rows = retry.data
  }

  // A trade copied to several accounts is listed once (with its accounts), and counts once
  const marked = markCopies<TradeRow>((rows ?? []) as unknown as TradeRow[])
  const trades = marked.filter(t => !t.is_copy)
  const accountsToday = new Set(marked.map(t => t.account).filter(Boolean))
  if (marked.length === 0) {
    return `TODAY'S TRADES: none recorded. Trades are only recorded when the trader has "Auto-detect trades" on and TradingView's trading panel open, so they may still have traded elsewhere. If it matters, ask.`
  }

  const pnl = (t: TradeRow) => Number(t.realized_pnl ?? 0)
  // A copied trade wins or loses as a group; a day-total entry counts in net P&L but is not a trade
  const decision = (t: (typeof trades)[number]) => t.group_pnl
  const real = trades.filter(t => t.kind !== "day_total")
  const wins = real.filter(t => decision(t) > 0).length
  const losses = real.filter(t => decision(t) < 0).length
  const net = marked.reduce((sum, t) => sum + pnl(t), 0)
  let streak = 0
  for (let i = real.length - 1; i >= 0 && decision(real[i]) < 0; i--) streak++

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
    if (t.kind === "day_total") return `${n}. ${time(t.closed_at)} adjustment so the journal matches the day total the trader reported (not a trade): ${money(pnl(t))}`
    if (t.source === "manual") return `${n}. ${time(t.closed_at)} ${t.symbol ? t.symbol.split(":").pop() + " " : ""}reported by the trader: ${money(pnl(t))}`
    // With several accounts in play, say which one a single-account trade was on
    const accounts = t.copies > 1
      ? ` (copied to ${t.copies} accounts, ${money(decision(t))} combined)`
      : accountsToday.size > 1 && t.account ? ` [account ${t.account.replace(/^[a-z]+:/i, "")}]` : ""
    return `${n}. ${time(t.closed_at)} ${(t.symbol ?? "?").split(":").pop()} ${t.side} ${t.qty} @ ${price(t.entry_price)} -> ${price(t.exit_price)}: ${money(pnl(t))}${accounts}${estimated}${fills}`
  })

  return `TODAY'S TRADES (auto-detected from the trader's platform, plus any results the trader reported and logged; times in their local time):
${real.length} trades, ${wins} wins, ${losses} losses, net ${money(net)}${accountsToday.size > 1 ? ` across ${accountsToday.size} accounts (a trade copied to several accounts counts as one trade; the net adds up every account)` : ""}${streak >= 2 ? `, ${streak} losses in a row right now` : ""}.
${lines.join("\n")}

Use these when they ask about their day or when it bears on the rules (max trades, max losses, trading window). Trades made with the trading panel closed or on other platforms may be missing.`
}
