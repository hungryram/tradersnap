"use client"

import { useState } from "react"
import { api } from "@/lib/dashboard-data"
import { Card, Notice, buttonPrimary, buttonSecondary } from "./ui"
import DayStartPicker, { dayStartOf, type DayStartChoice } from "./DayStartPicker"
import { DAY_START_CHOICES, dayRuleOf } from "@/lib/trading-day"

// What the trader told us at onboarding (markets, platforms, prop firm, experience), editable any time.
// Pip uses the experience answer to decide how much to explain.

export type TradingProfile = {
  markets: string[]
  platforms: string[]
  prop_firm: boolean
  experience?: "new" | "1-3" | "3+"
  day_start?: string
} | null

const MARKETS = [
  { id: "futures", label: "Futures" }, { id: "stocks", label: "Stocks" }, { id: "options", label: "Options" },
  { id: "forex", label: "Forex" }, { id: "crypto", label: "Crypto" }
]
const PLATFORMS = [
  { id: "tradingview", label: "TradingView" }, { id: "tradovate", label: "Tradovate" }, { id: "topstepx", label: "TopstepX" },
  { id: "ninjatrader", label: "NinjaTrader" }, { id: "other", label: "Something else" }
]
const EXPERIENCE = [
  { id: "new", label: "Less than a year" }, { id: "1-3", label: "1–3 years" }, { id: "3+", label: "3+ years" }
] as const

const labelOf = (list: { id: string; label: string }[], ids: string[]) => ids.map(id => list.find(item => item.id === id)?.label ?? id).join(", ")
const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value])
const chip = (active: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-sm transition-colors ${active ? "border-brand-500 bg-brand-500/15 text-ink-body" : "border-ink-border bg-ink-surface text-ink-text hover:border-ink-muted"}`

export default function TradingProfileCard({ profile, onSaved }: { profile: TradingProfile; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [markets, setMarkets] = useState<string[]>(profile?.markets ?? [])
  const [platforms, setPlatforms] = useState<string[]>(profile?.platforms ?? [])
  const [propFirm, setPropFirm] = useState<boolean | null>(profile ? profile.prop_firm : null)
  const [experience, setExperience] = useState<"new" | "1-3" | "3+" | null>(profile?.experience ?? null)
  const [dayStart, setDayStart] = useState<DayStartChoice>(dayStartOf(profile?.day_start))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null)

  const reset = () => {
    setMarkets(profile?.markets ?? [])
    setPlatforms(profile?.platforms ?? [])
    setPropFirm(profile ? profile.prop_firm : null)
    setExperience(profile?.experience ?? null)
    setDayStart(dayStartOf(profile?.day_start))
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ trading_profile: { markets, platforms, prop_firm: !!propFirm, ...(experience ? { experience } : {}), ...(dayStart !== "auto" ? { day_start: dayStart } : {}) } })
      })
      setMessage({ tone: "good", text: "Saved. Pip will use this from now on." })
      setEditing(false)
      onSaved()
    } catch {
      setMessage({ tone: "bad", text: "Couldn't save that. Please try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="About your trading"
      action={!editing && <button onClick={() => { reset(); setEditing(true) }} className="text-sm text-brand-300 hover:text-brand-200">Edit</button>}
    >
      {message && <div className="mb-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
      {editing ? (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs text-ink-text">What do you trade?</p>
            <div className="flex flex-wrap gap-2">
              {MARKETS.map(m => <button key={m.id} onClick={() => setMarkets(toggle(markets, m.id))} className={chip(markets.includes(m.id))}>{m.label}</button>)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-ink-text">Where do you place trades?</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => <button key={p.id} onClick={() => setPlatforms(toggle(platforms, p.id))} className={chip(platforms.includes(p.id))}>{p.label}</button>)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-ink-text">Trading a prop firm account?</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPropFirm(true)} className={chip(propFirm === true)}>Yes</button>
              <button onClick={() => setPropFirm(false)} className={chip(propFirm === false)}>No</button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-ink-text">How long have you been trading?</p>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE.map(e => <button key={e.id} onClick={() => setExperience(e.id)} className={chip(experience === e.id)}>{e.label}</button>)}
            </div>
            <p className="mt-2 text-xs text-ink-muted">If you&apos;re new, Pip explains terms in plain language and suggests the basics. Otherwise he keeps it short.</p>
          </div>
          <DayStartPicker markets={markets} value={dayStart} onChange={setDayStart} />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || markets.length === 0 || platforms.length === 0} className={buttonPrimary}>{busy ? "Saving..." : "Save"}</button>
            <button onClick={() => { setEditing(false); setMessage(null) }} disabled={busy} className={buttonSecondary}>Cancel</button>
          </div>
        </div>
      ) : profile ? (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-ink-muted">Trades</dt><dd className="mt-0.5">{labelOf(MARKETS, profile.markets) || <span className="text-ink-muted">Not set</span>}</dd></div>
          <div><dt className="text-xs text-ink-muted">Platforms</dt><dd className="mt-0.5">{labelOf(PLATFORMS, profile.platforms) || <span className="text-ink-muted">Not set</span>}</dd></div>
          <div><dt className="text-xs text-ink-muted">Prop firm account</dt><dd className="mt-0.5">{profile.prop_firm ? "Yes" : "No"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Trading day starts</dt><dd className="mt-0.5">{(() => { const rule = dayRuleOf(profile); const label = rule ? DAY_START_CHOICES.find(c => c.id === rule)?.label ?? rule : "Midnight, my time"; return profile.day_start ? label : `${label} (automatic)` })()}</dd></div>
          <div><dt className="text-xs text-ink-muted">Experience</dt><dd className="mt-0.5">{EXPERIENCE.find(e => e.id === profile.experience)?.label ?? <span className="text-ink-muted">Not set</span>}</dd></div>
        </dl>
      ) : (
        <p className="text-sm text-ink-text">You haven&apos;t told Pip about your trading yet. Add what you trade and how long you&apos;ve been at it, and Pip can tailor his coaching.</p>
      )}
    </Card>
  )
}
