"use client"

import { useEffect, useMemo, useState } from "react"
import { api, forAccount, loadTradeWindow, pnlOf, realTrades, type StrategyOption, type Trade, type TradingLimits } from "@/lib/dashboard-data"
import { brokenRules, dayKeyOf, hasLimits } from "@/lib/discipline"
import { Card, buttonPrimary, inputClass, money } from "./ui"
import TradeTable from "./TradeTable"
import DayReview from "./DayReview"

type ColorBy = "discipline" | "pnl"
type Day = { key: string; date: Date; trades: Trade[]; net: number; broken: string[]; locked: boolean; future: boolean }

// Notes for a month: day (YYYY-MM-DD) -> text
async function loadMonthNotes(from: string, to: string, today: string): Promise<Record<string, string>> {
  const data = await api<{ notes: { day: string; text: string }[] }>(`/api/journal-notes?from=${from}&to=${to}&today=${today}`)
  return Object.fromEntries((data.notes ?? []).map(n => [n.day, n.text]))
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// Month calendar of trading days: trades and P&L per day, plus whether the day's
// rules were kept. Colors by discipline by default; P&L is one click away.
export default function JournalCalendar({ limits, strategies, onStrategyChange, account = "", load = loadTradeWindow, loadNotes = loadMonthNotes }: {
  limits: TradingLimits | null
  // Show one account's trades ("" = all of them)
  account?: string
  strategies: StrategyOption[]
  onStrategyChange: (tradeId: string, strategyId: string | null) => void
  // Where a month's trades and notes come from (replaceable for previews)
  load?: typeof loadTradeWindow
  loadNotes?: typeof loadMonthNotes
}) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [data, setData] = useState<{ trades: Trade[]; historyFrom: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [colorBy, setColorBy] = useState<ColorBy>(() => {
    try { return (localStorage.getItem("journal_color_by") as ColorBy) || "discipline" } catch { return "discipline" }
  })
  const tracksRules = hasLimits(limits)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState("")
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved" | string>("idle")

  useEffect(() => {
    setData(null)
    setSelected(null)
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    load(month, next).then(setData).catch(err => setError(err instanceof Error ? err.message : "Couldn't load trades"))
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    loadNotes(dayKeyOf(month.toISOString()), dayKeyOf(last.toISOString()), dayKeyOf(new Date().toISOString())).then(setNotes).catch(() => setNotes({}))
  }, [month])

  // Opening a day loads its note into the editor
  useEffect(() => {
    setDraft(selected ? notes[selected] ?? "" : "")
    setNoteState("idle")
  }, [selected])

  async function saveNote() {
    if (!selected) return
    setNoteState("saving")
    try {
      await api("/api/journal-notes", { method: "PUT", body: JSON.stringify({ day: selected, text: draft, today: dayKeyOf(new Date().toISOString()) }) })
      setNotes(n => { const next = { ...n }; if (draft.trim()) next[selected] = draft.trim(); else delete next[selected]; return next })
      setNoteState("saved")
    } catch (err) {
      setNoteState(err instanceof Error ? err.message : "Couldn't save the note.")
    }
  }

  const pickColor = (value: ColorBy) => {
    setColorBy(value)
    try { localStorage.setItem("journal_color_by", value) } catch {}
  }

  const { weeks, totals } = useMemo(() => {
    const byDay = new Map<string, Trade[]>()
    for (const t of forAccount(data?.trades ?? [], account)) {
      const key = dayKeyOf(t.closed_at)
      byDay.set(key, [...(byDay.get(key) ?? []), t])
    }
    const lockedBefore = data?.historyFrom ? Date.parse(data.historyFrom) : null
    const first = new Date(month)
    first.setDate(1 - first.getDay())
    const weeks: Day[][] = []
    const cursor = new Date(first)
    while (weeks.length < 6) {
      const week: Day[] = []
      for (let i = 0; i < 7; i++) {
        const date = new Date(cursor)
        const key = dayKeyOf(date.toISOString())
        const trades = date.getMonth() === month.getMonth() ? byDay.get(key) ?? [] : []
        const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
        week.push({
          key, date, trades,
          net: trades.reduce((s, t) => s + pnlOf(t), 0),
          broken: brokenRules(trades, limits),
          locked: lockedBefore !== null && endOfDay <= lockedBefore,
          future: date.getTime() > Date.now()
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      if (week.some(d => d.date.getMonth() === month.getMonth())) weeks.push(week)
      else break
    }
    const tradingDays = weeks.flat().filter(d => d.trades.length > 0 && !d.locked)
    return {
      weeks,
      totals: {
        trades: tradingDays.reduce((s, d) => s + realTrades(d.trades).length, 0),
        net: tradingDays.reduce((s, d) => s + d.net, 0),
        days: tradingDays.length,
        keptDays: tradingDays.filter(d => d.broken.length === 0).length,
      }
    }
  }, [data, month, limits, account])

  const selectedDay = selected ? weeks.flat().find(d => d.key === selected) ?? null : null
  const today = dayKeyOf(new Date().toISOString())
  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() === month.getTime()
  const label = month.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md px-2 py-0.5 text-ink-text hover:bg-ink-elevated" aria-label="Previous month">‹</button>
          <span className="min-w-[9rem] text-center">{label}</span>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} disabled={thisMonth} className="rounded-md px-2 py-0.5 text-ink-text hover:bg-ink-elevated disabled:opacity-30" aria-label="Next month">›</button>
        </div>
      }
      action={
        <div className="inline-flex rounded-lg border border-ink-border p-0.5 text-xs">
          {(["discipline", "pnl"] as const).map(value => (
            <button key={value} onClick={() => pickColor(value)} className={`rounded-md px-2.5 py-1 ${colorBy === value ? "bg-ink-elevated text-ink-body" : "text-ink-text hover:text-ink-body"}`}>
              {value === "discipline" ? "Rules kept" : "P&L"}
            </button>
          ))}
        </div>
      }
    >
      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-ink-text">{totals.trades} trades</span>
        <span className={totals.net > 0 ? "text-green-400" : totals.net < 0 ? "text-red-400" : "text-ink-text"}>{money(totals.net)}</span>
        {tracksRules
          ? <span className="text-ink-body">Rules kept on <span className="font-semibold text-brand-300">{totals.keptDays} of {totals.days}</span> trading days</span>
          : <a href="/dashboard/rules#limits" className="text-brand-300 hover:text-brand-200">Set daily limits to track rule-kept days</a>}
      </div>

      {data?.historyFrom && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm">
          <span className="text-ink-body">The Free plan keeps your last 7 days. Pro keeps your full history, so you can see your patterns over months.</span>
          <a href="/dashboard/account#plans" className="font-medium text-brand-300 hover:text-brand-200">See Pro</a>
        </div>
      )}

      <div className={`-mx-1 overflow-x-auto ${!data ? "opacity-50" : ""}`}>
        <div className="grid min-w-[640px] grid-cols-[repeat(7,minmax(0,1fr))_5.5rem] gap-1 px-1">
          {WEEKDAYS.map(d => <div key={d} className="pb-1 text-center text-[11px] text-ink-muted">{d}</div>)}
          <div className="pb-1 text-center text-[11px] text-ink-muted">Week</div>

          {weeks.map((week, w) => {
            const weekTrades = week.filter(d => !d.locked).flatMap(d => d.trades)
            const weekNet = weekTrades.reduce((s, t) => s + pnlOf(t), 0)
            return [
              ...week.map(day => {
                const inMonth = day.date.getMonth() === month.getMonth()
                const traded = day.trades.length > 0
                const openable = inMonth && !day.locked && !day.future
                const hasNote = !!notes[day.key]
                const tone = !traded || day.locked ? "border-ink-border/60 bg-transparent"
                  : colorBy === "pnl"
                    ? day.net > 0 ? "border-green-500/30 bg-green-500/10" : day.net < 0 ? "border-red-500/30 bg-red-500/10" : "border-ink-border bg-ink-elevated/40"
                    : !tracksRules ? "border-ink-border bg-ink-elevated/40"
                    : day.broken.length ? "border-amber-500/40 bg-amber-500/10" : "border-brand-500/40 bg-brand-500/10"
                return (
                  <button
                    key={day.key}
                    onClick={() => openable && setSelected(selected === day.key ? null : day.key)}
                    disabled={!openable}
                    className={`relative h-20 rounded-lg border p-1.5 text-left transition-colors ${tone} ${!inMonth ? "invisible" : ""} ${selected === day.key ? "ring-2 ring-brand-400" : ""} ${openable ? "hover:border-ink-muted" : "cursor-default"}`}
                  >
                    <span className={`absolute left-1.5 top-1.5 text-[11px] leading-4 ${day.key === today ? "rounded bg-brand-500 px-1 font-semibold text-ink-bg" : "text-ink-muted"}`}>{day.date.getDate()}</span>
                    {day.locked ? (
                      <span className="absolute inset-0 flex items-center justify-center text-ink-muted" title="Pro keeps your full history">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                      </span>
                    ) : (traded || hasNote) && (
                      <>
                        {hasNote && (
                          <span className={`absolute top-1.5 text-ink-muted ${tracksRules && traded ? "right-6" : "right-1.5"}`} title="You wrote a note">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 4h16v12H8l-4 4z" /></svg>
                          </span>
                        )}
                        {tracksRules && traded && (
                          <span className="absolute right-1.5 top-1.5" title={day.broken.length ? day.broken.join("\n") : "No rules broken"}>
                            {day.broken.length
                              ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-ink-bg">{day.broken.length}</span>
                              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand-300" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                          </span>
                        )}
                        {traded && <span className="absolute bottom-1.5 left-1.5 right-1.5">
                          <span className="block text-[11px] text-ink-text">{realTrades(day.trades).length} {realTrades(day.trades).length === 1 ? "trade" : "trades"}</span>
                          <span className={`block text-xs font-medium tabular-nums ${day.net > 0 ? "text-green-400" : day.net < 0 ? "text-red-400" : "text-ink-text"}`}>{money(day.net)}</span>
                        </span>}
                      </>
                    )}
                  </button>
                )
              }),
              <div key={`week-${w}`} className="flex h-20 flex-col justify-center rounded-lg bg-ink-elevated/40 px-2 text-right">
                {weekTrades.length > 0 ? (
                  <>
                    <span className="text-[11px] text-ink-muted">{realTrades(weekTrades).length} trades</span>
                    <span className={`text-xs font-medium tabular-nums ${weekNet > 0 ? "text-green-400" : weekNet < 0 ? "text-red-400" : "text-ink-text"}`}>{money(weekNet)}</span>
                  </>
                ) : <span className="text-[11px] text-ink-muted">—</span>}
              </div>
            ]
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="mt-5 border-t border-ink-border pt-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">{selectedDay.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h3>
            {selectedDay.trades.length > 0 && <span className="text-sm text-ink-text">{realTrades(selectedDay.trades).length} trades · <span className={selectedDay.net >= 0 ? "text-green-400" : "text-red-400"}>{money(selectedDay.net)}</span></span>}
          </div>
          {selectedDay.trades.length > 0 && tracksRules && (
            selectedDay.broken.length
              ? <ul className="mb-4 space-y-1 text-sm text-amber-200">{selectedDay.broken.map(b => <li key={b}>• {b}</li>)}</ul>
              : <p className="mb-4 text-sm text-brand-300">No rules broken. That&apos;s the win.</p>
          )}
          {selectedDay.trades.length > 0
            ? <TradeTable trades={selectedDay.trades} strategies={strategies} onStrategyChange={onStrategyChange} />
            : <p className="mb-2 text-sm text-ink-muted">No trades this day.</p>}

          <div className="mt-5">
            <label className="mb-1.5 block text-xs text-ink-text">Your notes for the day</label>
            <textarea
              value={draft}
              onChange={e => { setDraft(e.target.value); setNoteState("idle") }}
              maxLength={4000}
              rows={4}
              placeholder="How did it go? What did you feel before your worst trade? What will you do differently tomorrow?"
              className={inputClass}
            />
            <div className="mt-2 flex items-center gap-3">
              <button onClick={saveNote} disabled={noteState === "saving" || draft === (notes[selectedDay.key] ?? "")} className={buttonPrimary}>
                {noteState === "saving" ? "Saving..." : "Save note"}
              </button>
              {noteState === "saved" && <span className="text-xs text-brand-300">Saved.</span>}
              {noteState !== "idle" && noteState !== "saving" && noteState !== "saved" && <span className="text-xs text-red-300">{noteState}</span>}
            </div>
          </div>
          <DayReview day={selectedDay.key} hasContent={selectedDay.trades.length > 0 || !!notes[selectedDay.key]} noteUnsaved={draft !== (notes[selectedDay.key] ?? "")} />
        </div>
      )}
    </Card>
  )
}
