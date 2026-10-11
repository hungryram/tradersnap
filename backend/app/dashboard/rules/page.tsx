"use client"

import { useEffect, useState } from "react"
import RulesReview from "../components/RulesReview"
import { RULE_TEMPLATES, type RuleTemplate } from "@/lib/rule-templates"
import { api, type TradingLimits } from "@/lib/dashboard-data"
import { Card, Loading, Notice, PageHeader, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "../components/ui"

interface Ruleset {
  id: string
  name: string
  rules_text: string
  is_primary: boolean
  is_active?: boolean
}

const EMPTY_LIMITS: TradingLimits = { max_trades_per_day: null, max_daily_loss: null, stop_after_losses: null, session_start: null, session_end: null, timezone: null }
const ACTIVE_LIMIT: Record<string, number> = { free: 1, pro: 5, admin: 20 }

// Before the strategies migration, the primary ruleset is the only active one
const isOn = (r: Ruleset) => r.is_active ?? r.is_primary

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
  const [reviewing, setReviewing] = useState(false)

  const [limits, setLimits] = useState<TradingLimits>(EMPTY_LIMITS)
  const [alwaysRules, setAlwaysRules] = useState("")
  const [alwaysSaving, setAlwaysSaving] = useState(false)
  const [alwaysMessage, setAlwaysMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null)

  const maxChars = userPlan === "pro" || userPlan === "admin" ? 5000 : 1000
  const maxRulesets = userPlan === "free" ? 3 : 20
  const maxActive = ACTIVE_LIMIT[userPlan] ?? 1
  const activeCount = rulesets.filter(isOn).length

  useEffect(() => { load() }, [])

  async function load(selectId?: string) {
    try {
      const [me, data] = await Promise.all([api("/api/me"), api<{ rulesets: Ruleset[] }>("/api/rulesets")])
      setUserPlan(me.user.plan)
      setLimits({ ...EMPTY_LIMITS, ...(me.user.trading_limits ?? {}) })
      setAlwaysRules(me.user.always_rules ?? "")
      setRulesets(data.rulesets)
      const fromLink = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("strategy") : null
      const selected = data.rulesets.find(r => r.id === (selectId ?? currentRuleset?.id ?? fromLink)) ?? data.rulesets.find(r => r.is_primary) ?? data.rulesets[0] ?? null
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
    setReviewing(false)
    setShowTemplates(false)
  }

  async function run(action: () => Promise<string | void>, successText: string) {
    setMessage(null)
    setIsSaving(true)
    try {
      const selectId = await action()
      setMessage({ tone: "good", text: successText })
      await load(selectId || undefined)
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Something went wrong" })
    } finally {
      setIsSaving(false)
    }
  }

  // A new strategy from a template or a blank page (the first one becomes the main one)
  const create = (template: RuleTemplate | null) => run(async () => {
    const taken = new Set(rulesets.map(r => r.name))
    let name = template?.name ?? (rulesets.length ? "New strategy" : "My strategy")
    for (let n = 2; taken.has(name); n++) name = `${template?.name ?? "New strategy"} ${n}`
    const data = await api("/api/rulesets", {
      method: "POST",
      body: JSON.stringify({ name, rules_text: template?.rules ?? "- Write this strategy's rules here", is_primary: rulesets.length === 0 })
    })
    return data?.ruleset?.id
  }, template ? `"${template.name}" added. Edit it to match how you trade, then save.` : "New strategy added. Write its rules, then save. Pip can help you tighten them.")

  function applyTemplate(template: RuleTemplate) {
    setRulesText(template.rules)
    if (!rulesetName || rulesetName === currentRuleset?.name) setRulesetName(template.name)
    setShowTemplates(false)
    setMessage({ tone: "good", text: `"${template.name}" loaded. Edit it to match how you trade, then save.` })
  }

  const save = () => run(async () => {
    await api(`/api/rulesets/${currentRuleset!.id}`, { method: "PATCH", body: JSON.stringify({ name: rulesetName, rules_text: rulesText }) })
  }, "Strategy saved.")

  const toggleActive = (ruleset: Ruleset) => run(async () => {
    await api(`/api/rulesets/${ruleset.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !isOn(ruleset) }) })
    return ruleset.id
  }, isOn(ruleset) ? `Pip won't check charts against "${ruleset.name}" for now.` : `Pip now checks charts against "${ruleset.name}" too.`)

  const remove = () => {
    if (!currentRuleset || !confirm(`Delete the "${currentRuleset.name}" strategy?`)) return
    run(async () => {
      await api(`/api/rulesets/${currentRuleset.id}`, { method: "DELETE" })
      return rulesets.find(r => r.id !== currentRuleset.id)?.id
    }, "Strategy deleted.")
  }

  async function saveAlways() {
    setAlwaysMessage(null)
    setAlwaysSaving(true)
    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          always_rules: alwaysRules.trim() || null,
          trading_limits: { ...limits, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        })
      })
      setAlwaysMessage({ tone: "good", text: "Saved. These apply to every trade, whatever the setup." })
    } catch (err) {
      setAlwaysMessage({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't save" })
    } finally {
      setAlwaysSaving(false)
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
      <PageHeader
        title="Rules"
        subtitle="Pip checks each chart against whichever of your strategies fits it, plus your rules for every trade."
      />

      <div className="space-y-6">
        {/* Strategies */}
        <Card
          title="Your strategies"
          action={rulesets.length > 0 ? <span className="text-xs text-ink-muted">{activeCount} of {maxActive} on{userPlan === "free" ? <> · <a href="/dashboard/account#plans" className="text-brand-300 hover:text-brand-200">Pro checks up to 5</a></> : null}</span> : undefined}
        >
          {rulesets.length === 0 ? (
            <>
              <p className="mb-4 text-sm text-ink-text">
                A strategy is one setup you trade, with its own entry, stop and target rules. Start from the closest template or a blank page. You can also ask
                Pip in the chat to help you write it.
              </p>
              <TemplateGrid onPick={create} disabled={isSaving} />
            </>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {rulesets.map(r => (
                  <div key={r.id} className={`flex items-center gap-2 rounded-xl border py-1.5 pl-3 pr-1.5 ${currentRuleset?.id === r.id ? "border-brand-500/60 bg-brand-500/10" : "border-ink-border"}`}>
                    <button onClick={() => select(r)} className="text-sm font-medium">{r.name}</button>
                    {r.is_primary && <span className="rounded bg-ink-elevated px-1.5 py-0.5 text-[10px] text-ink-muted" title="Pip's chat saves here when no strategy is named">Main</span>}
                    <Switch on={isOn(r)} onClick={() => toggleActive(r)} disabled={isSaving} label={isOn(r) ? `Turn ${r.name} off` : `Turn ${r.name} on`} />
                  </div>
                ))}
                {rulesets.length < maxRulesets && (
                  <button onClick={() => create(null)} disabled={isSaving} className="rounded-xl border border-dashed border-ink-border px-3 py-1.5 text-sm text-ink-text hover:border-ink-muted hover:text-ink-body">
                    + New strategy
                  </button>
                )}
              </div>
              <p className="-mt-2 text-xs text-ink-muted">Switched on: Pip checks charts against it. Off: kept, but ignored.</p>

              {currentRuleset && (
                <div className="space-y-4 border-t border-ink-border pt-5">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-ink-text">Strategy name</span>
                    <input value={rulesetName} onChange={e => setRulesetName(e.target.value)} placeholder="e.g. Opening range breakout" className={inputClass} />
                  </label>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs text-ink-text">Rules <span className="text-ink-muted">({rulesText.length}/{maxChars})</span></span>
                      <div className="flex items-center gap-4">
                        <button onClick={() => { setReviewing(true); setShowTemplates(false) }} className="text-sm text-brand-300 hover:text-brand-200">Tighten with Pip</button>
                        <button onClick={() => setShowTemplates(!showTemplates)} className="text-sm text-brand-300 hover:text-brand-200">
                          {showTemplates ? "Hide templates" : "Start from a template"}
                        </button>
                      </div>
                    </div>

                    {reviewing && <RulesReview rulesText={rulesText} setRulesText={setRulesText} onDone={() => setReviewing(false)} />}
                    {showTemplates && <div className="mb-3"><TemplateGrid onPick={t => t && applyTemplate(t)} disabled={false} hideBlank /></div>}

                    <textarea
                      value={rulesText}
                      onChange={e => setRulesText(e.target.value)}
                      maxLength={maxChars}
                      rows={14}
                      placeholder="Entry, stop and target rules for this setup."
                      className={`${inputClass} font-mono leading-relaxed`}
                    />
                    <p className="mt-2 text-xs text-ink-muted">
                      Specific rules work best. <span className="text-green-400">Good:</span> &quot;Wait for a 5-min close above resistance, enter on the next candle.&quot;{" "}
                      <span className="text-red-400">Vague:</span> &quot;Be patient.&quot; Rules for every setup belong below, under Rules for every trade.
                    </p>
                  </div>

                  {message && <Notice tone={message.tone}>{message.text}</Notice>}

                  <div className="flex flex-wrap gap-2">
                    <button onClick={save} disabled={isSaving} className={buttonPrimary}>{isSaving ? "Saving..." : "Save strategy"}</button>
                    {rulesets.length > 1 && !currentRuleset.is_primary && (
                      <button onClick={remove} disabled={isSaving} className={`${buttonDanger} sm:ml-auto`}>Delete strategy</button>
                    )}
                  </div>
                  {rulesets.length >= maxRulesets && userPlan === "free" && (
                    <p className="text-xs text-ink-muted">Free plan holds {maxRulesets} strategies. <a href="/dashboard/account#plans" className="text-brand-300 hover:text-brand-200">Pro holds 20.</a></p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Rules for every trade */}
        <div id="limits" className="scroll-mt-8">
          <Card title="Rules for every trade">
            <p className="-mt-2 mb-5 text-sm text-ink-text">Discipline and risk rules that apply whatever the setup. Pip checks these on every chart and tracks the limits against your trades.</p>
            <label className="block">
              <span className="mb-1.5 block text-xs text-ink-text">Always</span>
              <textarea
                value={alwaysRules}
                onChange={e => setAlwaysRules(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder={"- Never move my stop further away\n- No trades in the first 5 minutes after the open\n- Risk no more than 1% of the account per trade"}
                className={`${inputClass} font-mono leading-relaxed`}
              />
            </label>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
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
            {alwaysMessage && <div className="mt-4"><Notice tone={alwaysMessage.tone}>{alwaysMessage.text}</Notice></div>}
            <button onClick={saveAlways} disabled={alwaysSaving} className={`${buttonPrimary} mt-5`}>{alwaysSaving ? "Saving..." : "Save rules for every trade"}</button>
          </Card>
        </div>
      </div>
    </>
  )
}

function TemplateGrid({ onPick, disabled, hideBlank = false }: { onPick: (template: RuleTemplate | null) => void; disabled: boolean; hideBlank?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {RULE_TEMPLATES.map(template => (
        <button key={template.name} onClick={() => onPick(template)} disabled={disabled} className="rounded-xl border border-ink-border bg-ink-bg p-3 text-left transition-colors hover:border-ink-muted disabled:opacity-50">
          <div className="text-sm font-medium">{template.name}</div>
          <div className="mt-0.5 text-xs text-ink-text">{template.description.replace(/ - .*$/, "")}</div>
        </button>
      ))}
      {!hideBlank && (
        <button onClick={() => onPick(null)} disabled={disabled} className="rounded-xl border border-dashed border-ink-border p-3 text-left transition-colors hover:border-ink-muted disabled:opacity-50">
          <div className="text-sm font-medium">Write my own</div>
          <div className="mt-0.5 text-xs text-ink-text">Start from a blank page.</div>
        </button>
      )}
    </div>
  )
}

function Switch({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-brand-500" : "bg-ink-border"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  )
}
