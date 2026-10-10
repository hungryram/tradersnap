import { SUPPORT_EMAIL } from "../links"

export type FaqItem = { q: string; a: string }
export type FaqGroup = { title: string; items: FaqItem[] }

export const FAQ: FaqGroup[] = [
  {
    title: "Getting started",
    items: [
      { q: "What is Snapchart?", a: "A Chrome extension that sits on your chart as a trading coach. It checks your setup against your own rules, tracks your trades automatically and speaks up when you start breaking your plan, like after a losing streak or when you jump straight back into a trade after a loss." },
      { q: "Is this a signal service?", a: "No. Snapchart never tells you what to buy or sell. It holds you to the rules you wrote yourself. Think of it as a pre-trade checklist and an accountability partner, not an oracle." },
      { q: "Which platforms does it work with?", a: "Chart checks and the coach work on any chart you open in Chrome, including TradingView, Tradovate and Topstep. Automatic trade tracking works on TradingView today, with more platforms on the way." },
      { q: "Do I need to write rules first?", a: "No. The coach works without them, and you can start with a template during setup. Rules make the feedback personal, so most traders add them in the first few days." },
    ],
  },
  {
    title: "Trade tracking and privacy",
    items: [
      { q: "How does Snapchart know my trades?", a: "It reads the Order history in TradingView's trading panel, in your own browser, while you trade. There's no broker login and no API keys. Keep the trading panel open (it can be small) and Snapchart logs each trade and its result." },
      { q: "Can Snapchart place or change trades?", a: "No. It only reads what's on your screen. It can't place, change or close orders, and it never sees your broker password." },
      { q: "What do you store?", a: "Your account, rules, chats and the trades it detects (symbol, size, prices and profit or loss) so your coach and journal can use them. Charts are only captured when you click Analyze or Send with chart. You can delete your account and all your data at any time from your account page." },
    ],
  },
  {
    title: "Plans and usage",
    items: [
      { q: "What's free?", a: "Free includes about 5 chart checks and 15 coach messages a day, automatic trade tracking, the journal, coach check-ins and daily limits. No card needed." },
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
