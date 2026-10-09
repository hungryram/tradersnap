"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import { finishLogin } from "@/lib/after-login"

type Mode = "start" | "code" | "password" | "reset-sent" | "confirm-sent"

// Turn on after enabling the Google provider in Supabase (Auth -> Providers -> Google)
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"

// Google first, then an emailed sign-in link (or code), then email + password for people who prefer it
export default function AuthPanel({ intro }: { intro?: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>("start")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [passwordAction, setPasswordAction] = useState<"signin" | "signup">("signin")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const signInWithGoogle = () => run(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/success` }
    })
    if (error) throw error
    // The browser leaves for Google here
  })

  const sendCode = () => run(async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/success` }
    })
    if (error) throw error
    setCode("")
    setMode("code")
  })

  const verifyCode = () => run(async () => {
    const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" })
    if (error) throw new Error("That code didn't work. Check the latest email or send a new one.")
    if (!data.session) throw new Error("Couldn't sign you in. Please try again.")
    router.push(await finishLogin(data.session))
  })

  const signInWithPassword = () => run(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error("Wrong email or password.")
    router.push(await finishLogin(data.session))
  })

  const signUpWithPassword = () => run(async () => {
    if (password.length < 8) throw new Error("Use at least 8 characters for your password.")
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/success` }
    })
    if (error) {
      if (/already (registered|exists)/i.test(error.message)) {
        setPasswordAction("signin")
        throw new Error("This email already has an account. Sign in instead.")
      }
      throw error
    }
    // Supabase answers an existing email with a user that has no identities
    if (data.user && !data.session && data.user.identities?.length === 0) {
      setPasswordAction("signin")
      throw new Error("This email already has an account. Sign in instead.")
    }
    if (data.session) router.push(await finishLogin(data.session))
    else setMode("confirm-sent")
  })

  const sendReset = () => run(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`
    })
    if (error) throw error
    setMode("reset-sent")
  })

  const input = "w-full rounded-lg bg-ink-bg border border-ink-border px-4 py-3 text-ink-body placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent"
  const primary = "w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 transition-colors"
  const link = "text-sm text-ink-text hover:text-ink-body underline-offset-4 hover:underline"

  return (
    <div className="w-full">
      {intro && <p className="text-ink-text text-sm mb-6">{intro}</p>}

      {mode === "start" && (
        <div className="space-y-4">
          {GOOGLE_ENABLED && <>
          <button
            onClick={signInWithGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-900 font-medium py-3 transition-colors"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <div className="h-px flex-1 bg-ink-border" />
            or use your email
            <div className="h-px flex-1 bg-ink-border" />
          </div>
          </>}

          <form onSubmit={e => { e.preventDefault(); sendCode() }} className="space-y-3">
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={input} autoComplete="email" />
            <button type="submit" disabled={busy || !email} className={primary}>
              {busy ? "Sending..." : "Email me a sign-in link"}
            </button>
          </form>

          <div className="text-center">
            <button onClick={() => { setError(null); setMode("password") }} className={link}>
              Use a password instead
            </button>
          </div>
        </div>
      )}

      {mode === "code" && (
        <form onSubmit={e => { e.preventDefault(); verifyCode() }} className="space-y-4">
          <p className="text-sm text-ink-text">
            Check your inbox: we sent a sign-in link to <span className="text-ink-body font-medium">{email}</span>. Click it to continue. If the email shows a 6-digit code instead, enter it here.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className={`${input} text-center text-2xl tracking-[0.5em]`}
          />
          <button type="submit" disabled={busy || code.length !== 6} className={primary}>
            {busy ? "Checking..." : "Continue"}
          </button>
          <div className="flex justify-between">
            <button type="button" onClick={() => setMode("start")} className={link}>← Different email</button>
            <button type="button" onClick={sendCode} disabled={busy} className={link}>Send it again</button>
          </div>
        </form>
      )}

      {mode === "password" && (
        <form onSubmit={e => { e.preventDefault(); passwordAction === "signup" ? signUpWithPassword() : signInWithPassword() }} className="space-y-3">
          <div className="grid grid-cols-2 rounded-lg border border-ink-border p-1 text-sm">
            {(["signin", "signup"] as const).map(action => (
              <button
                key={action}
                type="button"
                onClick={() => { setError(null); setPasswordAction(action) }}
                className={`rounded-md py-2 transition-colors ${passwordAction === action ? "bg-ink-elevated text-ink-body" : "text-ink-text hover:text-ink-body"}`}
              >
                {action === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={input} autoComplete="email" />
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={passwordAction === "signup" ? "Password (8+ characters)" : "Password"}
            className={input}
            autoComplete={passwordAction === "signup" ? "new-password" : "current-password"}
          />
          <button type="submit" disabled={busy || !email || !password} className={primary}>
            {busy ? "One moment..." : passwordAction === "signup" ? "Create account" : "Sign in"}
          </button>
          <div className="flex justify-between">
            <button type="button" onClick={() => setMode("start")} className={link}>← Other ways to sign in</button>
            {passwordAction === "signin" && (
              <button type="button" onClick={sendReset} disabled={busy || !email} className={link}>Forgot password?</button>
            )}
          </div>
        </form>
      )}

      {mode === "confirm-sent" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-text">
            Almost done: we sent a confirmation link to <span className="text-ink-body font-medium">{email}</span>. Click it to finish creating your account.
          </p>
          <button onClick={() => { setPasswordAction("signin"); setMode("password") }} className={link}>← Back to sign in</button>
        </div>
      )}

      {mode === "reset-sent" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-text">If <span className="text-ink-body font-medium">{email}</span> has an account, a password reset link is on its way.</p>
          <button onClick={() => setMode("start")} className={link}>← Back</button>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <p className="mt-6 text-xs text-ink-muted text-center">
        By continuing you agree to the{" "}
        <a href="https://www.snapchartapp.com/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a> and{" "}
        <a href="https://www.snapchartapp.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>.
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
