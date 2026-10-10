"use client"

import { useState } from "react"
import { api } from "@/lib/dashboard-data"
import { buttonPrimary, buttonSecondary } from "./ui"

export type Credits = { used: number; daily: number; bonus: number; percent: number; checksLeft: number; messagesLeft: number }

// Today's usage as one bar, translated into chart checks; buy more / upgrade when running low
export default function UsageMeter({ credits, plan, canBuyMore, compact = false }: { credits: Credits; plan: string; canBuyMore: boolean; compact?: boolean }) {
  const [buying, setBuying] = useState(false)
  const low = credits.percent >= 80
  const out = credits.percent >= 100 && credits.bonus <= 0
  const color = out ? "bg-red-500" : low ? "bg-amber-500" : "bg-blue-500"

  async function buyMore() {
    setBuying(true)
    try {
      const data = await api("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "topup" }) })
      window.location.href = data.url
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't start checkout.")
      setBuying(false)
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-text">Today</span>
        <span className="tabular-nums">{credits.percent}% used</span>
      </div>
      <div className="h-2 rounded-full bg-ink-elevated">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${credits.percent}%` }} />
      </div>
      <p className={`mt-2 text-xs ${out ? "text-red-300" : "text-ink-text"}`}>
        {out
          ? "You've used today's allowance. It resets at midnight UTC."
          : `About ${credits.checksLeft} chart ${credits.checksLeft === 1 ? "check" : "checks"} or ${credits.messagesLeft} messages left today.`}
      </p>
      {credits.bonus > 0 && (
        <p className="mt-1 text-xs text-ink-muted">Includes {credits.bonus} extra units you bought (used after the daily allowance, never expire).</p>
      )}
      {(low || !compact) && (canBuyMore || plan === "free") && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canBuyMore && <button onClick={buyMore} disabled={buying} className={buttonPrimary}>{buying ? "Loading..." : "Buy more"}</button>}
          {plan === "free" && <a href="/dashboard/account#plans" className={buttonSecondary}>Get Pro</a>}
        </div>
      )}
    </div>
  )
}
