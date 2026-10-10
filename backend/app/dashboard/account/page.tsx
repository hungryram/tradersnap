"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/dashboard-data"
import { createClient } from "@/lib/supabase-client"
import { signOutExtension } from "@/lib/extension-bridge"
import UsageMeter, { type Credits } from "../components/UsageMeter"
import { Card, Loading, Notice, PageHeader, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "../components/ui"

interface UserData {
  user: {
    email: string
    first_name: string | null
    last_name: string | null
    plan: string
    subscription_status: string
    created_at: string
  }
  usage: {
    messages: { used: number; limit: number }
    screenshots: { used: number; limit: number }
    favorites: { used: number; limit: number }
    credits?: Credits
    canBuyMore?: boolean
  }
}

const PLANS = {
  free: ["15 coach messages a day", "5 chart checks a day", "Trade tracking and journal", "Coach remembers 3 saved messages", "3 rulesets"],
  pro: ["200 coach messages a day", "50 chart checks a day", "Trade tracking and journal", "Coach remembers 20 saved messages", "20 rulesets", "Longer, more detailed answers"],
}

export default function AccountPage() {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [profileMessage, setProfileMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteReason, setDeleteReason] = useState("")
  const [deleteDetails, setDeleteDetails] = useState("")

  useEffect(() => { load() }, [])

  // Back from a top-up checkout
  const [topupDone] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("topup") === "success")

  async function load() {
    try {
      const data = await api<UserData>("/api/me")
      setUserData(data)
      setFirstName(data.user.first_name || "")
      setLastName(data.user.last_name || "")
      setEmail(data.user.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account")
    }
  }

  async function saveProfile() {
    setBusy(true)
    setProfileMessage(null)
    try {
      const data = await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() !== userData?.user.email ? email.trim() : undefined
        })
      })
      setProfileMessage({ tone: "good", text: data.message || "Profile saved." })
      setEditing(false)
      await load()
    } catch {
      setProfileMessage({ tone: "bad", text: "Couldn't save your profile." })
    } finally {
      setBusy(false)
    }
  }

  async function openBillingPortal() {
    setBusy(true)
    try {
      const data = await api("/api/billing/portal", { method: "POST" })
      window.open(data.url, "_blank")
    } catch {
      alert("Couldn't open the billing portal. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function upgrade() {
    setBusy(true)
    try {
      const data = await api("/api/checkout", { method: "POST", body: JSON.stringify({ plan: "pro" }) })
      window.location.href = data.url
    } catch (err) {
      // Already subscribed: manage it instead
      if (err instanceof Error && /already/i.test(err.message)) await openBillingPortal()
      else alert("Couldn't start checkout. Please try again.")
      setBusy(false)
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api("/api/account/delete", { method: "POST", body: JSON.stringify({ confirm: deleteConfirm, reason: deleteReason || undefined, details: deleteDetails || undefined }) })
      await signOutExtension()
      await createClient().auth.signOut().catch(() => {})
      window.location.href = "/?deleted=1"
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete your account.")
      setDeleting(false)
    }
  }

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!userData) return <Loading />

  const { user, usage } = userData
  const isPro = user.plan === "pro" || user.plan === "admin"
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim()

  return (
    <>
      <PageHeader title="Account" subtitle={`Member since ${new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`} />

      <div className="space-y-6">
        <Card title="Profile" action={!editing && <button onClick={() => setEditing(true)} className="text-sm text-brand-300 hover:text-brand-200">Edit</button>}>
          {profileMessage && <div className="mb-4"><Notice tone={profileMessage.tone}>{profileMessage.text}</Notice></div>}
          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs text-ink-text">First name</span>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={50} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-ink-text">Last name</span>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} maxLength={50} className={inputClass} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs text-ink-text">Email</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                <span className="mt-1 block text-xs text-ink-muted">Changing your email sends a confirmation link to the new address.</span>
              </label>
              <div className="flex gap-2">
                <button onClick={saveProfile} disabled={busy} className={buttonPrimary}>{busy ? "Saving..." : "Save"}</button>
                <button
                  onClick={() => { setEditing(false); setFirstName(user.first_name || ""); setLastName(user.last_name || ""); setEmail(user.email); setProfileMessage(null) }}
                  disabled={busy}
                  className={buttonSecondary}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-ink-muted">Name</dt><dd className="mt-0.5">{name || <span className="text-ink-muted">Not set</span>}</dd></div>
              <div><dt className="text-xs text-ink-muted">Email</dt><dd className="mt-0.5 break-all">{user.email}</dd></div>
              <div><dt className="text-xs text-ink-muted">Plan</dt><dd className="mt-0.5">{user.plan === "admin" ? "Admin" : isPro ? "Pro" : "Free"}</dd></div>
            </dl>
          )}
        </Card>

        <Card title="Usage today">
          {topupDone && <div className="mb-4"><Notice tone="good">Thanks! Your extra usage is added. It's used after your daily allowance and never expires.</Notice></div>}
          {usage.credits ? (
            <div className="grid gap-6 sm:grid-cols-[2fr_1fr]">
              <UsageMeter credits={usage.credits} plan={user.plan} canBuyMore={!!usage.canBuyMore} />
              <UsageBar label="Saved messages your coach remembers" used={usage.favorites.used} max={usage.favorites.limit} />
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-3">
              <UsageBar label="Coach messages" used={usage.messages.used} max={usage.messages.limit} />
              <UsageBar label="Chart checks" used={usage.screenshots.used} max={usage.screenshots.limit} />
              <UsageBar label="Saved messages your coach remembers" used={usage.favorites.used} max={usage.favorites.limit} />
            </div>
          )}
          <p className="mt-4 text-xs text-ink-muted">Daily allowance resets at midnight UTC. A chart check uses more of it than a message.</p>
        </Card>

        <div id="plans" className="scroll-mt-8">
          <Card title="Plan">
            <div className="grid gap-4 md:grid-cols-2">
              <PlanCard name="Free" price="$0" features={PLANS.free} current={!isPro} />
              <PlanCard
                name="Pro"
                price="$19"
                was="$49"
                badge="Launch price"
                features={PLANS.pro}
                current={isPro}
                highlight
                action={!isPro && <button onClick={upgrade} disabled={busy} className={`${buttonPrimary} w-full`}>{busy ? "Loading..." : "Upgrade to Pro"}</button>}
              />
            </div>
            {isPro && user.plan !== "admin" && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-border pt-5">
                <p className="text-sm text-ink-text">Payment method, invoices and cancellation are in the billing portal.</p>
                <button onClick={openBillingPortal} disabled={busy} className={buttonSecondary}>{busy ? "Loading..." : "Manage billing"}</button>
              </div>
            )}
          </Card>
        </div>

        <Card title="Chrome extension">
          <p className="mb-4 text-sm text-ink-text">Snapchart lives on your charts. If you use a new browser or computer, install it there and sign in.</p>
          <a
            href={process.env.NEXT_PUBLIC_CHROME_STORE_URL || "https://chromewebstore.google.com/detail/snapchart-trading-psychol/bppbpeodpbepcmjifjjihejcnofdnibe"}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonSecondary}
          >
            Chrome Web Store
          </a>
        </Card>

        {user.plan !== "admin" && (
          <Card title="Delete account">
            {!deleteOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-text">Permanently delete your account and all your data. This can't be undone.</p>
                <button onClick={() => setDeleteOpen(true)} className={buttonDanger}>Delete account</button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-ink-text">This immediately and permanently deletes:</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-text">
                  <li>Your account and profile</li>
                  <li>Your rules and daily limits</li>
                  <li>Your chat history and saved messages</li>
                  <li>Your detected trades and journal</li>
                  <li>Your usage history and ratings</li>
                </ul>
                {isPro && <Notice tone="warn">Your Pro subscription is canceled right away, so you won't be charged again.</Notice>}
                <p className="text-xs text-ink-muted">Stripe keeps its own payment records (invoices) as required for taxes. Chats saved in the extension on this computer are cleared when it signs out.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-ink-text">Why are you leaving? (optional)</span>
                    <select value={deleteReason} onChange={e => setDeleteReason(e.target.value)} className={inputClass}>
                      <option value="">Prefer not to say</option>
                      <option value="not_useful">It didn't help my trading</option>
                      <option value="confusing">Hard to figure out</option>
                      <option value="wrong_platform">Doesn't work where I trade</option>
                      <option value="bugs">Something was broken</option>
                      <option value="too_expensive">Too expensive</option>
                      <option value="privacy">Privacy concerns</option>
                      <option value="other">Something else</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-ink-text">Anything else? (optional)</span>
                    <input value={deleteDetails} onChange={e => setDeleteDetails(e.target.value)} maxLength={500} className={inputClass} />
                  </label>
                </div>
                <p className="text-xs text-ink-muted">Your answer is kept without your name or email, so we can improve Snapchart.</p>
                <label className="block max-w-xs">
                  <span className="mb-1.5 block text-xs text-ink-text">Type DELETE to confirm</span>
                  <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} className={inputClass} autoComplete="off" />
                </label>
                {deleteError && <Notice tone="bad">{deleteError}</Notice>}
                <div className="flex gap-2">
                  <button onClick={deleteAccount} disabled={deleteConfirm !== "DELETE" || deleting} className={buttonDanger}>
                    {deleting ? "Deleting..." : "Delete my account"}
                  </button>
                  <button onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); setDeleteError(null) }} disabled={deleting} className={buttonSecondary}>Cancel</button>
                </div>
              </div>
            )}
          </Card>
        )}

        <p className="text-center text-xs text-ink-muted">
          <a href="https://www.snapchartapp.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-ink-body">Privacy Policy</a>
          {" · "}
          <a href="https://www.snapchartapp.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-ink-body">Terms of Service</a>
        </p>
      </div>
    </>
  )
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const ratio = max > 0 ? Math.min(used / max, 1) : 0
  return (
    <div>
      <div className="mb-1.5 flex justify-between gap-2 text-sm">
        <span className="text-ink-text">{label}</span>
        <span className="tabular-nums">{used} / {max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-elevated">
        <div className={`h-1.5 rounded-full ${ratio >= 0.8 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

function PlanCard({ name, price, was, badge, features, current, highlight = false, action }: {
  name: string; price: string; was?: string; badge?: string; features: string[]; current: boolean; highlight?: boolean; action?: React.ReactNode
}) {
  return (
    <div className={`flex flex-col rounded-xl border p-5 ${current ? "border-brand-500 bg-brand-500/5" : highlight ? "border-ink-muted" : "border-ink-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{name}</h3>
        {current ? (
          <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs text-brand-300">Current plan</span>
        ) : badge ? (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-200">{badge}</span>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold">{price}</span>
        <span className="text-sm text-ink-text">/month</span>
        {was && <span className="text-sm text-ink-muted line-through">{was}</span>}
      </div>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-text">
        {features.map(f => (
          <li key={f} className="flex gap-2"><span className="text-green-400">✓</span>{f}</li>
        ))}
      </ul>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
