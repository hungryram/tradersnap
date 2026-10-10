"use client"

import { formatTime, holdTime, pnlOf, tickerOf, type Trade } from "@/lib/dashboard-data"
import { money } from "./ui"

export default function TradeTable({ trades, showDate = false }: { trades: Trade[]; showDate?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th className="px-5 pb-2 font-normal sm:px-6">{showDate ? "Closed" : "Time"}</th>
            <th className="pb-2 font-normal">Symbol</th>
            <th className="pb-2 font-normal">Side</th>
            <th className="pb-2 font-normal text-right">Size</th>
            <th className="pb-2 font-normal text-right">Entry → Exit</th>
            <th className="pb-2 font-normal text-right">Held</th>
            <th className="px-5 pb-2 font-normal text-right sm:px-6">P&L</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(trade => {
            const pnl = pnlOf(trade)
            return (
              <tr key={trade.id} className="border-t border-ink-border/70">
                <td className="px-5 py-2.5 text-ink-text tabular-nums sm:px-6">
                  {showDate ? new Date(trade.closed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : formatTime(trade.closed_at)}
                </td>
                <td className="py-2.5 font-medium">{tickerOf(trade.symbol)}</td>
                <td className={`py-2.5 capitalize ${trade.side === "long" ? "text-brand-300" : "text-red-400"}`}>{trade.side}</td>
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

