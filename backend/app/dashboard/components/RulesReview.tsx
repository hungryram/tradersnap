"use client"

import { useState } from "react"
import { api } from "@/lib/dashboard-data"
import Pip from "../../components/Pip"
import { buttonPrimary, buttonSecondary, inputClass } from "./ui"

type Suggestion = { type: "rewrite" | "add"; original: string | null; why: string; suggestion: string }
type Review = { summary: string; suggestions: Suggestion[] }

// "Tighten my rules": Pip suggests checkable versions of vague rules. Accepting a
// suggestion edits the text in the editor; nothing is saved until "Save changes".
export default function RulesReview({ rulesText, setRulesText, onDone }: {
  rulesText: string
  setRulesText: (text: string) => void
  onDone: () => void
}) {
  const [review, setReview] = useState<Review | null>(null)
  const [drafts, setDrafts] = useState<string[]>([])
  const [handled, setHandled] = useState<Record<number, "accepted" | "skipped">>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setLoading(true)
    setError(null)
    setHandled({})
    try {
      const data = await api<Review>("/api/rules/review", { method: "POST", body: JSON.stringify({ rules_text: rulesText }) })
      setReview(data)
      setDrafts(data.suggestions.map(s => s.suggestion))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pip couldn't review your rules just now.")
    } finally {
      setLoading(false)
    }
  }

  function accept(index: number) {
    const s = review!.suggestions[index]
    const text = drafts[index].trim()
    if (!text) return
    const next = s.type === "rewrite" && s.original && rulesText.includes(s.original)
      ? rulesText.replace(s.original, text)
      : `${rulesText.replace(/\s+$/, "")}\n${text}`
    setRulesText(next)
    setHandled(h => ({ ...h, [index]: "accepted" }))
  }

  if (!review) {
    return (
      <div className="mb-3 flex items-center gap-4 rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
        <Pip size={40} mood={loading ? "thinking" : "idle"} />
        <div className="flex-1 text-sm">
          {loading ? (
            <p className="text-ink-body">Reading your rules…</p>
          ) : error ? (
            <p className="text-red-300">{error}</p>
          ) : (
            <p className="text-ink-text">
              I&apos;ll point out rules I can&apos;t check on a chart and suggest clearer versions, plus any discipline rules you&apos;re missing.
              Nothing changes until you accept a suggestion and save.
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={onDone} className={buttonSecondary} disabled={loading}>Cancel</button>
          <button onClick={start} className={buttonPrimary} disabled={loading || !rulesText.trim()}>{error ? "Try again" : "Review my rules"}</button>
        </div>
      </div>
    )
  }

  const open = review.suggestions.filter((_, i) => !handled[i]).length
  return (
    <div className="mb-3 space-y-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
      <div className="flex items-start gap-3">
        <Pip size={36} mood={review.suggestions.length ? "idle" : "happy"} />
        <p className="flex-1 pt-1 text-sm leading-relaxed text-ink-body">{review.summary}</p>
      </div>

      {review.suggestions.map((s, i) => handled[i] ? null : (
        <div key={i} className="rounded-lg border border-ink-border bg-ink-bg p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{s.type === "rewrite" ? "Make it checkable" : "Worth adding"}</p>
          {s.original && <p className="mb-2 text-sm text-ink-muted line-through decoration-ink-muted/60">{s.original}</p>}
          <input value={drafts[i]} onChange={e => setDrafts(d => d.map((v, j) => j === i ? e.target.value : v))} className={`${inputClass} font-mono`} />
          <p className="mt-2 text-xs text-ink-text">{s.why}</p>
          {s.suggestion.includes("[") && <p className="mt-1 text-xs text-amber-300">Fill in the part in [brackets] with what you actually do.</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => accept(i)} className={buttonPrimary}>{s.type === "rewrite" ? "Use this" : "Add it"}</button>
            <button onClick={() => setHandled(h => ({ ...h, [i]: "skipped" }))} className={buttonSecondary}>Skip</button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {open > 0 ? `${open} suggestion${open === 1 ? "" : "s"} left.` : Object.values(handled).includes("accepted") ? "Done. Remember to save your changes below." : "All done."}
        </p>
        <button onClick={onDone} className={buttonSecondary}>Close</button>
      </div>
    </div>
  )
}
