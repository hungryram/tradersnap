import { CHROME_STORE_URL } from "./links"
import WidgetMock from "./components/WidgetMock"
import Pricing from "./components/Pricing"
import { FAQ, FaqList } from "./components/Faq"
import { Section } from "./components/Section"
import MeetPip from "./components/MeetPip"

const STEPS = [
  { n: "01", title: "Write your rules", text: "Pick a template or write the rules you already trade by, plus your daily loss and trade limits. Takes two minutes." },
  { n: "02", title: "Trade like normal", text: "Pip sits on your chart in Chrome. He logs your trades on his own and keeps score of your day." },
  { n: "03", title: "Get pulled back in line", text: "Have Pip check a setup before you click, ask him anything, and hear from him when you start drifting from your plan." },
]

const FEATURES = [
  {
    title: "Pre-trade chart check",
    text: "One click and Pip checks your chart against your rules: lines up, incomplete or rule broken, with the reasons.",
    icon: "M4 19V5m0 14h16M8 15l3-4 3 2 4-6",
  },
  {
    title: "Trades logged automatically",
    text: "No spreadsheets and no broker login. Pip reads your TradingView trade history in your browser and records every trade and result.",
    icon: "M5 12l4 4L19 6",
  },
  {
    title: "A coach that speaks first",
    text: "Three losses in a row, a trade right after a loss, or close to your daily limit? Pip checks in before tilt costs you more.",
    icon: "M12 8v4m0 4h.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  },
  {
    title: "Your day at a glance",
    text: "Today's P&L, win rate and trades against your limits, with a journal of every session so you can see your patterns.",
    icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  },
]

const IS = ["A pre-trade checklist powered by AI", "An accountability coach for your own plan", "Automatic trade tracking and a journal", "Built around rules you write"]
const IS_NOT = ["A signal service", "Entry or exit calls", "Price predictions", "Financial advice"]

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr]">
        <div className="text-center lg:text-left">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-ink-border bg-ink-surface px-3 py-1 text-xs text-ink-text">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300" /> Chrome extension for day traders
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
            Meet Pip, the trading coach that sits on your chart
          </h1>
          <p className="mt-6 text-lg text-ink-text leading-relaxed max-w-xl mx-auto lg:mx-0">
            Pip checks your setup against your own rules, logs your trades automatically and speaks up when you start revenge trading.
            Not signals. Discipline.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand-500 px-6 py-3.5 font-medium text-ink-bg hover:bg-brand-400 transition-colors">
              Add to Chrome, it's free
            </a>
            <a href="#how-it-works" className="rounded-lg border border-ink-border px-6 py-3.5 font-medium text-ink-body hover:bg-ink-surface transition-colors">
              See how it works
            </a>
          </div>
          <p className="mt-5 text-sm text-ink-muted">No card needed. No broker login. Set up in 2 minutes.</p>
          <div className="mt-10 flex items-center gap-6 justify-center lg:justify-start opacity-70">
            <span className="text-xs text-ink-muted">Works on</span>
            <img src="/platforms/tradingview.svg" alt="TradingView" className="h-5" />
            <img src="/platforms/tradovate.png" alt="Tradovate" className="h-5" />
            <img src="/platforms/topstep.png" alt="Topstep" className="h-5" />
          </div>
        </div>
        <WidgetMock />
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-28 text-center">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-snug">
          You know your rules. The hard part is following them after the third loss.
        </h2>
        <p className="mt-5 text-ink-text leading-relaxed">
          Most blown days aren't a strategy problem. It's the revenge trade, the extra contract, the &ldquo;just one more&rdquo;.
          Pip puts a pause in exactly those moments, using your own plan.
        </p>
      </section>

      <MeetPip />

      <Section id="how-it-works" eyebrow="How it works" title="Three steps, then it runs alongside you">
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-ink-border bg-ink-surface p-7">
              <span className="text-sm font-medium text-brand-300">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-text">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="features" eyebrow="Features" title="Everything between you and a bad trade">
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-ink-border bg-ink-surface p-7">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={f.icon} />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-text">{f.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What Snapchart is, and isn't" intro="Clear expectations. It holds you to your plan. It doesn't make one for you.">
        <div className="grid gap-5 md:grid-cols-2 max-w-4xl mx-auto">
          <List title="Snapchart is" items={IS} good />
          <List title="Snapchart is not" items={IS_NOT} />
        </div>
      </Section>

      <Section id="pricing" eyebrow="Pricing" title="Start free. Upgrade when you trade more.">
        <Pricing />
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Questions traders ask">
        <div className="max-w-3xl mx-auto">
          <FaqList groups={FAQ.map((g) => ({ ...g, items: g.items.slice(0, 2) }))} />
          <p className="mt-6 text-center text-sm">
            <a href="/faq" className="text-brand-300 hover:underline">See all questions</a>
          </p>
        </div>
      </Section>

      {/* Final call to action */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-24">
        <div className="rounded-3xl border border-ink-border bg-gradient-to-b from-brand-500/15 to-ink-surface px-6 py-16 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Trade your plan, not your emotions</h2>
          <p className="mt-4 text-ink-text">Free to start. Takes two minutes. Works on the charts you already use.</p>
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" className="mt-8 inline-block rounded-lg bg-brand-500 px-7 py-3.5 font-medium text-ink-bg hover:bg-brand-400 transition-colors">
            Add to Chrome, it's free
          </a>
        </div>
      </section>
    </>
  )
}

function List({ title, items, good = false }: { title: string; items: string[]; good?: boolean }) {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-surface p-7">
      <h3 className="mb-5 font-semibold">{title}</h3>
      <ul className="space-y-3 text-sm text-ink-text">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3">
            <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs ${good ? "bg-brand-500/15 text-brand-300" : "bg-red-500/15 text-red-400"}`}>
              {good ? "✓" : "×"}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
