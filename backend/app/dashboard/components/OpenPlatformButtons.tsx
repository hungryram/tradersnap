"use client"

import { buttonPrimary, buttonSecondary } from "./ui"

// Shortcuts to the platforms Pip works on. Shows the ones the trader said they use (from onboarding);
// if they haven't said, or only use something Pip doesn't work on yet, all three.
const PLATFORMS = [
  { id: "tradingview", label: "TradingView", url: "https://www.tradingview.com/chart/" },
  { id: "tradovate", label: "Tradovate", url: "https://trader.tradovate.com/" },
  { id: "topstepx", label: "TopstepX", url: "https://topstepx.com/" }
]

export function platformsFor(chosen?: string[] | null) {
  const mine = PLATFORMS.filter(p => chosen?.includes(p.id))
  return mine.length ? mine : PLATFORMS
}

export default function OpenPlatformButtons({ platforms, layout }: { platforms?: string[] | null; layout: "stack" | "row" }) {
  const list = platformsFor(platforms)
  return (
    <div className={layout === "stack" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"}>
      {list.map((p, i) => (
        <a
          key={p.id}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className={layout === "stack"
            ? `flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${i === 0 ? "bg-brand-500 text-ink-bg hover:bg-brand-400" : "border border-ink-border text-ink-body hover:border-ink-muted"}`
            : i === 0 ? buttonPrimary : buttonSecondary}
        >
          Open {p.label}
        </a>
      ))}
    </div>
  )
}
