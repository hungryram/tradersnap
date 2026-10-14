import Pip from "./Pip"

// The "Details" of a chart check, designed around what a trader asks next:
// which of my rules does this pass, where are the levels, and what does Pip see.

type Check = { rule: string; status: "pass" | "fail" | "unclear"; note?: string }
type Level = { label: string; type?: string; relative_location?: string; why_it_matters?: string }

export type CheckAnalysis = {
  setup_status?: string
  summary?: string
  wait_for?: string[]
  levels_to_watch?: Level[]
  rule_checks?: Check[]
  self_check_rules?: string[]
  bullets?: string[]
  behavioral_nudge?: string
}

// How far along the pre-trade checklist is: chart rules that pass plus "your call" items ticked
export function checklistProgress(analysis: CheckAnalysis, ticked: number[] = []) {
  const checks = analysis.rule_checks ?? []
  const selfChecks = analysis.self_check_rules ?? []
  const done = checks.filter(c => c.status === "pass").length + ticked.filter(i => i < selfChecks.length).length
  return { done, total: checks.length + selfChecks.length }
}

export function ChecklistMeter({ done, total, dark }: { done: number; total: number; dark: boolean }) {
  if (!total) return null
  return (
    <span className="flex items-center gap-1.5">
      <span className={`relative h-1.5 w-12 overflow-hidden rounded-full ${dark ? "bg-dark-border" : "bg-slate-200"}`}>
        <span className={`absolute inset-y-0 left-0 rounded-full ${done === total ? "bg-blue-500" : "bg-blue-500/70"}`} style={{ width: `${(done / total) * 100}%` }} />
      </span>
      <span className="tabular-nums">{done}/{total}</span>
    </span>
  )
}

const STATUS = {
  pass: { icon: "✓", label: "Lines up", dark: "text-green-400", light: "text-green-600" },
  fail: { icon: "✗", label: "Not yet", dark: "text-red-400", light: "text-red-600" },
  unclear: { icon: "?", label: "Can't tell from the chart", dark: "text-amber-300", light: "text-amber-600" },
} as const

const LEVEL_COLOR: Record<string, string> = {
  support: "bg-green-500",
  resistance: "bg-red-500",
  invalidation: "bg-orange-500",
}

// "31,150 reclaim level" -> { price: "31,150", text: "reclaim level", value: 31150 }
function splitLevel(label: string) {
  const match = label.match(/^\s*([\d,]+(?:\.\d+)?)\s*(.*)$/)
  if (!match) return { price: null, text: label, value: null }
  return { price: match[1], text: match[2], value: Number(match[1].replace(/,/g, "")) }
}

export default function CheckDetails({ analysis, dark, ticked, onTick, skipFirstWaitFor }: {
  analysis: CheckAnalysis
  dark: boolean
  ticked: number[]
  onTick: (index: number) => void
  skipFirstWaitFor: boolean
}) {
  const muted = dark ? "text-dark-text" : "text-slate-500"
  const strong = dark ? "text-dark-body" : "text-slate-900"
  const panel = dark ? "bg-dark-surface/60 border-dark-border" : "bg-slate-50 border-slate-200"
  const heading = `mb-2 text-[11px] font-semibold uppercase tracking-wide ${muted}`

  const checks = analysis.rule_checks ?? []
  const selfChecks = analysis.self_check_rules ?? []
  const { done, total } = checklistProgress(analysis, ticked)
  const complete = total > 0 && done === total && analysis.setup_status === "aligned"
  const moreWaitFor = (analysis.wait_for ?? []).slice(skipFirstWaitFor ? 1 : 0)

  // Order chart rules: what's blocking first, then unclear, then what already lines up
  const order = { fail: 0, unclear: 1, pass: 2 } as const
  const sortedChecks = [...checks].sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1))

  // Price ladder: levels above price (highest first), "price now", then levels below
  const levels = (analysis.levels_to_watch ?? []).map(l => ({ ...l, ...splitLevel(l.label) }))
  // Placement from Pip's read; without one, resistance sits above price and the rest below
  const where = (l: Level) => (l.relative_location ?? "").toLowerCase()
    || (l.type === "resistance" || l.type === "breakout_level" ? "above" : "below")
  const byPriceDesc = (a: { value: number | null }, b: { value: number | null }) => (b.value ?? 0) - (a.value ?? 0)
  const above = levels.filter(l => where(l).includes("above")).sort(byPriceDesc)
  const at = levels.filter(l => where(l).includes("at"))
  const below = levels.filter(l => !where(l).includes("above") && !where(l).includes("at")).sort(byPriceDesc)

  const LevelRow = ({ level }: { level: (typeof levels)[number] }) => (
    <div className="flex items-baseline gap-2 py-1">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${LEVEL_COLOR[level.type ?? ""] ?? "bg-blue-500"}`} />
      {level.price && <span className={`font-semibold tabular-nums ${strong}`}>{level.price}</span>}
      <span className="min-w-0 flex-1">
        <span className={strong}>{level.text}</span>
        {level.why_it_matters && <span className={`ml-1 ${muted}`}>· {level.why_it_matters}</span>}
      </span>
    </div>
  )

  return (
    <div className="mt-3 space-y-3 text-[13px]">
      {/* The pre-trade checklist */}
      {total > 0 && (
        <div className={`rounded-lg border p-3 ${panel}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>Your checklist</span>
            <span className={`text-[11px] ${muted}`}><ChecklistMeter done={done} total={total} dark={dark} /></span>
          </div>

          {sortedChecks.length > 0 && (
            <ul className="space-y-2">
              {sortedChecks.map((check, idx) => {
                const s = STATUS[check.status] ?? STATUS.unclear
                return (
                  <li key={idx} className="flex gap-2.5">
                    <span className={`mt-px w-3 shrink-0 text-center font-bold ${dark ? s.dark : s.light}`} title={s.label}>{s.icon}</span>
                    <div className="min-w-0">
                      <div className={strong}>{check.rule}</div>
                      <div className={`text-[12px] ${muted}`}>
                        <span className={dark ? s.dark : s.light}>{s.label}</span>
                        {check.note ? <> · {check.note}</> : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {selfChecks.length > 0 && (
            <div className={sortedChecks.length ? `mt-3 border-t pt-3 ${dark ? "border-dark-border" : "border-slate-200"}` : ""}>
              <div className={`mb-1.5 text-[11px] ${muted}`}>Your call (a chart can&apos;t show these)</div>
              <ul className="space-y-1">
                {selfChecks.map((rule, idx) => {
                  const on = ticked.includes(idx)
                  return (
                    <li key={idx}>
                      <button onClick={() => onTick(idx)} className={`flex w-full items-center gap-2.5 rounded-md px-1 py-1 text-left ${dark ? "hover:bg-dark-elevated" : "hover:bg-slate-100"}`}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${on ? "border-blue-500 bg-blue-500 text-white" : dark ? "border-dark-border" : "border-slate-300"}`}>
                          {on ? "✓" : ""}
                        </span>
                        <span className={on ? `${muted} line-through` : strong}>{rule}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {complete && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-blue-400">
              <Pip size={20} mood="happy" animated={false} />
              Checklist complete. This is the setup you wrote down.
            </div>
          )}
        </div>
      )}

      {/* What else needs to happen */}
      {moreWaitFor.length > 0 && (
        <div>
          <div className={heading}>{skipFirstWaitFor ? "Also waiting for" : "Wait for"}</div>
          <ul className="space-y-1">
            {moreWaitFor.map((item, idx) => (
              <li key={idx} className="flex gap-2"><span className={muted}>›</span><span className={strong}>{item}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Price ladder */}
      {levels.length > 0 && (
        <div>
          <div className={heading}>Levels</div>
          <div className={`rounded-lg border px-3 py-1.5 ${panel}`}>
            {above.map((level, idx) => <LevelRow key={`a${idx}`} level={level} />)}
            <div className="my-1 flex items-center gap-2">
              <span className="h-px flex-1 bg-blue-500/60" />
              <span className="text-[11px] font-semibold text-blue-400">Price now</span>
              <span className="h-px flex-1 bg-blue-500/60" />
            </div>
            {at.map((level, idx) => <LevelRow key={`n${idx}`} level={level} />)}
            {below.map((level, idx) => <LevelRow key={`b${idx}`} level={level} />)}
          </div>
        </div>
      )}

      {/* More from Pip (his one-line read is on the card itself) */}
      {(analysis.bullets?.length ?? 0) > 0 && (
        <div className="flex gap-2.5">
          <Pip size={22} mood="idle" animated={false} />
          <div className="min-w-0">
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${muted}`}>More from Pip</div>
            <p className={`leading-relaxed ${strong}`}>
              {(analysis.bullets ?? [])
                .filter(Boolean)
                .map(t => (/[.!?]$/.test(t!.trim()) ? t!.trim() : `${t!.trim()}.`))
                .join(" ")}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
