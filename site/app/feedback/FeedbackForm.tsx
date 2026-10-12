"use client"

import { useState } from "react"
import { APP_URL, SUPPORT_EMAIL } from "../links"

type Kind = "bug" | "idea" | "other"

const KINDS: { value: Kind; label: string; placeholder: string }[] = [
  { value: "bug", label: "Something's broken", placeholder: "What happened, what you expected, and which platform you were on (TradingView, Tradovate, TopstepX…)." },
  { value: "idea", label: "I have an idea", placeholder: "What would make Pip more useful to you?" },
  { value: "other", label: "Something else", placeholder: "What's on your mind?" }
]

export default function FeedbackForm({ initialKind, source, version }: { initialKind: Kind; source?: string; version?: string }) {
  const [kind, setKind] = useState<Kind>(initialKind)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [website, setWebsite] = useState("") // hidden; real people leave it empty
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState("sending")
    setError(null)
    try {
      const response = await fetch(`${APP_URL}/api/feedback/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, email, website, source, version })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || "Couldn't send that. Please try again.")
        setState("idle")
        return
      }
      setState("sent")
    } catch {
      setError(`Couldn't send that. Check your connection, or email ${SUPPORT_EMAIL}.`)
      setState("idle")
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl border border-ink-border bg-ink-surface p-8 text-center">
        <h2 className="text-xl font-semibold">Thanks, we got it.</h2>
        <p className="mt-2 text-ink-text">{email ? "We'll reply to your email if we need more detail." : "We read every message."}</p>
        <a href="/" className="mt-6 inline-block text-sm font-medium text-brand-300 hover:underline">Back to the site</a>
      </div>
    )
  }

  const current = KINDS.find(k => k.value === kind)!
  const field = "mt-2 w-full rounded-xl border border-ink-border bg-ink-bg px-4 py-3 text-ink-body placeholder:text-ink-muted focus:border-brand-400 focus:outline-none"

  return (
    <form onSubmit={submit} className="rounded-2xl border border-ink-border bg-ink-surface p-6 sm:p-8">
      <fieldset>
        <legend className="text-sm font-medium">What kind of message is this?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {KINDS.map(k => (
            <label key={k.value} className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${kind === k.value ? "border-brand-400 bg-brand-500/15 text-brand-300" : "border-ink-border text-ink-text hover:text-ink-body"}`}>
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 block text-sm font-medium">
        Your message
        <textarea required minLength={5} maxLength={2000} rows={6} value={message} onChange={e => setMessage(e.target.value)} placeholder={current.placeholder} className={field} />
      </label>

      <label className="mt-5 block text-sm font-medium">
        Your email <span className="font-normal text-ink-muted">(optional, only if you want a reply)</span>
        <input type="email" maxLength={200} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={field} />
      </label>

      {/* Bots tend to fill every field */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <button type="submit" disabled={state === "sending"} className="mt-6 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-ink-bg transition-colors hover:bg-brand-400 disabled:opacity-60">
        {state === "sending" ? "Sending…" : "Send"}
      </button>
      {version && <p className="mt-4 text-xs text-ink-muted">Sent from the Pip extension, version {version}.</p>}
    </form>
  )
}
