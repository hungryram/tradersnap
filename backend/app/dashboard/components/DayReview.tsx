"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/dashboard-data"
import { buttonPrimary, buttonSecondary } from "./ui"

type Review = { summary: string; went_well: string[]; to_work_on: string[]; question: string; created_at?: string }
type State = { review: Review | null; limit: number; used: number; period?: "day" | "week" | null }

// "Review this day": Pip's read of one journal day (its trades and the trader's note) against their rules.
// A paid feature with a daily cap; the latest review of each day is saved.
export default function DayReview({ day, hasContent, noteUnsaved }: { day: string; hasContent: boolean; noteUnsaved: boolean }) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setState(null)
    setError(null)
    let cancelled = false
    api<State>(`/api/journal/review?day=${day}`)
      .then(data => { if (!cancelled) setState(data) })
      .catch(() => { if (!cancelled) setState({ review: null, limit: 0, used: 0, period: null }) })
    return () => { cancelled = true }
  }, [day])

  async function runReview() {
    setBusy(true)
    setError(null)
    try {
      const data = await api<State>("/api/journal/review", { method: "POST", body: JSON.stringify({ day, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
      setState(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pip couldn't review this day just now.")
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null

  // Free plans: a pointer to Pro, nothing else
  if (state.limit === 0) {
    return (
      <div className="rounded-xl border border-ink-border bg-ink-elevated/40 p-4">
        <p className="text-sm font-medium">Pip&apos;s read of this day</p>
        <p className="mt-1 text-sm text-ink-text">Pip can review any day in your journal against your rules: what held up, what slipped, and one question to take with you. It&apos;s part of <a href="/dashboard/account#plans" className="text-brand-300 hover:text-brand-200">Pro</a>.</p>
      </div>
    )
  }

  const { review } = state
  const left = Math.max(0, state.limit - state.used)
  const weekly = state.period === "week"
  // Free plans get one review a week; once it's used (and this day has none), Pro is the way to more
  const usedUp = weekly && left === 0 && !review
  return (
    <div className="rounded-xl border border-ink-border bg-ink-elevated/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Pip&apos;s read of this day</p>
        <span className="text-xs text-ink-muted">{weekly ? (left ? "1 free review a week" : "Free review used this week") : `${left} of ${state.limit} reviews left today`}</span>
      </div>

      {review ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="leading-relaxed text-ink-body">{review.summary}</p>
          {review.went_well.length > 0 && (
            <div>
              <p className="text-xs font-medium text-brand-300">What held up</p>
              <ul className="mt-1 space-y-1 text-ink-text">{review.went_well.map(item => <li key={item}>• {item}</li>)}</ul>
            </div>
          )}
          {review.to_work_on.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-300">What slipped</p>
              <ul className="mt-1 space-y-1 text-ink-text">{review.to_work_on.map(item => <li key={item}>• {item}</li>)}</ul>
            </div>
          )}
          <p className="border-t border-ink-border/70 pt-3 text-ink-body"><span className="text-ink-muted">To think about: </span>{review.question}</p>
          {review.created_at && <p className="text-xs text-ink-muted">Reviewed {new Date(review.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-text">
          {hasContent ? "Pip reads this day's trades and your note, and tells you how it went against your rules." : "Add a note or wait for a trade, then Pip can review the day."}
        </p>
      )}

      {usedUp && (
        <p className="mt-3 text-sm text-ink-text">You&apos;ve used this week&apos;s free review. <a href="/dashboard/account#plans" className="text-brand-300 hover:text-brand-200">Pro</a> gives you 5 a day, and you can review any day again.</p>
      )}
      {weekly && review && <p className="mt-3 text-xs text-ink-muted">Free plans get one review a week. <a href="/dashboard/account#plans" className="text-brand-300 hover:text-brand-200">Pro</a> lets you review any day, again and again.</p>}
      {noteUnsaved && <p className="mt-3 text-xs text-amber-300">You have an unsaved note. Save it first so Pip reads it.</p>}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

      {!(weekly && review) && !usedUp && (
        <div className="mt-3">
          <button onClick={runReview} disabled={busy || !hasContent || left === 0} className={review ? buttonSecondary : buttonPrimary}>
            {busy ? "Pip is reading the day..." : review ? "Review again" : "Review this day with Pip"}
          </button>
        </div>
      )}
    </div>
  )
}
