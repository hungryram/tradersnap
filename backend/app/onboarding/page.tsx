"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { Session } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase-client"
import { RULE_TEMPLATES } from "@/lib/rule-templates"
import { detectExtension } from "@/lib/extension-bridge"
import AuthShell from "../components/AuthShell"

type Market = "futures" | "stocks" | "options" | "forex" | "crypto"
type Platform = "tradingview" | "tradovate" | "topstepx" | "ninjatrader" | "other"

const MARKETS: { id: Market; label: string }[] = [
  { id: "futures", label: "Futures" }, { id: "stocks", label: "Stocks" }, { id: "options", label: "Options" },
  { id: "forex", label: "Forex" }, { id: "crypto", label: "Crypto" }
]
const PLATFORMS: { id: Platform; label: string; url?: string }[] = [
  { id: "tradingview", label: "TradingView", url: "https://www.tradingview.com/chart/?snapchart=start" },
  { id: "tradovate", label: "Tradovate", url: "https://trader.tradovate.com/?snapchart=start" },
  { id: "topstepx", label: "TopstepX", url: "https://topstepx.com/?snapchart=start" },
  { id: "ninjatrader", label: "NinjaTrader" },
  { id: "other", label: "Something else" }
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extensionVersion, setExtensionVersion] = useState<string | null | undefined>(undefined)

  // Step 1
  const [markets, setMarkets] = useState<Market[]>(["futures"])
  const [platforms, setPlatforms] = useState<Platform[]>(["tradingview"])
  const [propFirm, setPropFirm] = useState<boolean | null>(null)
  const [experience, setExperience] = useState<"new" | "1-3" | "3+" | null>(null)

  // Step 2
  const [templateIndex, setTemplateIndex] = useState<number | null>(null)
  const [rulesText, setRulesText] = useState("")
  const [editingRules, setEditingRules] = useState(false)
  const [maxTrades, setMaxTrades] = useState("3")
  const [stopAfterLosses, setStopAfterLosses] = useState("2")
  const [maxDailyLoss, setMaxDailyLoss] = useState("")
  const [sessionStart, setSessionStart] = useState("")
  const [sessionEnd, setSessionEnd] = useState("")
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const tzLabel = useMemo(() => new Date().toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop(), [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return router.replace("/")
      setSession(session)
      const response = await fetch("/api/me", { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (response.ok) {
        const { user, ruleset } = await response.json()
        if (user?.onboarded && ruleset) router.replace("/dashboard")
      }
    })
    detectExtension().then(setExtensionVersion)
  }, [])

  // Beginners start from the discipline pack, everyone else from the most popular setup
  const chooseTemplate = (index: number) => {
    setTemplateIndex(index)
    setRulesText(RULE_TEMPLATES[index].rules)
  }
  useEffect(() => {
    if (step === 2 && templateIndex === null) {
      const starter = RULE_TEMPLATES.findIndex(t => t.category === (experience === "new" ? "beginner" : "trend"))
      chooseTemplate(starter >= 0 ? starter : 0)
    }
  }, [step])

  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter(v => v !== value) : [...list, value]
  const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value)

  const limitsText = () => {
    const lines = [
      maxTrades && `- Max ${maxTrades} trades per day`,
      stopAfterLosses && `- Stop for the day after ${stopAfterLosses} losses in a row`,
      maxDailyLoss && `- Stop for the day if down $${maxDailyLoss}`,
      sessionStart && sessionEnd && `- Only trade between ${sessionStart} and ${sessionEnd} (${tzLabel})`
    ].filter(Boolean)
    return lines.length ? `\n\nDAILY LIMITS:\n${lines.join("\n")}` : ""
  }

  async function finish() {
    if (!session) return
    setError(null)
    setSaving(true)
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }
    try {
      const template = templateIndex !== null ? RULE_TEMPLATES[templateIndex] : null
      const rulesetResponse = await fetch("/api/rulesets", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: template?.name ?? "My Trading Rules",
          rules_text: (rulesText.trim() || "Follow my plan.") + limitsText(),
          is_primary: true
        })
      })
      if (!rulesetResponse.ok) throw new Error((await rulesetResponse.json()).error || "Couldn't save your rules")

      const profileResponse = await fetch("/api/me", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          onboarded: true,
          trading_profile: { markets, platforms, prop_firm: !!propFirm, ...(experience ? { experience } : {}) },
          trading_limits: {
            max_trades_per_day: numberOrNull(maxTrades),
            max_daily_loss: numberOrNull(maxDailyLoss),
            stop_after_losses: numberOrNull(stopAfterLosses),
            session_start: sessionStart || null,
            session_end: sessionEnd || null,
            timezone
          }
        })
      })
      if (!profileResponse.ok) throw new Error("Couldn't save your profile")

      fetch("/api/events", { method: "POST", headers, body: JSON.stringify({ event_type: "onboarding_completed", metadata: { platforms, prop_firm: !!propFirm } }) }).catch(() => {})
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm transition-colors ${active ? "border-brand-500 bg-brand-500/15 text-ink-body" : "border-ink-border bg-ink-surface text-ink-text hover:border-ink-muted"}`
  const primary = "rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-ink-bg font-medium px-6 py-3 transition-colors"
  const input = "w-full rounded-lg bg-ink-bg border border-ink-border px-3 py-2.5 text-ink-body placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/60"
  const tradingPlatforms = PLATFORMS.filter(p => p.url && platforms.includes(p.id))

  return (
    <AuthShell wide>
      <div className="mb-8 flex items-center gap-2" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map(n => (
          <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-brand-500" : "bg-ink-border"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">Tell us how you trade</h1>
            <p className="text-ink-text">So your coach talks about the right things.</p>
          </div>

          <Question title="What do you trade?">
            {MARKETS.map(m => <button key={m.id} onClick={() => setMarkets(toggle(markets, m.id))} className={chip(markets.includes(m.id))}>{m.label}</button>)}
          </Question>

          <Question title="Where do you place trades?">
            {PLATFORMS.map(p => <button key={p.id} onClick={() => setPlatforms(toggle(platforms, p.id))} className={chip(platforms.includes(p.id))}>{p.label}</button>)}
          </Question>

          <Question title="Trading a prop firm account?">
            <button onClick={() => setPropFirm(true)} className={chip(propFirm === true)}>Yes</button>
            <button onClick={() => setPropFirm(false)} className={chip(propFirm === false)}>No</button>
          </Question>

          <Question title="How long have you been trading?">
            <button onClick={() => setExperience("new")} className={chip(experience === "new")}>Less than a year</button>
            <button onClick={() => setExperience("1-3")} className={chip(experience === "1-3")}>1–3 years</button>
            <button onClick={() => setExperience("3+")} className={chip(experience === "3+")}>3+ years</button>
          </Question>

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} disabled={markets.length === 0 || platforms.length === 0} className={primary}>Continue</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">Your rules</h1>
            <p className="text-ink-text">Your coach checks every chart against these. Pick the closest setup; you can edit it any time.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {RULE_TEMPLATES.map((template, index) => (
              <button
                key={template.name}
                onClick={() => chooseTemplate(index)}
                className={`text-left rounded-xl border p-4 transition-colors ${templateIndex === index ? "border-brand-500 bg-brand-500/10" : "border-ink-border bg-ink-surface hover:border-ink-muted"}`}
              >
                <div className="font-medium text-sm mb-1">{template.name}</div>
                <div className="text-xs text-ink-text">{template.description.replace(/ - .*$/, "")}</div>
              </button>
            ))}
          </div>

          <div>
            <button onClick={() => setEditingRules(!editingRules)} className="text-sm text-brand-300 hover:text-brand-200">
              {editingRules ? "Hide rules" : "View or edit these rules"}
            </button>
            {editingRules && (
              <textarea value={rulesText} onChange={e => setRulesText(e.target.value)} rows={12} className={`${input} mt-3 font-mono text-sm`} />
            )}
          </div>

          <div className="rounded-2xl border border-ink-border bg-ink-surface p-6">
            <h2 className="font-semibold mb-1">Your daily limits</h2>
            <p className="text-sm text-ink-text mb-5">Pip warns you when you hit these. Leave any blank to skip it.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Max trades per day">
                <input inputMode="numeric" value={maxTrades} onChange={e => setMaxTrades(e.target.value.replace(/\D/g, ""))} className={input} placeholder="3" />
              </Field>
              <Field label="Stop after losses in a row">
                <input inputMode="numeric" value={stopAfterLosses} onChange={e => setStopAfterLosses(e.target.value.replace(/\D/g, ""))} className={input} placeholder="2" />
              </Field>
              <Field label="Max daily loss ($)">
                <input inputMode="decimal" value={maxDailyLoss} onChange={e => setMaxDailyLoss(e.target.value.replace(/[^\d.]/g, ""))} className={input} placeholder="e.g. 500" />
              </Field>
            </div>
            <div className="mt-4">
              <Field label={`Trading hours (${tzLabel}, optional)`}>
                <div className="flex items-center gap-3">
                  <input type="time" value={sessionStart} onChange={e => setSessionStart(e.target.value)} className={input} />
                  <span className="text-ink-muted">to</span>
                  <input type="time" value={sessionEnd} onChange={e => setSessionEnd(e.target.value)} className={input} />
                </div>
              </Field>
            </div>
          </div>

          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="text-sm text-ink-text hover:text-ink-body">Back</button>
            <button onClick={finish} disabled={saving || !rulesText.trim()} className={primary}>{saving ? "Saving..." : "Save and continue"}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center space-y-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">You're all set</h1>
            <p className="text-ink-text max-w-md mx-auto">
              Open your chart and click the <span className="text-ink-body font-medium">Pip</span> button at the bottom right. Your first check takes about 15 seconds.
            </p>
          </div>

          {extensionVersion === null && (
            <p className="mx-auto max-w-md rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              We couldn't find the Pip extension in this browser.{" "}
              {process.env.NEXT_PUBLIC_CHROME_STORE_URL
                ? <a href={process.env.NEXT_PUBLIC_CHROME_STORE_URL} className="underline">Add it to Chrome</a>
                : "Add it from the Chrome Web Store"}
              {" "}first, then come back.
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {(tradingPlatforms.length ? tradingPlatforms : PLATFORMS.slice(0, 1)).map(p => (
              <a key={p.id} href={p.url} className={primary}>Open {p.label}</a>
            ))}
          </div>
          <a href="/dashboard" className="inline-block text-sm text-ink-text hover:text-ink-body">Go to my dashboard instead</a>
        </div>
      )}
    </AuthShell>
  )
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-medium mb-3">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-text mb-1.5">{label}</span>
      {children}
    </label>
  )
}
