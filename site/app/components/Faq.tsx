import { SUPPORT_EMAIL } from "../links"

export type FaqItem = { q: string; a: string }
export type FaqGroup = { title: string; items: FaqItem[] }

export const FAQ: FaqGroup[] = [
  {
    title: "The honest questions",
    items: [
      { q: "Is this another signal service?", a: "No, and it never will be. Pip never tells you to buy or sell, never predicts price and never gives you entries, stops or targets. He holds you to the rules you wrote yourself. If you're looking for someone to tell you what to trade, Pip isn't it." },
      { q: "Will this make me profitable?", a: "We can't promise that, and you should be wary of anyone who does. Your results depend on your strategy and the market. What Pip does is help you trade the plan you already have, especially in the moments you usually don't: after a loss, when something's running without you, or when you're past your limits." },
      { q: "Can Pip stop me from placing a trade?", a: "No. Pip can't touch your orders, and you're always in control. What he does is speak up at the right moment, check your setup against your rules and, if you ask, put you on a short cooldown timer. Most bad trades happen in a few impulsive seconds. Pip puts a pause in those seconds." },
      { q: "Won't it get annoying?", a: "Pip only speaks up when something actually happens: a losing streak, a quick re-entry after a loss, a limit, or your plan for the day. You can switch check-ins to warnings only, or off, any time." },
      { q: "Why not just write my rules on a sticky note?", a: "You probably already have. The problem is that a sticky note doesn't notice you're back in two minutes after a loss, and it doesn't know you're at trade six of four. Pip does, because he sees your trades as they happen." },
    ],
  },
  {
    title: "Setup and platforms",
    items: [
      { q: "Which platforms does it work with?", a: "Pip's chart checks and chat work on any chart you open in Chrome, including TradingView, Tradovate and Topstep. Automatic trade tracking works on TradingView today, with more platforms on the way." },
      { q: "Do I need to write rules first?", a: "No. Setup gives you templates to start from, and you can edit them any time. Your rules and daily limits are what make Pip personal, so it's worth the two minutes." },
      { q: "How does Pip know my trades?", a: "He reads the Order history in TradingView's trading panel, in your own browser, while you trade. There's no broker login and no API keys. Keep the trading panel open (it can be small) and Pip logs each trade and its result." },
    ],
  },
  {
    title: "Privacy",
    items: [
      { q: "Can Pip access my broker account?", a: "No. Pip only reads what's on your screen in your browser. He can't place, change or close orders, and never sees your broker password." },
      { q: "What do you store?", a: "Your account, rules, chats and the trades Pip detects (symbol, size, prices and result) so your coach and journal can use them. Charts are only captured when you click Analyze or send a chart. You can delete your account and all your data from your account page, instantly." },
    ],
  },
  {
    title: "Plans and usage",
    items: [
      { q: "What's free?", a: "Free includes about 5 chart checks and 15 messages with Pip a day, automatic trade tracking, the journal, check-ins and daily limits. No card needed." },
      { q: "How does usage work?", a: "You get a daily allowance, shown as a percentage. A chart check uses more of it than a message. It resets every day at midnight UTC." },
      { q: "What if I run out?", a: "Wait for the daily reset, upgrade to Pro for about 10 times more every day, or buy extra usage on any plan. Extra usage is used after your daily allowance and never expires." },
      { q: "How do I cancel Pro?", a: "Go to Account, then Manage billing. You keep Pro until the end of the period you paid for." },
    ],
  },
]

export function FaqList({ groups = FAQ }: { groups?: FaqGroup[] }) {
  return (
    <div className="space-y-12">
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-ink-muted">{group.title}</h3>
          <div className="divide-y divide-ink-border rounded-2xl border border-ink-border bg-ink-surface">
            {group.items.map((item) => (
              <details key={item.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="flex-none text-ink-muted transition-transform group-open:rotate-45 text-xl leading-none" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-text">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="text-center text-sm text-ink-muted">
        Still stuck? Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-300 hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    </div>
  )
}
