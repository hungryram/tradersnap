"use client"

import { createClient } from "./supabase-client"

export type Trade = {
  id: string
  platform: string
  account: string | null
  symbol: string
  side: "long" | "short"
  qty: number
  entry_price: number | null
  exit_price: number | null
  fill_count: number | null
  realized_pnl: number | null
  pnl_source: string
  opened_at: string | null
  closed_at: string
}

export type TradingLimits = {
  max_trades_per_day: number | null
  max_daily_loss: number | null
  stop_after_losses: number | null
  session_start: string | null
  session_end: string | null
  timezone: string | null
}

// Fetch helper for dashboard pages: adds the session token, sends to / if signed out
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = "/"
    throw new Error("Signed out")
  }
  const response = await fetch(path, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${session.access_token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data as T
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

export const pnlOf = (trade: Trade) => Number(trade.realized_pnl ?? 0)

export function summarize(trades: Trade[]) {
  const wins = trades.filter(t => pnlOf(t) > 0)
  const losses = trades.filter(t => pnlOf(t) < 0)
  const net = trades.reduce((sum, t) => sum + pnlOf(t), 0)
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

export function tickerOf(symbol: string) {
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
