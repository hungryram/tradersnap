import { CHROME_STORE_URL } from "./links"
import HeroReplay from "./components/HeroReplay"
import MeetPip from "./components/MeetPip"
import Pricing from "./components/Pricing"
import Pip, { type PipMood } from "./components/Pip"
import { FAQ, FaqList } from "./components/Faq"
import { Section } from "./components/Section"

// The moments that wreck a trading day. None of them are analysis problems.
const MOMENTS = [
  { name: "The revenge trade", text: "Down $180. Two minutes later you're back in, sized up, to make it back." },
  { name: "The FOMO chase", text: "It ran without you, so you buy the top of the candle you swore you'd never chase." },
  { name: "The moved stop", text: "Your stop is about to hit, so you drag it lower. Just this once. Again." },
  { name: "The give-back", text: "Green by 10 a.m. Then you keep clicking until you're not." },
]

// A session with Pip. Messages are the extension's real check-ins and coaching.
const SESSION: { when: string; title: string; text: string; mood: PipMood; message: string; tag?: string }[] = [
  {
    when: "Before the open",
    title: "Your plan, in one line",
    text: "Set your max trades, loss limit and trading hours once. Pip reminds you of them when you sit down.",
    mood: "idle",
    message: "Morning. Today's plan: max 4 trades, stop after 2 losses in a row. One good setup beats five forced ones.",
  },
  {
    when: "Before every entry",
    title: "A second look at your setup",
    text: "One click and Pip checks your chart against the rules you wrote. Not his opinion of the market. Your rules.",
    mood: "happy",
    tag: "Lines up with your rules",
    message: "Higher low on the 5m, above both moving averages, inside your session. This is the setup you wrote down.",
  },
  {
    when: "After a loss",
    title: "He notices the jump back in",
    text: "Pip sees your trades as they close. Re-enter right after a loss and he asks the question you won't ask yourself.",
    mood: "caution",
    message: "You're back in 2 minutes after a −$180 loss. Was this setup on your plan, or is it the last trade talking?",
  },
  {
    when: "At your limit",
    title: "Your rule, said out loud",
    text: "Hit your max trades or your loss limit and Pip says so. Need to cool off? Ask for a 5 to 15 minute timeout.",
    mood: "caution",
    message: "That's trade 4 of 4. Anything else today breaks your rule.",
  },
  {
    when: "After the close",
    title: "Scored on discipline",
    text: "Your day lands in your journal automatically, with a recap that counts the rules you kept.",
    mood: "happy",
    message: "Today: 3 trades. No rules broken. That's the win. What's one thing to do differently tomorrow?",
  },
]

const FEATURES = [
  { title: "Chart checks against your rules", text: "Lines up, incomplete or rule broken, with the reasons." },
  { title: "Automatic trade log", text: "Every trade and result from TradingView, no spreadsheets." },
  { title: "Check-ins when it matters", text: "Losing streaks, quick re-entries, limits, your daily plan." },
  { title: "Daily limits", text: "Max trades, max loss, losses in a row, trading hours." },
  { title: "Cooldown timer", text: "Ask for a 5 to 15 minute break. Pip runs the clock." },
  { title: "Journal and today view", text: "Your day at a glance and every session to look back on." },
  { title: "Rule templates", text: "Start from a template, then make it yours." },
  { title: "Ask Pip anything", text: "Talk through a setup, a loss or a bad day, in plain language." },
]

const TRUST = [
  { title: "No broker login", text: "No passwords, no API keys, nothing to connect." },
  { title: "Can't touch your orders", text: "Pip reads your screen. He can't place, change or close a trade." },
  { title: "Charts only when you ask", text: "A screenshot is taken only when you click Analyze or send a chart." },
  { title: "Delete everything, anytime", text: "One button in your account removes your account and all your data." },
]

// Real quotes from real traders (with their permission). The section stays hidden while this is empty.
const TESTIMONIALS: { quote: string; name: string; detail: string }[] = []

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#19263F55_1px,transparent_1px),linear-gradient(to_bottom,#19263F55_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-8 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr]">
          <div className="text-center lg:text-left">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink-border bg-ink-surface/80 px-3 py-1 text-xs text-ink-text">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-300" /> For traders who know the rules and break them anyway
            </p>
            <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl xl:text-[3.5rem]">
              You know your rules.
              <span className="block text-brand-300">Pip makes sure you follow them.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-text lg:mx-0">
              Pip is an AI trading coach who lives on your chart. He knows your rules, sees your trades as they happen, and speaks up before
              the revenge trade, the FOMO chase and the &ldquo;just one more.&rdquo;
            </p>
            <p className="mx-auto mt-3 max-w-xl font-medium text-ink-body lg:mx-0">No signals. No predictions. Just your plan, with backup.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <InstallButton label="Add Pip to Chrome, free" />
              <a href="#how-it-works" className="rounded-lg border border-ink-border px-6 py-3.5 text-center font-medium text-ink-body transition-colors hover:bg-ink-surface">
                See a session with Pip
              </a>
            </div>
            <p className="mt-5 text-sm text-ink-muted">Free plan · No card · No broker login · 2-minute setup</p>
            <div className="mt-8 flex items-center justify-center gap-6 opacity-70 lg:justify-start">
              <span className="text-xs text-ink-muted">Works on</span>
              <img src="/platforms/tradingview.svg" alt="TradingView" className="h-5" />
              <img src="/platforms/tradovate.png" alt="Tradovate" className="h-5" />
              <img src="/platforms/topstep.png" alt="Topstep" className="h-5" />
            </div>
          </div>
          <HeroReplay />
        </div>
      </section>

      {/* The problem */}
      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-medium text-brand-300">Sound familiar?</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bad days rarely start with bad analysis</h2>
          <p className="mt-4 leading-relaxed text-ink-text">They start with a few seconds like these.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MOMENTS.map((m) => (
            <div key={m.name} className="rounded-2xl border border-ink-border bg-ink-surface p-6">
              <h3 className="font-semibold text-red-300">{m.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-text">{m.text}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-12 max-w-3xl text-center text-xl font-medium leading-relaxed sm:text-2xl">
          None of these are chart problems. You already know the rules.
          <span className="text-ink-text"> What's missing is someone there in the moment you're about to break them.</span>
        </p>
      </section>

      {/* A session with Pip */}
      <Section id="how-it-works" eyebrow="How it works" title="Pip is there from the open to the close" intro="Snapchart sits in the corner of your chart in Chrome. Here's what a session looks like.">
        <ol className="relative mx-auto max-w-4xl">
          <div className="absolute bottom-6 left-[19px] top-6 w-px bg-ink-border md:left-1/2" aria-hidden />
          {SESSION.map((s, i) => (
            <li key={s.when} className="relative grid gap-4 pb-12 pl-14 last:pb-0 md:grid-cols-2 md:gap-12 md:pl-0">
              <div className="absolute left-0 top-0 md:left-1/2 md:-translate-x-1/2">
                <div className="rounded-full bg-ink-bg p-1"><Pip mood={s.mood} size={32} animated={false} /></div>
              </div>
              <div className={i % 2 ? "md:order-2 md:pl-6" : "md:pr-6 md:text-right"}>
                <p className="text-xs font-medium uppercase tracking-wider text-brand-300">{s.when}</p>
                <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-text">{s.text}</p>
              </div>
              <div className={i % 2 ? "md:order-1 md:pr-6" : "md:pl-6"}>
                <Bubble mood={s.mood} tag={s.tag} avatar={false}>{s.message}</Bubble>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* The scoreboard */}
      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-br from-brand-500/15 via-ink-surface to-ink-surface px-6 py-16 text-center sm:px-16">
          <p className="text-sm font-medium text-brand-300">How Pip keeps score</p>
          <p className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">&ldquo;No rules broken. That's the win.&rdquo;</p>
          <p className="mx-auto mt-6 max-w-2xl leading-relaxed text-ink-text">
            You can't control what the market does today. You can control whether you trade your plan. So that's what Pip measures, celebrates and
            reminds you of, one session at a time.
          </p>
        </div>
      </section>

      <MeetPip />

      {/* Not a signal service */}
      <Section id="why" eyebrow="Why trust Pip" title="You won't find a P&L screenshot on this page" intro="Trading is full of people selling signals, secret indicators and win rates. We're not one of them, on purpose.">
        <div className="grid gap-4 md:grid-cols-3">
          <NotThis title="No buy or sell calls">Pip never tells you to enter, exit or flip. He tells you whether a setup matches the rules you wrote.</NotThis>
          <NotThis title="No predictions">No price targets, no probabilities, no &ldquo;this is going to run.&rdquo; Nobody knows that, including us.</NotThis>
          <NotThis title="No guru">Your strategy stays yours. Pip doesn't sell one, doesn't change it, and won't upsell you a course.</NotThis>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => (
            <div key={t.title} className="rounded-2xl border border-ink-border p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Check /> {t.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-text">{t.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Everything Pip does */}
      <Section eyebrow="Features" title="Everything between you and a bad trade">
        <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <h3 className="flex items-start gap-2 font-semibold"><Check /> {f.title}</h3>
              <p className="mt-1.5 pl-6 text-sm leading-relaxed text-ink-text">{f.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Social proof: shows once TESTIMONIALS has real quotes */}
      {TESTIMONIALS.length > 0 && (
        <Section eyebrow="From traders" title="What traders say about Pip">
          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="rounded-2xl border border-ink-border bg-ink-surface p-6">
                <blockquote className="leading-relaxed text-ink-body">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption className="mt-4 text-sm text-ink-muted">{t.name} · {t.detail}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      {/* Setup */}
      <Section eyebrow="Get started" title="Two minutes from now, Pip is on your chart">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { n: "1", title: "Add to Chrome", text: "Install the free extension and create your account. No card." },
            { n: "2", title: "Write your rules", text: "Start from a template, then set your daily limits." },
            { n: "3", title: "Open your chart", text: "Pip appears in the corner. Trade like normal. He's watching your back." },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-ink-border bg-ink-surface p-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-ink-bg">{s.n}</span>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-text">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="pricing" eyebrow="Pricing" title="Free to start. No card, no catch." intro="Everything that protects you from your worst trades is free. Pro is for traders who check every setup.">
        <Pricing />
      </Section>

      <Section id="faq" eyebrow="FAQ" title="The questions skeptical traders ask">
        <div className="mx-auto max-w-3xl">
          <FaqList groups={[FAQ[0]]} />
          <p className="mt-6 text-center text-sm">
            <a href="/faq" className="text-brand-300 hover:underline">More questions: setup, privacy and plans</a>
          </p>
        </div>
      </Section>

      {/* Final call to action */}
      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <div className="rounded-3xl border border-ink-border bg-gradient-to-b from-brand-500/15 to-ink-surface px-6 py-16 text-center">
          <div className="mx-auto w-fit"><Pip mood="idle" size={88} /></div>
          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Your next revenge trade is already on its way. Have Pip there when it shows up.
          </h2>
          <p className="mt-4 text-ink-text">Free. Two minutes to set up. Works on the charts you already use.</p>
          <div className="mt-8"><InstallButton label="Add Pip to Chrome, free" /></div>
        </div>
      </section>
    </>
  )
}

function InstallButton({ label }: { label: string }) {
  return (
    <a
      href={CHROME_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block rounded-lg bg-brand-500 px-6 py-3.5 text-center font-semibold text-ink-bg shadow-lg shadow-brand-500/20 transition-colors hover:bg-brand-400"
    >
      {label}
    </a>
  )
}

function Bubble({ mood, tag, avatar = true, children }: { mood: PipMood; tag?: string; avatar?: boolean; children: React.ReactNode }) {
  const tone = mood === "caution"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-50"
    : mood === "happy"
      ? "border-brand-500/30 bg-brand-500/10"
      : "border-ink-border bg-ink-surface"
  return (
    <div className="flex items-start gap-2.5">
      {avatar && <Pip mood={mood} size={26} animated={false} className="mt-0.5" />}
      <div className={`rounded-xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed ${tone}`}>
        {tag && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-brand-300">{tag}</div>}
        {children}
      </div>
    </div>
  )
}

function NotThis({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-surface p-6">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 text-red-300" aria-hidden>×</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-text">{children}</p>
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
