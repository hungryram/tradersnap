"use client"

import { useEffect, useState } from "react"
import AuthShell from "../components/AuthShell"

const REASONS = [
  { id: "not_useful", label: "It didn't help my trading" },
  { id: "confusing", label: "Hard to figure out" },
  { id: "wrong_platform", label: "Doesn't work where I trade" },
  { id: "bugs", label: "Something was broken" },
  { id: "too_expensive", label: "Too expensive" },
  { id: "privacy", label: "Privacy concerns" },
  { id: "other", label: "Something else" }
]

// Chrome opens this page after the extension is removed (chrome.runtime.setUninstallURL)
export default function GoodbyePage() {
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState("")
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  // Record the uninstall right away, whether or not they answer
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t")
    if (t) fetch("/api/uninstall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t }) }).catch(() => {})
  }, [])

  async function submit() {
    if (!reason) return
    setSending(true)
    const params = new URLSearchParams(window.location.search)
    const version = params.get("v") ?? undefined
    const t = params.get("t") ?? undefined
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details: details || undefined, version, t })
    }).catch(() => {})
    setSent(true)
    setSending(false)
  }

  return (
    <AuthShell>
      {sent ? (
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Thank you</h1>
          <p className="text-ink-text">This goes straight to the person building Snapchart. Good luck out there.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-2">Sorry to see you go</h1>
            <p className="text-ink-text text-sm">One question, and it really helps: why did you remove Snapchart?</p>
          </div>
          <div className="space-y-2">
            {REASONS.map(r => (
              <button
                key={r.id}
                onClick={() => setReason(r.id)}
                className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${reason === r.id ? "border-brand-500 bg-brand-500/10 text-ink-body" : "border-ink-border bg-ink-surface text-ink-text hover:border-ink-muted"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Anything else? (optional)"
            className="w-full rounded-lg bg-ink-bg border border-ink-border px-3 py-2.5 text-ink-body placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
          <button onClick={submit} disabled={!reason || sending} className="w-full rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-ink-bg font-medium py-3 transition-colors">
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      )}
    </AuthShell>
  )
}
