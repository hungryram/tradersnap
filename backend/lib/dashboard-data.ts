"use client"

import { createClient } from "./supabase-client"

export type Trade = {
  id: string
  platform: string
  account: string | null
  symbol: string | null
  side: "long" | "short" | null
  qty: number | null
  kind?: "trade" | "day_total" // "day_total": an adjustment so the day matches the total the trader reported; not a trade
  source?: "auto" | "manual" // "manual": the trader reported it in chat, so there is no entry or exit
  entry_price: number | null
  exit_price: number | null
  fill_count: number | null
  realized_pnl: number | null
  pnl_source: string
  opened_at: string | null
  closed_at: string
  strategy_id?: string | null
  strategy_source?: "auto" | "user" | null
  checked?: boolean // a chart check came first (within 20 minutes before it opened)
}

export type Streak = { days: number; brokenToday: boolean } | null

// Today's trades plus the discipline streak (trading days in a row with no rule broken)
export async function loadTodayWithStreak(): Promise<{ trades: Trade[]; streak: Streak }> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const data = await api<{ trades: Trade[]; streak?: Streak }>(`/api/trades?since=${encodeURIComponent(startOfLocalDay().toISOString())}&limit=200&streak=1&tz=${encodeURIComponent(tz)}`)
  return { trades: data.trades ?? [], streak: data.streak ?? null }
}

export type TradingLimits = {
  max_trades_per_day: number | null
  max_daily_loss: number | null
  stop_after_losses: number | null
  session_start: string | null
  session_end: string | null
  timezone: string | null
}

// Fetch helper for dashboard pages: adds the session token. If the server
// rejects the token, renew the session once; if that fails the login is dead
// (expired or revoked), so sign out and go to the sign-in page.
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return signedOut()

  const send = (token: string) => fetch(path, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) }
  })

  let response = await send(session.access_token)
  if (response.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (!refreshed.session) {
      await supabase.auth.signOut().catch(() => {})
      return signedOut()
    }
    response = await send(refreshed.session.access_token)
    if (response.status === 401) {
      await supabase.auth.signOut().catch(() => {})
      return signedOut()
    }
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data as T
}

function signedOut(): never {
  window.location.href = "/"
  throw new Error("Signed out")
}

export function startOfLocalDay(daysAgo = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  return date
}

export async function loadTrades(since: Date, limit = 200): Promise<Trade[]> {
  const data = await api<{ trades: Trade[] }>(`/api/trades?since=${encodeURIComponent(since.toISOString())}&limit=${limit}`)
  return data.trades ?? []
}

// Trades closed in [since, until), plus where the Free plan's history starts (null on Pro)
export async function loadTradeWindow(since: Date, until: Date | null, limit = 1000): Promise<{ trades: Trade[]; historyFrom: string | null }> {
  const params = new URLSearchParams({ since: since.toISOString(), limit: String(limit) })
  if (until) params.set("until", until.toISOString())
  const data = await api<{ trades: Trade[]; historyFrom?: string | null }>(`/api/trades?${params}`)
  return { trades: data.trades ?? [], historyFrom: data.historyFrom ?? null }
}

export type StrategyOption = { id: string; name: string }

export async function loadStrategyOptions(): Promise<StrategyOption[]> {
  const data = await api<{ rulesets: StrategyOption[] }>("/api/rulesets")
  return (data.rulesets ?? []).map(r => ({ id: r.id, name: r.name }))
}

export const pnlOf = (trade: Trade) => Number(trade.realized_pnl ?? 0)

// Day-total entries count in P&L but are not trades
export const realTrades = (trades: Trade[]) => trades.filter(t => t.kind !== "day_total")

export function summarize(all: Trade[]) {
  const trades = realTrades(all)
  const wins = trades.filter(t => pnlOf(t) > 0)
  const losses = trades.filter(t => pnlOf(t) < 0)
  const net = all.reduce((sum, t) => sum + pnlOf(t), 0)
  const grossWin = wins.reduce((sum, t) => sum + pnlOf(t), 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + pnlOf(t), 0))
  // trades come newest first
  let lossStreak = 0
  for (const t of trades) {
    if (pnlOf(t) < 0) lossStreak++
    else break
  }
  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    net,
    winRate: trades.length ? wins.length / trades.length : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    lossStreak
  }
}

export function tickerOf(symbol: string | null) {
  if (!symbol) return "—"
  return symbol.split(":").pop() ?? symbol
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

export function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

export function holdTime(trade: Trade) {
  if (!trade.opened_at) return null
  const minutes = Math.round((Date.parse(trade.closed_at) - Date.parse(trade.opened_at)) / 60000)
  if (minutes < 1) return "<1m"
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
