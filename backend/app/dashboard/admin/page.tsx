"use client"

import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/dashboard-data"
import { Card, Loading, PageHeader, Stat, inputClass } from "../components/ui"

type Step = { label: string; count: number }
type UserRow = {
  email: string; name: string | null; plan: string; subscription_status: string | null
  created_at: string; last_active: string | null; checks: number; checks7d: number; trades: number; has_rules: boolean
}
type Stats = {
  generatedAt: string
  headline: { users: number; signups7d: number; signups30d: number; activeThisWeek: number; activeLastWeek: number; paying: number; mrr: number }
  funnel: { last30d: Step[]; allTime: Step[] }
  weekly: { week: string; active: number }[]
  retention: { offsets: number[]; rows: { week: string; size: number; cells: (number | null)[] }[] }
  revenue: { active: number; pastDue: number; canceled: number; mrr: number }
  aiQuality: { rated: number; down: number; recentDown: { email: string | null; created_at: string; snapshot: any }[] }
  uninstall: { total: number; reasons: { reason: string; count: number }[]; recent: { reason: string; details: string | null; created_at: string }[] }
  users: UserRow[]
}

const REASON_LABELS: Record<string, string> = {
  not_useful: "Didn't help", confusing: "Hard to figure out", wrong_platform: "Wrong platform",
  bugs: "Something broken", too_expensive: "Too expensive", privacy: "Privacy", other: "Other"
}

type SortKey = "created_at" | "last_active" | "checks" | "checks7d" | "trades"

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [funnelRange, setFunnelRange] = useState<"last30d" | "allTime">("last30d")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("last_active")

  useEffect(() => {
    api<Stats>("/api/admin/stats").then(setStats).catch(() => setNotFound(true))
  }, [])

  const users = useMemo(() => {
    if (!stats) return []
    const q = query.trim().toLowerCase()
    const value = (u: UserRow) => sort === "created_at" || sort === "last_active" ? Date.parse(u[sort] ?? "") || 0 : u[sort]
    return stats.users
      .filter(u => !q || u.email.toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q) || u.plan.includes(q))
      .sort((a, b) => value(b) - value(a))
  }, [stats, query, sort])

  if (notFound) return <div className="py-24 text-center text-ink-muted">Page not found.</div>
  if (!stats) return <Loading />

  const { headline } = stats
  const funnel = stats.funnel[funnelRange]
  const maxWeekly = Math.max(...stats.weekly.map(w => w.active), 1)
  const downShare = stats.aiQuality.rated ? stats.aiQuality.down / stats.aiQuality.rated : null

  return (
    <>
      <PageHeader title="Admin" subtitle={`Updated ${new Date(stats.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Activity covers the last 120 days.`} />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Users" value={headline.users} hint={`+${headline.signups7d} this week · +${headline.signups30d} in 30 days`} />
          <Stat
            label="Weekly active (ran a check)"
            value={headline.activeThisWeek}
            hint={`${headline.activeLastWeek} last week`}
            tone={headline.activeThisWeek >= headline.activeLastWeek ? "good" : "warn"}
          />
          <Stat label="Paying" value={headline.paying} hint={`$${headline.mrr.toLocaleString()} / month`} tone="good" />
          <Stat
            label="Verdicts rated 👎 (30d)"
            value={downShare === null ? "—" : `${Math.round(downShare * 100)}%`}
            hint={`${stats.aiQuality.rated} rated`}
            tone={downShare !== null && downShare > 0.2 ? "bad" : "default"}
          />
        </div>

        <Card
          title="Funnel"
          action={
            <div className="inline-flex rounded-lg border border-ink-border p-1 text-sm">
              {(["last30d", "allTime"] as const).map(range => (
                <button key={range} onClick={() => setFunnelRange(range)} className={`rounded-md px-3 py-1 ${funnelRange === range ? "bg-ink-elevated text-ink-body" : "text-ink-text"}`}>
                  {range === "last30d" ? "Signed up last 30 days" : "All time"}
                </button>
              ))}
            </div>
          }
        >
          <ul className="space-y-3">
            {funnel.map((step, i) => {
              const ofTop = funnel[0].count ? step.count / funnel[0].count : 0
              const ofPrev = i > 0 && funnel[i - 1].count ? step.count / funnel[i - 1].count : null
              return (
                <li key={step.label} className="grid grid-cols-[7rem_1fr_7.5rem] items-center gap-3 text-sm">
                  <span className="text-ink-text">{step.label}</span>
                  <span className="h-6 rounded-md bg-ink-elevated">
                    <span className="flex h-6 items-center rounded-md bg-blue-600/80 px-2 text-xs tabular-nums text-white" style={{ width: `${Math.max(ofTop * 100, step.count ? 6 : 0)}%` }}>
                      {step.count}
                    </span>
                  </span>
                  <span className="text-right tabular-nums text-ink-text">
                    {Math.round(ofTop * 100)}%{ofPrev !== null && <span className="text-ink-muted"> · {Math.round(ofPrev * 100)}% of prev</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-ink-muted">Installs before sign-up aren't tracked here; see the Chrome Web Store developer dashboard.</p>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Weekly active users">
            <div className="flex h-40 items-end gap-2">
              {stats.weekly.map(w => (
                <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs tabular-nums text-ink-text">{w.active}</span>
                  <div className="w-full rounded-t-md bg-blue-500/80" style={{ height: `${(w.active / maxWeekly) * 100}%`, minHeight: w.active ? 4 : 1 }} />
                  <span className="text-[10px] text-ink-muted">{shortDate(w.week)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Retention (still running checks)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th className="pb-2 font-normal">Signed up</th>
                    <th className="pb-2 font-normal text-right">Users</th>
                    {stats.retention.offsets.map(o => <th key={o} className="pb-2 font-normal text-right">Week {o}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {stats.retention.rows.map(row => (
                    <tr key={row.week} className="border-t border-ink-border/70">
                      <td className="py-1.5 text-ink-text">{shortDate(row.week)}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.size}</td>
                      {row.cells.map((cell, i) => (
                        <td key={i} className="py-1.5 text-right tabular-nums">
                          {cell === null || row.size === 0 ? <span className="text-ink-muted">·</span> : (
                            <span className={cell >= 0.4 ? "text-green-400" : cell >= 0.15 ? "text-amber-300" : "text-red-400"}>{Math.round(cell * 100)}%</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Revenue">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-xs text-ink-muted">Paying (active)</dt><dd className="mt-0.5 text-xl font-semibold tabular-nums">{stats.revenue.active}</dd></div>
              <div><dt className="text-xs text-ink-muted">Monthly revenue</dt><dd className="mt-0.5 text-xl font-semibold tabular-nums">${stats.revenue.mrr.toLocaleString()}</dd></div>
              <div><dt className="text-xs text-ink-muted">Payment failing</dt><dd className={`mt-0.5 text-xl font-semibold tabular-nums ${stats.revenue.pastDue ? "text-amber-300" : ""}`}>{stats.revenue.pastDue}</dd></div>
              <div><dt className="text-xs text-ink-muted">Canceled</dt><dd className="mt-0.5 text-xl font-semibold tabular-nums">{stats.revenue.canceled}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-ink-muted">Stripe's dashboard has invoices and churn details.</p>
          </Card>

          <Card title="Why people uninstall">
            {stats.uninstall.total === 0 ? (
              <p className="text-sm text-ink-muted">No answers yet.</p>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm">
                  {stats.uninstall.reasons.map(r => (
                    <li key={r.reason} className="flex justify-between"><span className="text-ink-text">{REASON_LABELS[r.reason] ?? r.reason}</span><span className="tabular-nums">{r.count}</span></li>
                  ))}
                </ul>
                {stats.uninstall.recent.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-ink-border pt-4 text-sm">
                    {stats.uninstall.recent.map((f, i) => (
                      <li key={i} className="text-ink-text">"{f.details}" <span className="text-xs text-ink-muted">{REASON_LABELS[f.reason] ?? f.reason}, {shortDate(f.created_at)}</span></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
        </div>

        <Card title="Verdicts rated 👎 (last 30 days)">
          {stats.aiQuality.recentDown.length === 0 ? (
            <p className="text-sm text-ink-muted">{stats.aiQuality.rated ? "No thumbs down. Nice." : "No ratings yet. They start once the extension update with 👍/👎 is published."}</p>
          ) : (
            <ul className="divide-y divide-ink-border/70">
              {stats.aiQuality.recentDown.map((r, i) => (
                <li key={i} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{r.snapshot?.headline ?? "Chat reply"}</span>
                    <span className="text-xs text-ink-muted">{r.email} · {shortDate(r.created_at)}</span>
                  </div>
                  {(r.snapshot?.headline_reason || r.snapshot?.summary || r.snapshot?.text) && (
                    <p className="mt-1 text-ink-text">{r.snapshot.headline_reason ?? r.snapshot.summary ?? String(r.snapshot.text).slice(0, 240)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={`Users (${users.length})`}
          action={
            <div className="flex gap-2">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search email or plan" className={`${inputClass} w-48 py-1.5`} />
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className={`${inputClass} w-auto py-1.5`}>
                <option value="last_active">Last active</option>
                <option value="created_at">Newest</option>
                <option value="checks">Most checks</option>
                <option value="checks7d">Checks this week</option>
                <option value="trades">Most trades</option>
              </select>
            </div>
          }
        >
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="px-5 pb-2 font-normal sm:px-6">User</th>
                  <th className="pb-2 font-normal">Plan</th>
                  <th className="pb-2 font-normal">Signed up</th>
                  <th className="pb-2 font-normal">Last active</th>
                  <th className="pb-2 font-normal text-right">Checks</th>
                  <th className="pb-2 font-normal text-right">This week</th>
                  <th className="px-5 pb-2 font-normal text-right sm:px-6">Trades</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.email} className="border-t border-ink-border/70">
                    <td className="px-5 py-2 sm:px-6">
                      <a href={`mailto:${u.email}`} className="hover:text-blue-300">{u.email}</a>
                      {u.name && <span className="text-ink-muted"> · {u.name}</span>}
                      {!u.has_rules && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">no rules</span>}
                    </td>
                    <td className="py-2 capitalize">
                      {u.plan}{u.subscription_status && u.plan === "pro" && u.subscription_status !== "active" && <span className="text-amber-300"> ({u.subscription_status})</span>}
                    </td>
                    <td className="py-2 text-ink-text">{shortDate(u.created_at)}</td>
                    <td className="py-2 text-ink-text">{u.last_active ? relative(u.last_active) : <span className="text-ink-muted">never</span>}</td>
                    <td className="py-2 text-right tabular-nums">{u.checks}</td>
                    <td className="py-2 text-right tabular-nums">{u.checks7d}</td>
                    <td className="px-5 py-2 text-right tabular-nums sm:px-6">{u.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}

function shortDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function relative(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days}d ago`
  return shortDate(iso)
}
