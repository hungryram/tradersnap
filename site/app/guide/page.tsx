import type { Metadata } from "next"
import { APP_URL, CHROME_STORE_URL } from "../links"
import { PageHeader } from "../components/Section"

export const metadata: Metadata = { title: "Getting started", description: "Set up Snapchart in two minutes: install, sign in, write your rules and start trading with your coach." }

const STEPS = [
  { title: "Install the extension", text: <>Add Snapchart from the <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">Chrome Web Store</a>, then click the puzzle piece in Chrome's toolbar and pin it.</> },
  { title: "Create your free account", text: <>A welcome page opens after you install. Sign up there, or any time at <a href={APP_URL}>your dashboard</a>.</> },
  { title: "Set your rules and limits", text: <>Pick a template or write the rules you trade by, plus your daily loss and trade limits. You can change them any time under Rules.</> },
  { title: "Open your chart", text: <>Open TradingView, Tradovate or Topstep in Chrome. The Snapchart button appears in the bottom right corner. Click it, or press Alt+Shift+S.</> },
  { title: "Check a setup", text: <>Click <strong>Analyze chart</strong> before you enter. The coach checks your chart against your rules and tells you if the setup lines up. Use <strong>Send with chart</strong> to ask a question about what's on screen.</> },
  { title: "Let it track your trades", text: <>On TradingView, keep the trading panel open (it can be small). Snapchart reads your Order history and logs each trade and result. Your day shows up on the Today page and in your Journal.</> },
  { title: "Listen when it checks in", text: <>After a losing streak, a quick re-entry after a loss or when you near your limits, the coach messages you first. You can switch it to warnings only, or off, under Coach check-ins in the widget menu.</> },
]

export default function GuidePage() {
  return (
    <>
      <PageHeader title="Getting started" intro="Two minutes of setup, then Snapchart runs alongside you while you trade." />
      <ol className="mx-auto max-w-3xl space-y-4 px-4 sm:px-6">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-5 rounded-2xl border border-ink-border bg-ink-surface p-6">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-ink-bg">{i + 1}</span>
            <div>
              <h2 className="font-semibold">{step.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-text [&_a]:text-brand-300 [&_a:hover]:underline [&_strong]:text-ink-body">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}
