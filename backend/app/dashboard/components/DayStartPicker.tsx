"use client"

import { DAY_START_CHOICES, dayRuleOf } from "@/lib/trading-day"

// When the trader's trading day begins. "auto" follows what they trade (futures: the 6 PM Eastern session open),
// so picking Futures selects it for them; anything else they pick sticks.
export type DayStartChoice = "auto" | (typeof DAY_START_CHOICES)[number]["id"]

export const dayStartOf = (day_start?: string | null): DayStartChoice => (DAY_START_CHOICES.some(c => c.id === day_start) ? (day_start as DayStartChoice) : "auto")

const chip = (active: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-sm transition-colors ${active ? "border-brand-500 bg-brand-500/15 text-ink-body" : "border-ink-border bg-ink-surface text-ink-text hover:border-ink-muted"}`

export default function DayStartPicker({ markets, value, onChange }: { markets: string[]; value: DayStartChoice; onChange: (value: DayStartChoice) => void }) {
  const automatic = dayRuleOf({ markets })
  const automaticLabel = automatic ? DAY_START_CHOICES.find(c => c.id === automatic)?.label ?? `${automatic} Eastern` : "Midnight, my time"
  return (
    <div>
      <p className="mb-2 text-xs text-ink-text">When does your trading day start?</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange("auto")} className={chip(value === "auto")}>Automatic ({automaticLabel})</button>
        {DAY_START_CHOICES.map(c => <button type="button" key={c.id} onClick={() => onChange(c.id)} className={chip(value === c.id)}>{c.label}</button>)}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Futures sessions open at 6 PM Eastern (3 PM Pacific), so an evening trade counts toward the next day, and your daily limits reset then. Pip uses this for your journal, limits and check-ins.
      </p>
    </div>
  )
}
