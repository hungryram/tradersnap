"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import { finishLogin } from "@/lib/after-login"
import AuthShell from "../components/AuthShell"
import AuthPanel from "../components/AuthPanel"

// Opened by the extension right after it's installed
export default function WelcomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(!!session))
  }, [])

  const continueSignedIn = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) router.push(await finishLogin(session))
  }

  return (
    <AuthShell wide>
      <div className="text-center mb-10">
        <img src="/avatar/gif/pip-onboarding.gif" alt="Pip waving hello" width={96} height={96} className="mx-auto mb-5 h-24 w-24" />
        <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-300 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Extension installed
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">Hi, I&apos;m Pip, your trading coach</h1>
        <p className="text-ink-text max-w-lg mx-auto">
          I check your charts against your own rules and keep you disciplined while you trade. Two quick steps and we're ready.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-ink-border bg-ink-surface p-6">
          <StepLabel n={1} title="Pin Snapchart to your toolbar" />
          <p className="text-sm text-ink-text mb-5">So it's one click away on your charts.</p>
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Kbd><PuzzleIcon /></Kbd>
              <span>Click the <span className="text-ink-body font-medium">puzzle piece</span> at the top right of Chrome</span>
            </li>
            <li className="flex items-center gap-3">
              <Kbd><PinIcon /></Kbd>
              <span>Click the <span className="text-ink-body font-medium">pin</span> next to Snapchart</span>
            </li>
          </ol>
        </section>

        <section className="rounded-2xl border border-ink-border bg-ink-surface p-6">
          <StepLabel n={2} title="Create your free account" />
          {signedIn === null ? null : signedIn ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-text">You're already signed in.</p>
              <button onClick={continueSignedIn} className="w-full rounded-lg bg-brand-500 hover:bg-brand-400 text-ink-bg font-medium py-3 transition-colors">
                Continue
              </button>
            </div>
          ) : (
            <AuthPanel />
          )}
        </section>
      </div>

      <p className="text-center text-xs text-ink-muted mt-8">Free plan: 5 chart checks and 15 coach messages a day. No card needed.</p>
    </AuthShell>
  )
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-ink-bg">{n}</span>
      <h2 className="font-semibold">{title}</h2>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-border bg-ink-elevated text-ink-body">{children}</span>
}

function PuzzleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 17v5M9 3h6l-1 7 4 3v2H6v-2l4-3-1-7z" strokeLinejoin="round" />
    </svg>
  )
}
