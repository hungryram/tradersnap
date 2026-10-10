"use client"

import { useEffect, useState } from "react"
import { RULE_TEMPLATES, type RuleTemplate } from "@/lib/rule-templates"
import { api, type TradingLimits } from "@/lib/dashboard-data"
import { Card, Loading, Notice, PageHeader, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "../components/ui"

interface Ruleset {
  id: string
  name: string
  rules_text: string
  is_primary: boolean
  updated_at: string
}

const EMPTY_LIMITS: TradingLimits = { max_trades_per_day: null, max_daily_loss: null, stop_after_losses: null, session_start: null, session_end: null, timezone: null }

export default function RulesPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [rulesets, setRulesets] = useState<Ruleset[]>([])
  const [currentRuleset, setCurrentRuleset] = useState<Ruleset | null>(null)
  const [rulesText, setRulesText] = useState("")
  const [rulesetName, setRulesetName] = useState("")
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null)
  const [userPlan, setUserPlan] = useState<string>("free")
  const [showTemplates, setShowTemplates] = useState(false)

  const [limits, setLimits] = useState<TradingLimits>(EMPTY_LIMITS)
  const [limitsSaving, setLimitsSaving] = useState(false)
  const [limitsMessage, setLimitsMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null)

  const maxChars = userPlan === "pro" || userPlan === "admin" ? 5000 : 1000
  const maxRulesets = userPlan === "free" ? 3 : 20

  useEffect(() => { load() }, [])

  async function load(selectId?: string) {
    try {
      const [me, data] = await Promise.all([api("/api/me"), api<{ rulesets: Ruleset[] }>("/api/rulesets")])
      setUserPlan(me.user.plan)
      setLimits({ ...EMPTY_LIMITS, ...(me.user.trading_limits ?? {}) })
      setRulesets(data.rulesets)
      const selected = data.rulesets.find(r => r.id === selectId) ?? data.rulesets.find(r => r.is_primary) ?? data.rulesets[0] ?? null
      select(selected)
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Failed to load rules" })
    } finally {
      setIsLoading(false)
    }
  }

  function select(ruleset: Ruleset | null) {
    setCurrentRuleset(ruleset)
    setRulesText(ruleset?.rules_text ?? "")
    setRulesetName(ruleset?.name ?? "")
  }

  function applyTemplate(template: RuleTemplate) {
    setRulesText(template.rules)
    if (!rulesetName || rulesetName === currentRuleset?.name) setRulesetName(template.name)
    setShowTemplates(false)
    setMessage({ tone: "good", text: `"${template.name}" loaded. Edit it to match how you trade, then save.` })
  }

  async function run(action: () => Promise<string | void>, successText: string) {
    setMessage(null)
    setIsSaving(true)
    try {
      const selectId = await action()
      setMessage({ tone: "good", text: successText })
      await load(selectId || currentRuleset?.id)
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Something went wrong" })
    } finally {
      setIsSaving(false)
    }
  }

  const save = () => run(async () => {
    await api(`/api/rulesets/${currentRuleset!.id}`, { method: "PATCH", body: JSON.stringify({ name: rulesetName, rules_text: rulesText }) })
  }, "Rules saved.")

  const setPrimary = () => run(async () => {
    await api(`/api/rulesets/${currentRuleset!.id}`, { method: "PATCH", body: JSON.stringify({ is_primary: true }) })
  }, "Your coach now uses this ruleset.")

  const saveAsNew = () => {
    if (!rulesetName.trim() || rulesetName.trim() === currentRuleset?.name) {
      setMessage({ tone: "bad", text: "Give the new ruleset a different name first." })
      return
    }
    run(async () => {
      const data = await api("/api/rulesets", { method: "POST", body: JSON.stringify({ name: rulesetName.trim(), rules_text: rulesText, is_primary: false }) })
      return data?.ruleset?.id
    }, "Saved as a new ruleset.")
  }

  const remove = () => {
    if (!currentRuleset || !confirm(`Delete "${currentRuleset.name}"?`)) return
    run(async () => {
      await api(`/api/rulesets/${currentRuleset.id}`, { method: "DELETE" })
      return ""
    }, "Ruleset deleted.")
  }

  async function saveLimits() {
    setLimitsMessage(null)
    setLimitsSaving(true)
    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ trading_limits: { ...limits, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } })
      })
      setLimitsMessage({ tone: "good", text: "Limits saved." })
    } catch (err) {
      setLimitsMessage({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't save limits" })
    } finally {
      setLimitsSaving(false)
    }
  }

  const numberField = (key: "max_trades_per_day" | "stop_after_losses" | "max_daily_loss", decimal = false) => ({
    inputMode: (decimal ? "decimal" : "numeric") as "decimal" | "numeric",
    value: limits[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, "")
      setLimits({ ...limits, [key]: raw === "" ? null : Number(raw) })
    },
    className: inputClass
  })

  if (isLoading) return <Loading />

  const tz = new Date().toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop()

  return (
    <>
      <PageHeader title="Rules" subtitle="Your coach checks every chart against your primary ruleset." />

      {!currentRuleset ? (
        <Card>
          <div className="py-8 text-center">
            <p className="text-ink-text mb-4">You don't have any rules yet.</p>
            <a href="/onboarding" className={buttonPrimary}>Set up your rules</a>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                {rulesets.length > 1 ? (
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-ink-text">Ruleset</span>
                    <select
                      value={currentRuleset.id}
                      onChange={e => select(rulesets.find(r => r.id === e.target.value) ?? null)}
                      className={inputClass}
                    >
                      {rulesets.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_primary ? " (primary)" : ""}</option>)}
                    </select>
                  </label>
                ) : <div />}
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  {currentRuleset.is_primary
                    ? <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-green-300">Primary · your coach uses this</span>
                    : <button onClick={setPrimary} disabled={isSaving} className={buttonSecondary}>Make primary</button>}
                  <span>{rulesets.length}/{maxRulesets} rulesets</span>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs text-ink-text">Name</span>
                <input value={rulesetName} onChange={e => setRulesetName(e.target.value)} className={inputClass} />
              </label>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs text-ink-text">Rules <span className="text-ink-muted">({rulesText.length}/{maxChars})</span></span>
                  <button onClick={() => setShowTemplates(!showTemplates)} className="text-sm text-brand-300 hover:text-brand-200">
                    {showTemplates ? "Hide templates" : "Start from a template"}
                  </button>
                </div>

                {showTemplates && (
                  <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    {RULE_TEMPLATES.map(template => (
                      <button key={template.name} onClick={() => applyTemplate(template)} className="rounded-xl border border-ink-border bg-ink-bg p-3 text-left transition-colors hover:border-ink-muted">
                        <div className="text-sm font-medium">{template.name}</div>
                        <div className="mt-0.5 text-xs text-ink-text">{template.description.replace(/ - .*$/, "")}</div>
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  value={rulesText}
                  onChange={e => setRulesText(e.target.value)}
                  maxLength={maxChars}
                  rows={16}
                  placeholder="Write your rules here, or start from a template."
                  className={`${inputClass} font-mono leading-relaxed`}
                />
                <p className="mt-2 text-xs text-ink-muted">
                  Specific rules work best. <span className="text-green-400">Good:</span> "Wait for a 5-min close above resistance, enter on the next candle." <span className="text-red-400">Vague:</span> "Be patient."
                </p>
              </div>

              {message && <Notice tone={message.tone}>{message.text}</Notice>}

              <div className="flex flex-wrap gap-2">
                <button onClick={save} disabled={isSaving} className={buttonPrimary}>{isSaving ? "Saving..." : "Save changes"}</button>
                {rulesets.length < maxRulesets && (
                  <button onClick={saveAsNew} disabled={isSaving} className={buttonSecondary}>Save as new ruleset</button>
                )}
                {rulesets.length > 1 && !currentRuleset.is_primary && (
                  <button onClick={remove} disabled={isSaving} className={`${buttonDanger} sm:ml-auto`}>Delete</button>
                )}
              </div>
              {rulesets.length >= maxRulesets && userPlan === "free" && (
                <p className="text-xs text-ink-muted">Free plan holds {maxRulesets} rulesets. <a href="/dashboard/account#plans" className="text-brand-300 hover:text-brand-200">Pro holds 20.</a></p>
              )}
            </div>
          </Card>
        </div>
      )}

      <div id="limits" className="mt-6 scroll-mt-8">
        <Card title="Daily limits">
          <p className="-mt-2 mb-5 text-sm text-ink-text">Pip tracks these against your detected trades and warns you when you hit one. Leave any blank to skip it.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs text-ink-text">Max trades per day</span>
              <input {...numberField("max_trades_per_day")} placeholder="e.g. 3" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-ink-text">Stop after losses in a row</span>
              <input {...numberField("stop_after_losses")} placeholder="e.g. 2" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-ink-text">Max daily loss ($)</span>
              <input {...numberField("max_daily_loss", true)} placeholder="e.g. 500" />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs text-ink-text">Trading hours ({tz})</span>
            <div className="flex max-w-sm items-center gap-3">
              <input type="time" value={limits.session_start ?? ""} onChange={e => setLimits({ ...limits, session_start: e.target.value || null })} className={inputClass} />
              <span className="text-ink-muted">to</span>
              <input type="time" value={limits.session_end ?? ""} onChange={e => setLimits({ ...limits, session_end: e.target.value || null })} className={inputClass} />
            </div>
          </label>
          {limitsMessage && <div className="mt-4"><Notice tone={limitsMessage.tone}>{limitsMessage.text}</Notice></div>}
          <button onClick={saveLimits} disabled={limitsSaving} className={`${buttonPrimary} mt-5`}>{limitsSaving ? "Saving..." : "Save limits"}</button>
        </Card>
      </div>
    </>
  )
}
