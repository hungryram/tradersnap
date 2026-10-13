"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import { SITE_URL } from "@/lib/urls"
import { Card, PageHeader } from "../components/ui"

const STORE_URL = "https://chromewebstore.google.com/detail/bppbpeodpbepcmjifjjihejcnofdnibe?utm_source=item-share-cb"
const link = "text-brand-300 hover:text-brand-200 underline"
const contact = `${SITE_URL}/contact`

type Group = { title: string; items: { q: string; a: React.ReactNode }[] }

const GROUPS: Group[] = [
  {
    title: "Getting started",
    items: [
      { q: "How do I install Pip?", a: <><a href={STORE_URL} target="_blank" rel="noopener noreferrer" className={link}>Add it from the Chrome Web Store</a>, pin it, click the extension icon and sign in. Then open a chart and click the Pip button at the bottom right (or press Alt + Shift + S).</> },
      { q: "Which platforms does it work with?", a: "Chart checks and chat work on any chart you open in Chrome, including TradingView, Tradovate and TopstepX. Automatic trade tracking works on TradingView, Tradovate and TopstepX." },
      { q: "Do I need to write rules first?", a: "No, but your strategies and daily limits are what make Pip personal. Setup gives you templates to start from, and you can edit them any time on the Rules page." },
      { q: "Can I go through setup again?", a: <>Yes. On the <a href="/dashboard/account" className={link}>Account</a> page you can edit what you trade, where, prop firm and experience, or choose Run setup again to redo the onboarding questions. Your strategies, trades and journal stay as they are.</> },
      { q: "Why does the extension need permissions?", a: "To show the Pip button on your trading platform, capture your chart when you ask, and read the trades your platform already shows so your journal fills itself. Pip can't place, change or close orders and never sees your broker password." },
    ],
  },
  {
    title: "Strategies and checks",
    items: [
      { q: "Is Pip a signal service?", a: "No, and it never will be. Pip never tells you to buy or sell, never predicts price and never gives entries, stops or targets. He checks your setup against the rules you wrote." },
      { q: "Can I keep more than one strategy?", a: "Yes. Write each setup as its own strategy plus the rules that apply to every trade. Pip tells you which one a chart matches, or that it matches none, and your journal shows results per strategy. Free checks 1 strategy at a time, Pro up to 5, Pro+ up to 50." },
      { q: "What if Pip doesn't recognize my indicator?", a: "Describe it in your strategy: its name, settings and the colors you use. If he still misses it, send us a note through the contact page so we can improve it." },
      { q: "Does Pip stop me from placing a trade?", a: "No. He can't touch your orders. He speaks up at the right moment, checks your setup against your rules and, if you ask, puts you on a short cooldown timer." },
    ],
  },
  {
    title: "Trade tracking and journal",
    items: [
      { q: "How does Pip know my trades?", a: "On TradingView he reads the Order history in the trading panel, so keep it open (it can be small). On Tradovate and TopstepX he reads the trade data the page already loads. No broker login and no API keys." },
      { q: "A trade is missing from my journal.", a: "Make sure Auto-detect trades is on in the widget's ⋮ menu and the Pip widget was open on that platform when you traded. You can also tell Pip (\"I just made 200\") and tap to log it, or add it as a day total." },
      { q: "I trade several accounts. How is that counted?", a: "Each account is tracked on its own. One trade copied to five accounts counts as one trade, so your max-trades rule isn't broken by the copies. Daily limits are checked per account, profit and loss adds up every account, and the journal has an account filter." },
      { q: "Can I log a trade by telling Pip?", a: "Yes. Say \"I just made 200\" and Pip offers to log it with a button and a choice of strategy. Say \"I'm up 381 today\" and he logs only what's missing as a day total, not as an extra trade. Nothing is logged until you tap." },
      { q: "What is Review this day?", a: "A button in the journal where Pip goes through the day against your rules and tells you how it went. Free gets one a week, Pro up to 5 a day, Pro+ up to 15." },
      { q: "How long is my history kept?", a: "Free shows the journal, calendar and notes for your last 7 days. Pro and Pro+ show everything. Chat history is kept for 30 days; messages you star stay until you remove them." },
    ],
  },
  {
    title: "Memory and notes",
    items: [
      { q: "What does Pip remember about me?", a: <>A few short notes from your chats, trades and journal so he can coach you like he knows you. You can read, edit or delete all of it on the <a href="/dashboard/memory" className={link}>Memory</a> page.</> },
      { q: "What does starring a message do?", a: "It saves the message to Saved for Pip and Pip keeps it in mind when he answers. Free keeps 3, Pro 20, Pro+ 50 (your most recent)." },
      { q: "Does Pip read my journal notes?", a: "On Pro and Pro+, yes: your latest notes (10 on Pro, 15 on Pro+) and your last trading day. On Free, he coaches from your rules, trades and chat." },
    ],
  },
  {
    title: "Usage, plans and billing",
    items: [
      { q: "How does usage work?", a: "You get a daily allowance, shown as a percentage on your Account page and in the widget. A chart check uses more of it than a message, and a message with your chart sits in between. It resets daily at midnight UTC." },
      { q: "What happens when I run out?", a: "Wait for the daily reset, move to a bigger plan, or buy extra usage on the Account page. Extra usage is spent after your daily allowance and never expires." },
      { q: "What is the 7-day trial?", a: "Every new account gets 7 days of Pro, free, with no card needed. When it ends you move to Free unless you subscribe. We email you 2 days before." },
      { q: "How do I upgrade, change or cancel my plan?", a: "Account, then Manage billing. Upgrades start right away, and if you cancel you keep your plan until the end of the period you paid for." },
      { q: "Do you offer refunds?", a: <>Payments are non-refundable except where the law requires otherwise. If something went wrong with a charge, <a href={contact} target="_blank" rel="noopener noreferrer" className={link}>contact us</a> and we'll look into it.</> },
    ],
  },
  {
    title: "Privacy and account",
    items: [
      { q: "Is my chart saved?", a: "No. Screenshots are sent for the check you asked for and aren't stored on our servers." },
      { q: "What do you store?", a: "Your account, rules, chats and the trades Pip detects (symbol, size, prices and result), so your coach and journal can use them. The privacy policy on our site has the details." },
      { q: "How do I delete my account?", a: "On the Account page, in the delete section. It removes your account and your data right away and cancels any subscription." },
      { q: "I'm not getting the sign-in email.", a: "Check spam, make sure the address is right and try again. Some providers delay delivery by a few minutes." },
      { q: "Can I use Pip on mobile?", a: "Not yet. Pip is a desktop Chrome extension. Tell us if you'd use a mobile version." },
    ],
  },
]

export default function FAQPage() {
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
      <PageHeader
        title="FAQ"
        subtitle={<>Answers to common questions. Can&apos;t find yours? <a href={contact} target="_blank" rel="noopener noreferrer" className={link}>Contact us</a>.</>}
      />

      <div className="space-y-6">
        {GROUPS.map(group => (
          <Card key={group.title} title={group.title}>
            <div className="space-y-4">
              {group.items.map(item => (
                <div key={item.q} className="border-b border-ink-border pb-4 last:border-b-0 last:pb-0">
                  <h3 className="mb-1.5 text-base font-medium text-brand-300">{item.q}</h3>
                  <div className="text-sm leading-relaxed text-ink-text">{item.a}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-brand-500/30 bg-brand-500/10 p-6">
        <h2 className="mb-2 text-lg font-semibold text-ink-body">Still have questions?</h2>
        <p className="mb-4 text-sm text-ink-text">Questions, a bug or an idea: we read everything.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href={contact} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-ink-bg transition-colors hover:bg-brand-400">Contact us</a>
          <a href={`${SITE_URL}/feedback?type=bug`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg border border-ink-border bg-ink-surface px-4 py-2 text-ink-text transition-colors hover:bg-ink-elevated">Report a bug</a>
          <a href={`${SITE_URL}/feedback?type=idea`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg border border-ink-border bg-ink-surface px-4 py-2 text-ink-text transition-colors hover:bg-ink-elevated">Request a feature</a>
        </div>
      </div>
    </div>
  )
}
