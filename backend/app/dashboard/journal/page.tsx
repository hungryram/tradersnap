"use client"

import { useEffect, useMemo, useState } from "react"
import { formatDay, loadTrades, pnlOf, startOfLocalDay, summarize, tickerOf, type Trade } from "@/lib/dashboard-data"
import { Card, Loading, Notice, PageHeader, Stat, money } from "../components/ui"
import TradeTable from "../components/TradeTable"

const RANGES = [7, 30, 90] as const
const REENTRY_MINUTES = 15

export default function JournalPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setTrades(null)
    loadTrades(startOfLocalDay(days - 1), 1000).then(setTrades).catch(err => setError(err.message))
  }, [days])

  const view = useMemo(() => (trades ? analyze(trades) : null), [trades])

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="Every trade Snapchart detected, and what the numbers say about your habits."
        actions={
          <div className="inline-flex rounded-lg border border-ink-border p-1">
            {RANGES.map(range => (
              <button
                key={range}
                onClick={() => setDays(range)}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${days === range ? "bg-ink-elevated text-ink-body" : "text-ink-text hover:text-ink-body"}`}
              >
                {range}d
              </button>
            ))}
          </div>
        }
      />

      {error && <Notice tone="bad">Couldn't load trades: {error}</Notice>}
      {!error && (!trades || !view) && <Loading />}

      {trades && view && trades.length === 0 && (
        <Card>
          <div className="py-10 text-center">
            <p className="text-ink-body">No trades in the last {days} days.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-text">
              In the Snapchart chat on TradingView, open the ⋮ menu and turn on <span className="text-ink-body">Auto-detect trades</span>. Keep the trading panel open while you trade (it can be small), and your trades land here automatically.
            </p>
          </div>
        </Card>
      )}

      {trades && view && trades.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Net P&L" value={money(view.stats.net)} tone={view.stats.net > 0 ? "good" : view.stats.net < 0 ? "bad" : "default"} hint={`${view.stats.count} trades`} />
            <Stat label="Win rate" value={view.stats.winRate !== null ? `${Math.round(view.stats.winRate * 100)}%` : "—"} hint={`${view.stats.wins}W · ${view.stats.losses}L`} />
            <Stat
              label="Avg win / avg loss"
              value={<span className="text-lg">{view.stats.avgWin !== null ? money(view.stats.avgWin) : "—"} <span className="text-ink-muted">/</span> {view.stats.avgLoss !== null ? money(view.stats.avgLoss) : "—"}</span>}
              hint={view.stats.avgWin !== null && view.stats.avgLoss !== null ? `${(view.stats.avgWin / Math.abs(view.stats.avgLoss)).toFixed(2)} : 1` : undefined}
            />
            <Stat label="Profit factor" value={view.stats.profitFactor !== null ? view.stats.profitFactor.toFixed(2) : "—"} hint="Gross wins ÷ gross losses" />
          </div>

          {view.reentry.count > 0 && (
            <Card title="After a loss">
              <p className="text-sm text-ink-text">
                You took <span className="text-ink-body font-medium">{view.reentry.count}</span> {view.reentry.count === 1 ? "trade" : "trades"} within {REENTRY_MINUTES} minutes of closing a loss.
                {" "}They made <span className={view.reentry.net >= 0 ? "text-green-400" : "text-red-400"}>{money(view.reentry.net)}</span>
                {view.reentry.winRate !== null && <> with a {Math.round(view.reentry.winRate * 100)}% win rate</>},
                {" "}compared with {view.rest.winRate !== null ? `${Math.round(view.rest.winRate * 100)}%` : "—"} on your other trades.
              </p>
              {view.reentry.winRate !== null && view.rest.winRate !== null && view.reentry.winRate < view.rest.winRate && (
                <p className="mt-2 text-sm text-amber-200">Quick re-entries after a loss are costing you. A short break after each loss is worth trying.</p>
              )}
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="P&L by day">
              <BarList rows={view.byDay} empty="No trading days" />
            </Card>
            <Card title="P&L by hour">
              <BarList rows={view.byHour} empty="—" />
            </Card>
          </div>

          {view.bySymbol.length > 1 && (
            <Card title="By symbol">
              <BarList rows={view.bySymbol} empty="—" />
            </Card>
          )}

          <Card title="Trades" action={trades.length > 25 && (
            <button onClick={() => setShowAll(!showAll)} className="text-sm text-blue-400 hover:text-blue-300">
              {showAll ? "Show fewer" : `Show all ${trades.length}`}
            </button>
          )}>
            <TradeTable trades={showAll ? trades : trades.slice(0, 25)} showDate />
          </Card>
        </div>
      )}
    </>
  )
}

type Row = { label: string; value: number; detail: string }

function analyze(trades: Trade[]) {
  const group = (keyOf: (t: Trade) => string, order: (a: string, b: string) => number) => {
    const groups = new Map<string, Trade[]>()
    for (const t of trades) {
      const key = keyOf(t)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(t)
    }
    return [...groups.entries()].sort(([a], [b]) => order(a, b)).map(([key, list]) => ({ key, list }))
  }
  const toRow = (label: string, list: Trade[]): Row => {
    const s = summarize(list)
    return { label, value: s.net, detail: `${s.count} ${s.count === 1 ? "trade" : "trades"}${s.winRate !== null ? ` · ${Math.round(s.winRate * 100)}%` : ""}` }
  }

  const dayKey = (t: Trade) => {
    const d = new Date(t.closed_at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  const byDay = group(dayKey, (a, b) => b.localeCompare(a))
    .map(({ key, list }) => toRow(formatDay(new Date(`${key}T12:00:00`)), list))

  // Hour the trade was opened (closed if the open time is unknown)
  const byHour = group(t => String(new Date(t.opened_at ?? t.closed_at).getHours()).padStart(2, "0"), (a, b) => a.localeCompare(b))
    .map(({ key, list }) => toRow(new Date(2000, 0, 1, Number(key)).toLocaleTimeString("en-US", { hour: "numeric" }), list))

  const bySymbol = group(t => tickerOf(t.symbol), (a, b) => a.localeCompare(b))
    .map(({ key, list }) => toRow(key, list))
    .sort((a, b) => a.value - b.value)

  // Trades opened soon after a losing trade closed (oldest first to walk in order)
  const chronological = [...trades].sort((a, b) => a.closed_at.localeCompare(b.closed_at))
  const reentries: Trade[] = []
  const rest: Trade[] = []
  chronological.forEach((t, i) => {
    const previous = chronological[i - 1]
    const opened = Date.parse(t.opened_at ?? t.closed_at)
    const quick = previous && pnlOf(previous) < 0 && opened - Date.parse(previous.closed_at) <= REENTRY_MINUTES * 60_000 && opened >= Date.parse(previous.closed_at) - 1000
    ;(quick ? reentries : rest).push(t)
  })

  return { stats: summarize(trades), byDay, byHour, bySymbol, reentry: summarize(reentries), rest: summarize(rest) }
}

function BarList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 1)
  return (
    <ul className="space-y-2">
      {rows.map(row => (
        <li key={row.label} className="grid grid-cols-[5.5rem_1fr_5.5rem] items-center gap-3 text-sm">
          <span className="truncate text-ink-text">{row.label}</span>
          <span className="relative h-2 rounded-full bg-ink-elevated" title={row.detail}>
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${row.value >= 0 ? "bg-green-500" : "bg-red-500"}`}
              style={{ width: `${(Math.abs(row.value) / max) * 100}%` }}
            />
          </span>
          <span className={`text-right tabular-nums ${row.value > 0 ? "text-green-400" : row.value < 0 ? "text-red-400" : "text-ink-text"}`}>{money(row.value)}</span>
        </li>
      ))}
    </ul>
  )
}
