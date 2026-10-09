"use client"

import { useEffect, useState } from "react"
import { api, loadTrades, startOfLocalDay, summarize, type Trade, type TradingLimits } from "@/lib/dashboard-data"
import { Card, Loading, Notice, PageHeader, Stat, buttonPrimary, buttonSecondary, money } from "./components/ui"
import TradeTable from "./components/TradeTable"

type Me = {
  user: { first_name: string | null; plan: string; trading_limits: TradingLimits | null }
  ruleset: { id: string; name: string } | null
  usage: { messages: { used: number; limit: number }; screenshots: { used: number; limit: number } }
}

export default function TodayPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api<Me>("/api/me"), loadTrades(startOfLocalDay())])
      .then(([meData, tradeData]) => { setMe(meData); setTrades(tradeData) })
      .catch(err => setError(err.message))
  }, [])

  if (error) return <Notice tone="bad">Couldn't load your dashboard: {error}</Notice>
  if (!me || !trades) return <Loading />

  const stats = summarize(trades)
  const limits = me.user.trading_limits
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  return (
    <>
      <PageHeader
        title={`${greeting}${me.user.first_name ? `, ${me.user.first_name}` : ""}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        actions={<a href="https://www.tradingview.com/chart/" target="_blank" rel="noopener noreferrer" className={buttonPrimary}>Open TradingView</a>}
      />

      {!me.ruleset && (
        <div className="mb-6">
          <Notice tone="warn">
            You haven't set up your trading rules yet. Your coach needs them to check your charts.{" "}
            <a href="/onboarding" className="underline font-medium">Set up your rules</a>
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Trades today"
          value={limits?.max_trades_per_day ? `${stats.count} / ${limits.max_trades_per_day}` : stats.count}
          tone={limits?.max_trades_per_day && stats.count >= limits.max_trades_per_day ? "warn" : "default"}
        />
        <Stat label="Net P&L" value={stats.count ? money(stats.net) : "—"} tone={stats.net > 0 ? "good" : stats.net < 0 ? "bad" : "default"} />
        <Stat label="Wins / losses" value={stats.count ? `${stats.wins} / ${stats.losses}` : "—"} hint={stats.winRate !== null ? `${Math.round(stats.winRate * 100)}% win rate` : undefined} />
        <Stat
          label="Losing streak"
          value={stats.lossStreak}
          tone={limits?.stop_after_losses && stats.lossStreak >= limits.stop_after_losses ? "bad" : stats.lossStreak >= 2 ? "warn" : "default"}
          hint={stats.lossStreak >= 2 ? "Consider a break" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Today's trades" action={<a href="/dashboard/journal" className="text-sm text-blue-400 hover:text-blue-300">Journal</a>}>
            {trades.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-ink-text">No trades recorded today.</p>
                <p className="mt-1 text-xs text-ink-muted max-w-sm mx-auto">
                  Turn on <span className="text-ink-text">Auto-detect trades</span> in the Snapchart chat (⋮ menu) and keep TradingView's trading panel open. Trades show up here as they close.
                </p>
              </div>
            ) : (
              <TradeTable trades={trades} />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Your limits" action={<a href="/dashboard/rules#limits" className="text-sm text-blue-400 hover:text-blue-300">Edit</a>}>
            {limits && (limits.max_trades_per_day || limits.stop_after_losses || limits.max_daily_loss || limits.session_start) ? (
              <div className="space-y-4">
                {limits.max_trades_per_day ? <LimitBar label="Trades" used={stats.count} max={limits.max_trades_per_day} /> : null}
                {limits.stop_after_losses ? <LimitBar label="Losses in a row" used={stats.lossStreak} max={limits.stop_after_losses} /> : null}
                {limits.max_daily_loss ? <LimitBar label="Daily loss" used={Math.max(0, -stats.net)} max={limits.max_daily_loss} format={v => `$${v.toFixed(0)}`} /> : null}
                {limits.session_start && limits.session_end ? <SessionWindow start={limits.session_start} end={limits.session_end} /> : null}
              </div>
            ) : (
              <p className="text-sm text-ink-text">
                No limits set. <a href="/dashboard/rules#limits" className="text-blue-400 hover:text-blue-300">Add a max trades or daily loss limit</a> and Snapchart will warn you when you hit it.
              </p>
            )}
          </Card>

          <Card title="Usage today">
            <div className="space-y-4">
              <LimitBar label="Coach messages" used={me.usage.messages.used} max={me.usage.messages.limit} neutral />
              <LimitBar label="Chart checks" used={me.usage.screenshots.used} max={me.usage.screenshots.limit} neutral />
            </div>
            {me.user.plan === "free" && (
              <a href="/dashboard/account#plans" className={`${buttonSecondary} mt-5 w-full`}>Get more with Pro</a>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function LimitBar({ label, used, max, format, neutral = false }: { label: string; used: number; max: number; format?: (v: number) => string; neutral?: boolean }) {
  const ratio = max > 0 ? Math.min(used / max, 1) : 0
  const color = neutral ? "bg-blue-500" : ratio >= 1 ? "bg-red-500" : ratio >= 0.66 ? "bg-amber-500" : "bg-green-500"
  const show = format ?? ((v: number) => String(v))
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-ink-text">{label}</span>
        <span className="tabular-nums">{show(used)} / {show(max)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-elevated">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${ratio * 100}%` }} />
      </div>
      {!neutral && ratio >= 1 && <p className="mt-1 text-xs text-red-300">Limit reached. Your rules say stop for the day.</p>}
    </div>
  )
}

function SessionWindow({ start, end }: { start: string; end: string }) {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  const inside = minutes >= toMinutes(start) && minutes < toMinutes(end)
  const label = (hhmm: string) => new Date(2000, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-text">Trading hours</span>
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${inside ? "bg-green-500" : "bg-ink-muted"}`} />
        {label(start)}–{label(end)}
      </span>
    </div>
  )
}
