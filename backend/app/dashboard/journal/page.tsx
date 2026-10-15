"use client"

import { useEffect, useMemo, useState } from "react"
import { accountLabel, accountsOf, api, forAccount, formatDay, loadDayRule, loadStrategyOptions, loadTradeWindow, pnlOf, startOfLocalDay, summarize, tickerOf, type StrategyOption, type Trade, type TradingLimits } from "@/lib/dashboard-data"
import { Card, Loading, Notice, PageHeader, Stat, money } from "../components/ui"
import TradeTable from "../components/TradeTable"
import JournalCalendar from "../components/JournalCalendar"
import { tradingDayKey } from "@/lib/trading-day"

const RANGES = [7, 30, 90] as const
const REENTRY_MINUTES = 15

export default function JournalPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const [loaded, setLoaded] = useState<Trade[] | null>(null)
  // "" = every account. Traders with several accounts can look at one at a time.
  const [account, setAccount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [historyFrom, setHistoryFrom] = useState<string | null>(null)
  const [limits, setLimits] = useState<TradingLimits | null>(null)
  // When the trading day starts; undefined until it's known, so the first load already uses the right day
  const [dayRule, setDayRule] = useState<string | null | undefined>(undefined)
  // ?day=YYYY-MM-DD opens the calendar on that day (links from the extension's "trade closed" rows)
  const [openDay] = useState(() => {
    const day = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("day") : null
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
  })
  const [strategies, setStrategies] = useState<StrategyOption[]>([])

  useEffect(() => {
    api("/api/me").then(me => setLimits(me.user?.trading_limits ?? null)).catch(() => {})
    loadStrategyOptions().then(setStrategies).catch(() => {})
    loadDayRule().then(setDayRule)
  }, [])

  useEffect(() => {
    if (dayRule === undefined) return
    setLoaded(null)
    loadTradeWindow(startOfLocalDay(days - 1, dayRule), null)
      .then(({ trades, historyFrom }) => { setLoaded(trades); setHistoryFrom(historyFrom) })
      .catch(err => setError(err.message))
  }, [days, dayRule])

  const accounts = useMemo(() => (loaded ? accountsOf(loaded) : []), [loaded])
  const trades = useMemo(() => (loaded ? forAccount(loaded, account) : null), [loaded, account])
  const view = useMemo(() => (trades ? analyze(trades, strategies, dayRule) : null), [trades, strategies, dayRule])

  // Tag a trade with a strategy (or clear it); the table shows the choice right away
  const setStrategy = (tradeId: string, strategyId: string | null) => {
    setLoaded(list => list && list.map(t => t.id === tradeId ? { ...t, strategy_id: strategyId, strategy_source: strategyId ? "user" : null } : t))
    api("/api/trades", { method: "PATCH", body: JSON.stringify({ id: tradeId, strategy_id: strategyId }) }).catch(() => {})
  }

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="Every trade Pip detected, which rules you kept, and what the numbers say about your habits."
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

      {accounts.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="account-filter" className="text-ink-muted">Account</label>
          <select
            id="account-filter"
            value={account}
            onChange={e => setAccount(e.target.value)}
            className="rounded-md border border-ink-border bg-ink-bg px-2 py-1 text-ink-body"
          >
            <option value="">All accounts ({accounts.length})</option>
            {accounts.map(a => <option key={a} value={a}>{accountLabel(a)}</option>)}
          </select>
          {!account && <span className="text-xs text-ink-muted">A trade copied to several accounts counts as one trade; profit and loss adds up every account.</span>}
        </div>
      )}

      <div className="mb-6">
        <JournalCalendar openDay={openDay} dayRule={dayRule ?? null} limits={limits} strategies={strategies} onStrategyChange={setStrategy} account={account} />
      </div>

      {historyFrom && days > 7 && (
        <div className="mb-6">
          <Notice tone="info">
            Showing your last 7 days. Older days are saved, not deleted, and the Free plan just shows a week;{" "}
            <a href="/dashboard/account#plans" className="underline">Pro shows all of it</a>, so your stats cover months, not days.
          </Notice>
        </div>
      )}
      {!error && (!trades || !view) && <Loading />}

      {trades && view && trades.length === 0 && (
        <Card>
          <div className="py-10 text-center">
            <p className="text-ink-body">No trades in the last {days} days.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-text">
              In the Pip chat on TradingView, Tradovate or TopstepX, open the ⋮ menu and turn on <span className="text-ink-body">Auto-detect trades</span>. On TradingView keep the trading panel open while you trade (it can be small). Your trades land here automatically.
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

          {view.checkedFirst.count > 0 && view.notChecked.count > 0 && (
            <Card title="Checked first vs not">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: "Checked with Pip first", s: view.checkedFirst, tone: "text-brand-300" },
                  { label: "No chart check first", s: view.notChecked, tone: "text-ink-text" },
                ].map(({ label, s, tone }) => (
                  <div key={label} className="rounded-xl border border-ink-border p-4">
                    <p className={`text-sm font-medium ${tone}`}>{label}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{s.winRate !== null ? `${Math.round(s.winRate * 100)}%` : "—"} <span className="text-sm font-normal text-ink-muted">winners</span></p>
                    <p className="mt-1 text-sm text-ink-text">{s.count} trades · <span className={s.net >= 0 ? "text-green-400" : "text-red-400"}>{money(s.net)}</span></p>
                  </div>
                ))}
              </div>
              {view.checkedFirst.winRate !== null && view.notChecked.winRate !== null && view.checkedFirst.winRate > view.notChecked.winRate && (
                <p className="mt-4 text-sm text-ink-body">
                  Your checked trades win {Math.round((view.checkedFirst.winRate - view.notChecked.winRate) * 100)} points more often. That&apos;s the case for checking every setup, in your own numbers.
                </p>
              )}
            </Card>
          )}

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

          {view.byStrategy.length > 0 && (
            <Card title="By strategy">
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted">
                      <th className="px-5 pb-2 font-normal sm:px-6">Strategy</th>
                      <th className="pb-2 text-right font-normal">Trades</th>
                      <th className="pb-2 text-right font-normal">Win rate</th>
                      <th className="pb-2 text-right font-normal">Avg win / loss</th>
                      <th className="px-5 pb-2 text-right font-normal sm:px-6">Net</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {view.byStrategy.map(row => (
                      <tr key={row.name} className="border-t border-ink-border/70">
                        <td className={`px-5 py-2.5 sm:px-6 ${row.untagged ? "text-ink-muted" : "font-medium"}`}>{row.name}</td>
                        <td className="py-2.5 text-right">{row.stats.count}</td>
                        <td className="py-2.5 text-right">{row.stats.winRate !== null ? `${Math.round(row.stats.winRate * 100)}%` : "—"}</td>
                        <td className="py-2.5 text-right text-ink-text">{row.stats.avgWin !== null ? money(row.stats.avgWin) : "—"} / {row.stats.avgLoss !== null ? money(row.stats.avgLoss) : "—"}</td>
                        <td className={`px-5 py-2.5 text-right font-medium sm:px-6 ${row.stats.net > 0 ? "text-green-400" : row.stats.net < 0 ? "text-red-400" : "text-ink-text"}`}>{money(row.stats.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Trades are tagged with the strategy Pip matched in your chart check right before them. Fix or add a tag in the Strategy column below.
              </p>
            </Card>
          )}

          {view.bySymbol.length > 1 && (
            <Card title="By symbol">
              <BarList rows={view.bySymbol} empty="—" />
            </Card>
          )}

          <Card title="Trades" action={trades.length > 25 && (
            <button onClick={() => setShowAll(!showAll)} className="text-sm text-brand-300 hover:text-brand-200">
              {showAll ? "Show fewer" : `Show all ${trades.length}`}
            </button>
          )}>
            <TradeTable trades={showAll ? trades : trades.slice(0, 25)} showDate strategies={strategies} onStrategyChange={setStrategy} />
          </Card>
        </div>
      )}
    </>
  )
}

type Row = { label: string; value: number; detail: string }

function analyze(allTrades: Trade[], strategies: StrategyOption[], dayRule?: string | null) {
  // Day-total entries count in net P&L (the headline stats) but are not trades, so they stay out of every breakdown
  const trades = allTrades.filter(t => t.kind !== "day_total")
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

  const dayKey = (t: Trade) => tradingDayKey(t.closed_at, dayRule)
  const byDay = group(dayKey, (a, b) => b.localeCompare(a))
    .map(({ key, list }) => toRow(formatDay(new Date(`${key}T12:00:00`)), list))

  // Hour the trade was opened (closed if the open time is unknown)
  const byHour = group(t => String(new Date(t.opened_at ?? t.closed_at).getHours()).padStart(2, "0"), (a, b) => a.localeCompare(b))
    .map(({ key, list }) => toRow(new Date(2000, 0, 1, Number(key)).toLocaleTimeString("en-US", { hour: "numeric" }), list))

  const bySymbol = group(t => tickerOf(t.symbol), (a, b) => a.localeCompare(b))
    .map(({ key, list }) => toRow(key, list))
    .sort((a, b) => a.value - b.value)

  // Trades opened soon after a losing trade closed (oldest first to walk in order)
  const chronological = [...trades].filter(t => !t.is_copy).sort((a, b) => a.closed_at.localeCompare(b.closed_at))
  const reentries: Trade[] = []
  const rest: Trade[] = []
  chronological.forEach((t, i) => {
    const previous = chronological[i - 1]
    const opened = Date.parse(t.opened_at ?? t.closed_at)
    const quick = previous && pnlOf(previous) < 0 && opened - Date.parse(previous.closed_at) <= REENTRY_MINUTES * 60_000 && opened >= Date.parse(previous.closed_at) - 1000
    ;(quick ? reentries : rest).push(t)
  })

  // Results per strategy (most trades first), untagged trades last
  const names = new Map(strategies.map(st => [st.id, st.name]))
  const byStrategy = strategies.length === 0 ? [] : [
    ...group(t => (t.strategy_id && names.has(t.strategy_id) ? t.strategy_id : ""), (a, b) => a.localeCompare(b))
      .filter(({ key }) => key)
      .map(({ key, list }) => ({ name: names.get(key)!, stats: summarize(list), untagged: false }))
      .sort((a, b) => b.stats.count - a.stats.count),
    ...(() => {
      const untagged = trades.filter(t => !t.strategy_id || !names.has(t.strategy_id))
      return untagged.length ? [{ name: "Untagged", stats: summarize(untagged), untagged: true }] : []
    })()
  ]
  // Only worth a card once at least one trade is tagged
  const anyTagged = byStrategy.some(row => !row.untagged)

  return {
    stats: summarize(allTrades), byDay, byHour, bySymbol, byStrategy: anyTagged ? byStrategy : [], reentry: summarize(reentries), rest: summarize(rest),
    checkedFirst: summarize(trades.filter(t => t.checked)),
    notChecked: summarize(trades.filter(t => t.checked === false)),
  }
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
