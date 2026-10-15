"use client"

import { Fragment, useMemo, useState } from "react"
import { accountLabel, accountsOf, api, formatTime, holdTime, pnlOf, tickerOf, type StrategyOption, type Trade } from "@/lib/dashboard-data"
import { money } from "./ui"

// One row per trade decision. A trade copied to several accounts is one row with the combined result and an
// "×5 accounts" toggle that shows each account's copy. A position far above the usual size is flagged.
export default function TradeTable({ trades, showDate = false, strategies, onStrategyChange, bleed = true }: {
  trades: Trade[]
  showDate?: boolean
  // When given, a Strategy column lets the trader tag (or fix) each trade's strategy
  strategies?: StrategyOption[]
  onStrategyChange?: (tradeId: string, strategyId: string | null) => void
  // Stretch to the card's edges (off when the table sits in a column next to something else)
  bleed?: boolean
}) {
  // Shown immediately; the parent saves it
  const [picked, setPicked] = useState<Record<string, string | null>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const showStrategy = !!strategies && strategies.length > 0 && !!onStrategyChange
  // Which account each trade is on, when there's more than one
  const showAccount = accountsOf(trades).length > 1

  // Decisions in the order given, each with the copies on other accounts
  const rows = useMemo(() => {
    const byGroup = new Map<string, Trade[]>()
    for (const t of trades) if (t.group_of) byGroup.set(t.group_of, [...(byGroup.get(t.group_of) ?? []), t])
    const seen = new Set<string>()
    const out: { lead: Trade; copies: Trade[] }[] = []
    for (const t of trades) {
      if (t.group_of) {
        if (seen.has(t.group_of)) continue
        seen.add(t.group_of)
        const members = byGroup.get(t.group_of)!
        const lead = members.find(m => !m.is_copy) ?? members[0]
        out.push({ lead, copies: members.filter(m => m !== lead) })
      } else {
        out.push({ lead: t, copies: [] })
      }
    }
    return out
  }, [trades])

  // The usual position size here (per account), to flag one that's far bigger
  const usualSize = useMemo(() => {
    const sizes = rows.filter(r => r.lead.source !== "manual" && r.lead.kind !== "day_total").map(r => Math.abs(Number(r.lead.qty ?? 0))).filter(q => q > 0).sort((a, b) => a - b)
    return sizes.length >= 3 ? sizes[Math.floor((sizes.length - 1) / 2)] : 0
  }, [rows])

  // Only results the trader logged by hand can be removed; the page reloads so every total matches
  const removeManual = async (id: string) => {
    if (!window.confirm("Remove this logged result from your journal?")) return
    try {
      await api("/api/trades", { method: "DELETE", body: JSON.stringify({ id }) })
      window.location.reload()
    } catch {
      window.alert("Couldn't remove that one. Try again.")
    }
  }

  const edge = bleed ? "px-5 sm:px-6" : "px-3"
  const pnlTone = (v: number) => (v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-ink-text")

  const strategyCell = (trade: Trade, group: Trade[]) => {
    const strategyId = trade.id in picked ? picked[trade.id] : trade.strategy_id ?? null
    return (
      <td className="py-1.5 pl-3 pr-3">
        <select
          value={strategyId ?? ""}
          onChange={e => {
            const value = e.target.value || null
            // A copied trade is one decision: tag every account's copy
            setPicked(p => ({ ...p, ...Object.fromEntries(group.map(t => [t.id, value])) }))
            for (const t of group) onStrategyChange!(t.id, value)
          }}
          title={trade.strategy_source === "auto" && !(trade.id in picked) ? "Tagged from your chart check right before this trade" : undefined}
          className={`max-w-[9rem] rounded-md border bg-ink-bg px-2 py-1 text-xs ${strategyId ? "border-ink-border text-ink-body" : "border-dashed border-ink-border text-ink-muted"}`}
        >
          <option value="">Untagged</option>
          {strategies!.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
    )
  }

  return (
    <div className={`${bleed ? "-mx-5 sm:-mx-6" : ""} overflow-x-auto`}>
      <table className="w-full whitespace-nowrap text-sm">
        <thead>
          {/* What matters most comes first (time, trade, size, result), so a narrow screen cuts the details, not the P&L */}
          <tr className="text-left text-xs text-ink-muted">
            <th className={`${edge} pb-2 font-normal`}>{showDate ? "Closed" : "Time"}</th>
            <th className="pb-2 font-normal">Trade</th>
            <th className="pb-2 pl-3 font-normal text-right" title="Contracts or shares, per account">Size</th>
            <th className="pb-2 pl-4 font-normal text-right">P&L</th>
            {showAccount && <th className="pb-2 pl-5 font-normal">Account</th>}
            {showStrategy && <th className="pb-2 pl-3 font-normal" title="Tagged from the chart check right before the trade, or by you">Strategy</th>}
            <th className="pb-2 pl-3 font-normal text-right">Entry → Exit</th>
            <th className={`${edge} pb-2 font-normal text-right`}>Held</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lead: trade, copies }) => {
            const group = [trade, ...copies]
            const isGroup = copies.length > 0
            const expanded = !!open[trade.id]
            const pnl = isGroup ? group.reduce((s, t) => s + pnlOf(t), 0) : pnlOf(trade)
            const size = Math.abs(Number(trade.qty ?? 0))
            const timesUsual = usualSize && size >= 2 * usualSize ? size / usualSize : 0
            return (
              <Fragment key={trade.id}>
                <tr className="border-t border-ink-border/70">
                  <td className={`${edge} py-2.5 text-ink-text tabular-nums`}>
                    {showDate ? new Date(trade.closed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : formatTime(trade.closed_at)}
                  </td>
                  <td className="py-2.5 pr-2">
                    <span className="font-medium">{tickerOf(trade.symbol)}</span>
                    {trade.side && <span className={`ml-2 text-xs capitalize ${trade.side === "long" ? "text-brand-300" : "text-red-400"}`}>{trade.side}</span>}
                    {trade.source === "manual" && (trade.kind === "day_total"
                      ? <span className="ml-2 rounded-full border border-ink-border px-1.5 py-0.5 text-[10px] text-ink-muted" title="An adjustment so your day matches the total you told Pip. It counts in P&L, not as a trade.">day total</span>
                      : <span className="ml-2 rounded-full border border-ink-border px-1.5 py-0.5 text-[10px] text-ink-muted" title="You told Pip about this one, so it has no entry or exit">manual</span>)}
                    {trade.source === "manual" && <button onClick={() => removeManual(trade.id)} className="ml-1.5 text-xs text-ink-muted hover:text-red-400" title="Remove this logged result" aria-label="Remove this logged result">✕</button>}
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">
                    {timesUsual > 0 && (
                      <span className="mr-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300" title={`About ${timesUsual >= 10 ? Math.round(timesUsual) : timesUsual.toFixed(1)}x your usual size here (${usualSize})`}>
                        {timesUsual >= 10 ? Math.round(timesUsual) : timesUsual.toFixed(1)}x
                      </span>
                    )}
                    <span className={timesUsual > 0 ? "font-semibold text-amber-300" : ""}>{trade.qty ?? "—"}</span>
                  </td>
                  <td className={`py-2.5 pl-4 text-right font-medium tabular-nums ${pnlTone(pnl)}`}>
                    {money(pnl)}{trade.pnl_source === "estimated" ? <span className="text-ink-muted" title="Estimated"> ~</span> : null}
                    {isGroup && <span className="block text-[11px] font-normal text-ink-muted">{money(pnlOf(trade))} each</span>}
                  </td>
                  {showAccount && (
                    <td className="py-2.5 pl-5 pr-3 text-ink-text">
                      {isGroup ? (
                        <button
                          onClick={() => setOpen(o => ({ ...o, [trade.id]: !expanded }))}
                          aria-expanded={expanded}
                          className="inline-flex items-center gap-1 rounded-full border border-ink-border px-2 py-0.5 text-xs tabular-nums hover:border-ink-muted hover:text-ink-body"
                          title={`Copied to ${group.length} accounts: counts as one trade. Click to see each account.`}
                        >
                          ×{group.length} accounts <span aria-hidden>{expanded ? "▴" : "▾"}</span>
                        </button>
                      ) : (
                        <span className="block max-w-[9rem] truncate" title={trade.account ?? undefined}>{accountLabel(trade.account ?? null)}</span>
                      )}
                    </td>
                  )}
                  {showStrategy && strategyCell(trade, group)}
                  <td className="py-2.5 pl-3 text-right text-xs tabular-nums text-ink-text">
                    {fmtPrice(trade.entry_price)} → {fmtPrice(trade.exit_price)}
                  </td>
                  <td className={`${edge} py-2.5 text-right text-ink-muted`}>{holdTime(trade) ?? "—"}</td>
                </tr>
                {expanded && group.map(t => (
                  <tr key={`${trade.id}-${t.id}`} className="bg-ink-elevated/30 text-xs text-ink-text">
                    <td className={`${edge} py-1.5`} />
                    <td className="py-1.5" />
                    <td className="py-1.5 pl-3 text-right tabular-nums">{t.qty ?? "—"}</td>
                    <td className={`py-1.5 pl-4 text-right tabular-nums ${pnlTone(pnlOf(t))}`}>{money(pnlOf(t))}</td>
                    <td className="max-w-[10rem] truncate py-1.5 pl-5 pr-3" title={t.account ?? undefined}>{accountLabel(t.account ?? null)}</td>
                    {showStrategy && <td />}
                    <td className="py-1.5 pl-3 text-right tabular-nums">{fmtPrice(t.entry_price)} → {fmtPrice(t.exit_price)}</td>
                    <td className={`${edge} py-1.5 text-right text-ink-muted`}>{holdTime(t) ?? "—"}</td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function fmtPrice(value: number | null) {
  return value === null ? "?" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })
}
