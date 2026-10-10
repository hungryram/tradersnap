import { CHROME_STORE_URL } from "../links"

// Keep in sync with backend/lib/usage.ts (DAILY_CREDITS) and the dashboard's account page
const FREE = [
  "About 5 chart checks and 15 coach messages a day",
  "Automatic trade tracking and journal",
  "Coach check-ins: losing streaks, daily limits, revenge trades",
  "Daily loss and trade limits",
  "3 rulesets, coach remembers 3 saved messages",
]

const PRO = [
  "About 50 chart checks and 200 coach messages a day",
  "Everything in Free",
  "20 rulesets with longer rules",
  "Coach remembers 20 saved messages",
  "Longer, more detailed answers",
]

export default function Pricing() {
  return (
    <div className="grid gap-5 md:grid-cols-2 max-w-4xl mx-auto">
      <Plan
        name="Free"
        price="$0"
        note="No card needed"
        items={FREE}
        cta="Add to Chrome"
      />
      <Plan
        name="Pro"
        price="$19"
        was="$49"
        badge="Launch price"
        note="per month, cancel anytime"
        items={PRO}
        cta="Start free, upgrade anytime"
        highlight
      />
      <p className="md:col-span-2 text-center text-sm text-ink-muted">
        Usage resets every day at midnight UTC. Busy day? Buy extra usage on any plan. It never expires.
      </p>
    </div>
  )
}

function Plan({ name, price, was, badge, note, items, cta, highlight = false }: {
  name: string; price: string; was?: string; badge?: string; note: string; items: string[]; cta: string; highlight?: boolean
}) {
  return (
    <div className={`relative flex flex-col rounded-2xl border p-7 ${highlight ? "border-brand-500/60 bg-brand-500/[0.07]" : "border-ink-border bg-ink-surface"}`}>
      {badge && (
        <span className="absolute -top-3 left-7 rounded-full bg-brand-500 px-3 py-1 text-xs font-medium text-ink-bg">{badge}</span>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight">{price}</span>
        {was && <span className="text-lg text-ink-muted line-through">{was}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{note}</p>
      <ul className="mt-6 space-y-3 text-sm text-ink-text flex-1">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <Check />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <a
        href={CHROME_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-8 rounded-lg py-3 text-center font-medium transition-colors ${highlight ? "bg-brand-500 text-ink-bg hover:bg-brand-400" : "border border-ink-border text-ink-body hover:bg-ink-elevated"}`}
      >
        {cta}
      </a>
    </div>
  )
}

function Check() {
  return (
    <svg className="mt-0.5 h-4 w-4 flex-none text-brand-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}
