"use client"

import { useState } from "react"
import { CHROME_STORE_URL } from "../links"

// Keep in sync with backend/lib/plans.ts (limits and prices) and the dashboard's account page
const PLANS = [
  {
    name: "Free",
    price: { month: 0, year: 0 },
    note: "Starts with 7 days of Pro, no card",
    items: [
      "About 5 chart checks and 15 messages with Pip a day",
      "Automatic trade tracking on TradingView, Tradovate and TopstepX",
      "Check-ins and daily limits",
      "1 strategy checked at a time",
      "Journal, calendar and notes: last 7 days",
      "1 free day review a week",
      "Pip remembers 3 saved messages",
    ],
    cta: "Add to Chrome",
  },
  {
    name: "Pro",
    price: { month: 29, year: 249 },
    badge: "Most popular",
    items: [
      "Everything in Free",
      "About 30 chart checks and 150 messages a day",
      "Up to 5 strategies, Pip matches each chart to the right one",
      "Full journal, calendar and notes history",
      "Results per strategy",
      "Pip reads your last 10 journal notes and your last trading day",
      "Pip reviews any day in your journal (5 a day)",
      "Pip remembers 20 saved messages",
    ],
    cta: "Start your free week",
    highlight: true,
  },
  {
    name: "Pro+",
    price: { month: 99, year: 990 },
    note: "For full-time and multi-account traders",
    items: [
      "Everything in Pro",
      "About 100 chart checks and 400 messages a day",
      "Unlimited strategies",
      "Pip reads your last 15 journal notes",
      "Up to 15 day reviews a day",
      "Pip remembers 50 saved messages",
    ],
    cta: "Start free, upgrade anytime",
  },
] as const

export default function Pricing() {
  const [interval, setInterval] = useState<"month" | "year">("month")

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-lg border border-ink-border p-1 text-sm">
          {(["month", "year"] as const).map(value => (
            <button
              key={value}
              onClick={() => setInterval(value)}
              className={`rounded-md px-4 py-1.5 transition-colors ${interval === value ? "bg-ink-elevated text-ink-body" : "text-ink-text hover:text-ink-body"}`}
            >
              {value === "month" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map(plan => {
          const monthly = interval === "month" ? plan.price.month : Math.round(plan.price.year / 12)
          const highlight = "highlight" in plan && plan.highlight
          return (
            <div key={plan.name} className={`relative flex flex-col rounded-2xl border p-7 ${highlight ? "border-brand-500/60 bg-brand-500/[0.07]" : "border-ink-border bg-ink-surface"}`}>
              {"badge" in plan && plan.badge && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand-500 px-3 py-1 text-xs font-medium text-ink-bg">{plan.badge}</span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight">${monthly}</span>
                {plan.price.month > 0 && <span className="text-sm text-ink-text">/month</span>}
              </div>
              <p className="mt-1 h-5 text-sm text-ink-muted">
                {plan.price.month === 0
                  ? ""
                  : interval === "year" ? `Billed $${plan.price.year} yearly` : "Cancel anytime"}
              </p>
              {"note" in plan && plan.note && <p className="mt-2 text-sm text-brand-300">{plan.note}</p>}
              <ul className="mt-6 flex-1 space-y-3 text-sm text-ink-text">
                {plan.items.map(item => (
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
                {plan.cta}
              </a>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Every plan works with several accounts (copied trades count once, limits apply per account) and lets you tell Pip about a trade and log it in one tap. Every new account gets 7 days of Pro, free, no card. Usage resets daily at midnight UTC. Busy day? Buy extra usage on any plan; it never expires.
      </p>
      <p className="mt-3 text-center text-xs text-ink-muted">
        Prices and plan allowances may change as Pip grows. If a price changes, current subscribers get at least 30 days&apos; notice before it applies to them.
      </p>
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
