"use client"

import { useState } from "react"
import { formatTime, holdTime, pnlOf, tickerOf, type StrategyOption, type Trade } from "@/lib/dashboard-data"
import { money } from "./ui"

export default function TradeTable({ trades, showDate = false, strategies, onStrategyChange }: {
  trades: Trade[]
  showDate?: boolean
  // When given, a Strategy column lets the trader tag (or fix) each trade's strategy
  strategies?: StrategyOption[]
  onStrategyChange?: (tradeId: string, strategyId: string | null) => void
}) {
  // Shown immediately; the parent saves it
  const [picked, setPicked] = useState<Record<string, string | null>>({})
  const showStrategy = !!strategies && strategies.length > 0 && !!onStrategyChange

  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className={`w-full text-sm ${showStrategy ? "min-w-[720px]" : "min-w-[560px]"}`}>
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th className="px-5 pb-2 font-normal sm:px-6">{showDate ? "Closed" : "Time"}</th>
            <th className="pb-2 font-normal">Symbol</th>
            <th className="pb-2 font-normal">Side</th>
            {showStrategy && <th className="pb-2 font-normal" title="Tagged from the chart check right before the trade, or by you">Strategy</th>}
            <th className="pb-2 font-normal text-right">Size</th>
            <th className="pb-2 font-normal text-right">Entry → Exit</th>
            <th className="pb-2 font-normal text-right">Held</th>
            <th className="px-5 pb-2 font-normal text-right sm:px-6">P&L</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(trade => {
            const pnl = pnlOf(trade)
            const strategyId = trade.id in picked ? picked[trade.id] : trade.strategy_id ?? null
            return (
              <tr key={trade.id} className="border-t border-ink-border/70">
                <td className="px-5 py-2.5 text-ink-text tabular-nums sm:px-6">
                  {showDate ? new Date(trade.closed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : formatTime(trade.closed_at)}
                </td>
                <td className="py-2.5 font-medium">{tickerOf(trade.symbol)}</td>
                <td className={`py-2.5 capitalize ${trade.side === "long" ? "text-brand-300" : "text-red-400"}`}>{trade.side}</td>
                {showStrategy && (
                  <td className="py-1.5 pr-3">
                    <select
                      value={strategyId ?? ""}
                      onChange={e => {
                        const value = e.target.value || null
                        setPicked(p => ({ ...p, [trade.id]: value }))
                        onStrategyChange!(trade.id, value)
                      }}
                      title={trade.strategy_source === "auto" && !(trade.id in picked) ? "Tagged from your chart check right before this trade" : undefined}
                      className={`max-w-[11rem] rounded-md border bg-ink-bg px-2 py-1 text-xs ${strategyId ? "border-ink-border text-ink-body" : "border-dashed border-ink-border text-ink-muted"}`}
                    >
                      <option value="">Untagged</option>
                      {strategies!.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                )}
                <td className="py-2.5 text-right tabular-nums">{trade.qty}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-text">
                  {fmtPrice(trade.entry_price)} → {fmtPrice(trade.exit_price)}
                </td>
                <td className="py-2.5 text-right text-ink-muted">{holdTime(trade) ?? "—"}</td>
                <td className={`px-5 py-2.5 text-right font-medium tabular-nums sm:px-6 ${pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : "text-ink-text"}`}>
                  {money(pnl)}{trade.pnl_source === "estimated" ? <span className="text-ink-muted" title="Estimated"> ~</span> : null}
                </td>
              </tr>
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
