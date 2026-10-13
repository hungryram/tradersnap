"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import { SITE_URL } from "@/lib/urls"
import { Card, PageHeader } from "../components/ui"

const STORE_URL = "https://chromewebstore.google.com/detail/bppbpeodpbepcmjifjjihejcnofdnibe?utm_source=item-share-cb"
const link = "text-brand-300 hover:text-brand-200 underline"

type Section = { title: string; body: React.ReactNode }

const STEPS: React.ReactNode[] = [
  <>Install Pip from the <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className={link}>Chrome Web Store</a> and pin it to your toolbar (puzzle piece, then pin).</>,
  <>Set your <a href="/dashboard/rules" className={link}>strategies and daily limits</a>. Pip checks every chart and every trade against them.</>,
  <>Open your chart in Chrome (TradingView, Tradovate or TopstepX). The Pip button sits at the bottom right. Click it, or press <Kbd>Alt + Shift + S</Kbd>.</>,
  <>Click <strong className="text-ink-body">Check this setup</strong> before you enter, or type a question and send it with your chart.</>,
  <>Turn on <strong className="text-ink-body">Auto-detect trades</strong> in the widget&apos;s ⋮ menu so your <a href="/dashboard/journal" className={link}>journal</a> fills itself.</>,
]

const SECTIONS: Section[] = [
  {
    title: "Checking a setup",
    body: (
      <>
        <p>Before you enter, click <strong>Check this setup</strong>. Pip looks at your chart, compares it to the strategy you&apos;ve written, and tells you whether it lines up or what&apos;s missing. If you keep several strategies, he works out which one the chart fits (or tells you it fits none).</p>
        <p>Pip never tells you to buy or sell, never predicts price and never gives entries, stops or targets. He holds you to the rules you wrote.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Send with chart</strong> (<Kbd>Ctrl + Enter</Kbd>, <Kbd>Cmd + Enter</Kbd> on Mac) adds a screenshot to a question. Plain messages without a chart use much less of your allowance.</li>
          <li>The chart is only captured when you click one of those. Screenshots stay in your browser and are not saved on our servers.</li>
          <li>Use the strategy picker in the chat box to say which strategy you&apos;re trading.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Your strategies and daily limits",
    body: (
      <>
        <p>On the <a href="/dashboard/rules" className={link}>Rules</a> page you write each setup you trade as its own strategy, plus the rules that apply to every trade. Be specific: exact indicator settings, timeframe, what a valid entry looks like. The clearer the rule, the better Pip can hold you to it.</p>
        <p>Your <strong>trading day</strong> starts when your market's session does. For futures that's 6 PM Eastern (3 PM Pacific), so an evening trade counts toward the next day and your limits reset then. Pip sets it from what you trade; change it on the <a href="/dashboard/account" className={link}>Account</a> page.</p>
        <p>Daily limits (max trades, stop after N losses, max daily loss, session hours) are what the coach watches live. When you near or pass one, Pip speaks up. He can&apos;t touch your orders, you&apos;re always in control.</p>
        <p>Free includes 1 strategy. Pro checks up to 5 at once, Pro+ up to 50.</p>
      </>
    ),
  },
  {
    title: "Trade tracking and your journal",
    body: (
      <>
        <p>With Auto-detect on, Pip logs each trade and its result as it happens. Nothing to export and no broker login.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>TradingView:</strong> keep the trading panel open (it can be small). Pip reads your Order history.</li>
          <li><strong>Tradovate and TopstepX:</strong> Pip reads the trade data the page already loads. Nothing to keep open.</li>
          <li><strong>Several accounts?</strong> Each account is tracked separately. One trade copied to five accounts counts as one trade, and your limits apply per account. The journal has an account filter.</li>
          <li><strong>Tell Pip instead:</strong> say &quot;I just made 200&quot; and tap to log it, with a choice of strategy. Say &quot;I&apos;m up 381 today&quot; and Pip logs only what&apos;s missing as a day total. Nothing is logged until you tap.</li>
        </ul>
        <p>The <a href="/dashboard/journal" className={link}>Journal</a> shows a calendar, your trades, results per strategy and notes for each day. Use <strong>Review this day</strong> to have Pip walk through how the day went against your rules (Free gets one a week, Pro up to 5 a day, Pro+ up to 15).</p>
      </>
    ),
  },
  {
    title: "Check-ins from the coach",
    body: (
      <>
        <p>After a losing streak, a quick re-entry after a loss, or when you near your limits, Pip messages you first. Short and only when something happened. In the widget&apos;s ⋮ menu you can switch check-ins to warnings only or off, and ask for a short cooldown timer when you want a pause.</p>
      </>
    ),
  },
  {
    title: "What Pip remembers",
    body: (
      <>
        <p>Pip keeps a few short notes about you so he doesn&apos;t start from zero each time. See and edit all of it on the <a href="/dashboard/memory" className={link}>Memory</a> page. Star a reply to save it to <a href="/dashboard/saved-messages" className={link}>Saved for Pip</a> and he&apos;ll keep it in mind (Free keeps 3, Pro 20, Pro+ 50).</p>
        <p>On Pro and Pro+, Pip also reads your recent journal notes and your last trading day. On Free, he coaches from your rules, trades and chat.</p>
        <p>Tell Pip how long you&apos;ve been trading on the <a href="/dashboard/account" className={link}>Account</a> page. If you&apos;re new, he explains terms in plain language. You can change it or run setup again any time.</p>
      </>
    ),
  },
  {
    title: "Usage and plans",
    body: (
      <>
        <p>You get a daily allowance, shown as a percentage on your Account page and in the widget. A chart check uses more than a message. It resets every day at midnight UTC. New accounts start with 7 days of Pro, no card needed.</p>
        <p>If you run out, wait for the reset, move up a plan, or buy extra usage, which is used after your daily allowance and never expires. Plans and prices are on the <a href={`${SITE_URL}/pricing`} className={link}>pricing page</a>.</p>
      </>
    ),
  },
]

const TIPS = [
  ["Check before you enter", "Pip is most useful before the trade, when it's still a decision."],
  ["Write rules you can test", "\"Price above the 20 EMA on the 5-minute, pullback to it\" beats \"trade with the trend\"."],
  ["Add a note at the end of the day", "Even one line. On paid plans Pip reads it and uses it next time."],
  ["Update your rules as you learn", "What you write in March may not fit in June. Edit them on the Rules page."],
]

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-ink-border bg-ink-elevated px-1.5 py-0.5 font-mono text-xs text-ink-body">{children}</span>
}

export default function GuidePage() {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/")
        return
      }
      setIsLoading(false)
    })
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-ink-body text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Guide" subtitle="How to set Pip up and get the most out of it while you trade." />

      <div className="mb-8 rounded-lg border border-brand-500/30 bg-brand-500/10 p-6">
        <h2 className="mb-3 text-lg font-semibold text-ink-body">Quick start</h2>
        <ol className="space-y-2 text-ink-text">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-start">
              <span className="mr-2 font-semibold text-brand-300">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-ink-muted">Can&apos;t see the Pip button? Refresh the page and make sure you&apos;re signed in from the extension icon.</p>
      </div>

      <div className="space-y-6">
        {SECTIONS.map(section => (
          <Card key={section.title} title={section.title}>
            <div className="space-y-3 text-sm leading-relaxed text-ink-text [&_strong]:text-ink-body">{section.body}</div>
          </Card>
        ))}

        <Card title="Tips">
          <ul className="space-y-3 text-sm text-ink-text">
            {TIPS.map(([title, text]) => (
              <li key={title}>
                <p className="font-medium text-ink-body">{title}</p>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-8 text-center text-sm text-ink-text">
        Need help? <a href="/dashboard/faq" className={link}>Read the FAQ</a> or <a href={`${SITE_URL}/contact`} target="_blank" rel="noopener noreferrer" className={link}>contact us</a>.
      </p>
    </div>
  )
}
