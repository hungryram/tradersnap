"use client"

import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/dashboard-data"
import { Card, Loading, PageHeader, Stat, inputClass } from "../components/ui"

type Step = { label: string; count: number }
type UserRow = {
  email: string; name: string | null; plan: string; subscription_status: string | null
  created_at: string; last_active: string | null; checks: number; checks7d: number; trades: number; has_rules: boolean
  active_days_30d: number; group: Group; uninstalled_at: string | null; platforms: string[]; markets: string[]; prop_firm: boolean | null; experience: string | null
}
type Group = "power" | "casual" | "fading" | "gone" | "never"
type SegmentRow = { value: string; users: number; active: number; paying: number }
type Stats = {
  generatedAt: string
  headline: { users: number; signups7d: number; signups30d: number; activeThisWeek: number; activeLastWeek: number; paying: number; mrr: number }
  funnel: { last30d: Step[]; allTime: Step[] }
  groups: Record<Group, number>
  checkins: { kinds: { kind: string; shown: number; replied: number; dismissed: number }[]; modes: { warnings: number; off: number } }
  segments: { answered: number; platforms: SegmentRow[]; markets: SegmentRow[]; propFirm: SegmentRow[]; experience: SegmentRow[] }
  weekly: { week: string; active: number }[]
  retention: { offsets: number[]; rows: { week: string; size: number; cells: (number | null)[] }[] }
  revenue: { active: number; pastDue: number; canceled: number; mrr: number }
  aiQuality: { rated: number; down: number; recentDown: { email: string | null; created_at: string; snapshot: any }[] }
  deleted: {
    total: number
    last30d: number
    recent: { signed_up_month: string | null; deleted_at: string; plan: string | null; checks: number; active_days: number; trades: number; platforms: string[] | null; prop_firm: boolean | null; reason: string | null; details: string | null }[]
  }
  uninstall: {
    known30d: number
    recentKnown: { email: string; uninstalled_at: string; reason: string | null; details: string | null; checks: number }[]
    total: number
    reasons: { reason: string; count: number }[]
    recent: { reason: string; details: string | null; created_at: string; email: string | null }[]
  }
  users: UserRow[]
}

const REASON_LABELS: Record<string, string> = {
  not_useful: "Didn't help", confusing: "Hard to figure out", wrong_platform: "Wrong platform",
  bugs: "Something broken", too_expensive: "Too expensive", privacy: "Privacy", other: "Other"
}

const GROUPS: { id: Group; label: string; hint: string; tone: string }[] = [
  { id: "power", label: "Power", hint: "Used 3+ days this week", tone: "text-green-400" },
  { id: "casual", label: "Casual", hint: "Used this week", tone: "text-ink-body" },
  { id: "fading", label: "Fading", hint: "Quiet 7 to 29 days", tone: "text-amber-300" },
  { id: "gone", label: "Gone", hint: "Quiet 30+ days", tone: "text-red-400" },
  { id: "never", label: "Never used", hint: "No activity yet", tone: "text-ink-muted" },
]

const ANSWER_LABELS: Record<string, string> = {
  tradingview: "TradingView", tradovate: "Tradovate", topstepx: "TopstepX", ninjatrader: "NinjaTrader", other: "Other",
  futures: "Futures", stocks: "Stocks", options: "Options", forex: "Forex", crypto: "Crypto",
  new: "Under 1 year", "1-3": "1 to 3 years", "3+": "3+ years"
}
const answer = (value: string) => ANSWER_LABELS[value] ?? value

const CHECKIN_LABELS: Record<string, string> = {
  morning_plan: "Morning plan", loss_streak: "Losing streak", daily_loss: "Daily loss limit", revenge: "Quick re-entry after a loss",
  max_trades: "Max trades reached", over_max: "Trade past the max", outside_hours: "Outside trading hours", big_win: "Big win", session_recap: "End-of-session recap"
}

type SortKey = "created_at" | "last_active" | "checks" | "checks7d" | "trades" | "active_days_30d"

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [funnelRange, setFunnelRange] = useState<"last30d" | "allTime">("last30d")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("last_active")
  const [groupFilter, setGroupFilter] = useState<Group | null>(null)

  useEffect(() => {
    api<Stats>("/api/admin/stats").then(setStats).catch(() => setNotFound(true))
  }, [])

  const users = useMemo(() => {
    if (!stats) return []
    const q = query.trim().toLowerCase()
    const value = (u: UserRow) => sort === "created_at" || sort === "last_active" ? Date.parse(u[sort] ?? "") || 0 : u[sort]
    return stats.users
      .filter(u => !groupFilter || u.group === groupFilter)
      .filter(u => !q || [u.email, u.name ?? "", u.plan, ...u.platforms, ...u.markets].some(field => field.toLowerCase().includes(q)))
      .sort((a, b) => value(b) - value(a))
  }, [stats, query, sort, groupFilter])

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
          <p className="mt-4 text-xs text-ink-muted">
            Installs before sign-up aren't tracked here; see the Chrome Web Store developer dashboard.
            {stats.deleted.total > 0 && ` ${stats.deleted.total} deleted ${stats.deleted.total === 1 ? "account is" : "accounts are"} not included (see Deleted accounts below).`}
          </p>
        </Card>

        <Card title="How often they use it">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {GROUPS.map(g => (
              <button
                key={g.id}
                onClick={() => setGroupFilter(groupFilter === g.id ? null : g.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${groupFilter === g.id ? "border-blue-500 bg-blue-500/10" : "border-ink-border hover:border-ink-muted"}`}
              >
                <div className={`text-2xl font-semibold tabular-nums ${g.tone}`}>{stats.groups[g.id] ?? 0}</div>
                <div className="text-sm">{g.label}</div>
                <div className="text-xs text-ink-muted">{g.hint}</div>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">Click a group to filter the user list below. Fading users are the ones to email this week.</p>
        </Card>

        <Card title="Who your users are">
          {stats.segments.answered === 0 ? (
            <p className="text-sm text-ink-muted">No onboarding answers yet. They start with users who sign up through the new onboarding.</p>
          ) : (
            <>
              <p className="-mt-2 mb-4 text-xs text-ink-muted">{stats.segments.answered} of {headline.users} users answered onboarding. "Active" = used Snapchart in the last 14 days.</p>
              <div className="grid gap-6 md:grid-cols-2">
                <SegmentTable title="Trades on" rows={stats.segments.platforms} />
                <SegmentTable title="Markets" rows={stats.segments.markets} />
                <SegmentTable title="Account" rows={stats.segments.propFirm} />
                <SegmentTable title="Experience" rows={stats.segments.experience} />
              </div>
            </>
          )}
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

          <Card title="Uninstalls">
            {stats.uninstall.recentKnown.length === 0 && stats.uninstall.total === 0 ? (
              <p className="text-sm text-ink-muted">None recorded yet. Uninstalls are linked to accounts once users run the new extension version.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-text"><span className="text-ink-body font-semibold">{stats.uninstall.known30d}</span> known uninstalls in the last 30 days.</p>
                {stats.uninstall.recentKnown.length > 0 && (
                  <ul className="mb-4 space-y-2 text-sm">
                    {stats.uninstall.recentKnown.map(u => (
                      <li key={u.email} className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <a href={`mailto:${u.email}`} className="hover:text-blue-300">{u.email}</a>
                        <span className="text-xs text-ink-muted">
                          {shortDate(u.uninstalled_at)} · {u.checks} checks{u.reason ? ` · ${REASON_LABELS[u.reason] ?? u.reason}` : " · no answer"}
                        </span>
                        {u.details && <span className="w-full text-ink-text">"{u.details}"</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {stats.uninstall.reasons.length > 0 && (
                  <div className="border-t border-ink-border pt-3">
                    <div className="mb-2 text-xs text-ink-muted">All answers ({stats.uninstall.total}), including anonymous ones</div>
                    <ul className="space-y-1.5 text-sm">
                      {stats.uninstall.reasons.map(r => (
                        <li key={r.reason} className="flex justify-between"><span className="text-ink-text">{REASON_LABELS[r.reason] ?? r.reason}</span><span className="tabular-nums">{r.count}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <Card title="Coach check-ins (last 30 days)">
          {stats.checkins.kinds.length === 0 ? (
            <p className="text-sm text-ink-muted">None shown yet. They start once the extension update with check-ins is published.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="pb-2 font-normal">Moment</th>
                  <th className="pb-2 font-normal text-right">Shown</th>
                  <th className="pb-2 font-normal text-right">Replied</th>
                  <th className="pb-2 font-normal text-right">Dismissed</th>
                </tr>
              </thead>
              <tbody>
                {stats.checkins.kinds.map(k => (
                  <tr key={k.kind} className="border-t border-ink-border/70">
                    <td className="py-1.5 text-ink-text">{CHECKIN_LABELS[k.kind] ?? k.kind}</td>
                    <td className="py-1.5 text-right tabular-nums">{k.shown}</td>
                    <td className="py-1.5 text-right tabular-nums">{k.replied} <span className="text-xs text-ink-muted">({k.shown ? Math.round((k.replied / k.shown) * 100) : 0}%)</span></td>
                    <td className="py-1.5 text-right tabular-nums">{k.dismissed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            Set to warnings only: {stats.checkins.modes.warnings} · turned off: {stats.checkins.modes.off}. A high dismiss rate or many turning them off means the messages need work.
          </p>
        </Card>

        <Card title={`Deleted accounts (${stats.deleted.last30d} in the last 30 days, ${stats.deleted.total} total)`}>
          {stats.deleted.recent.length === 0 ? (
            <p className="text-sm text-ink-muted">Nobody has deleted their account.</p>
          ) : (
            <ul className="divide-y divide-ink-border/70 text-sm">
              {stats.deleted.recent.map((d, i) => (
                <li key={i} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>
                      <span className="capitalize">{d.plan ?? "free"}</span>
                      {d.platforms?.length ? <span className="text-ink-text"> · {d.platforms.map(answer).join(", ")}</span> : null}
                      {d.prop_firm ? <span className="text-ink-text"> · prop firm</span> : null}
                      <span className="text-ink-muted"> · {d.checks} checks, {d.active_days} active days, {d.trades} trades</span>
                    </span>
                    <span className="text-xs text-ink-muted">
                      {d.signed_up_month ? `joined ${new Date(`${d.signed_up_month}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}, ` : ""}deleted {shortDate(d.deleted_at)}
                    </span>
                  </div>
                  {(d.reason || d.details) && (
                    <div className="mt-0.5 text-ink-text">
                      {d.reason ? (REASON_LABELS[d.reason] ?? d.reason) : ""}{d.reason && d.details ? ": " : ""}{d.details ? `"${d.details}"` : ""}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

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
          title={`Users (${users.length})${groupFilter ? ` · ${GROUPS.find(g => g.id === groupFilter)?.label}` : ""}`}
          action={
            <div className="flex gap-2">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search email, plan, platform" className={`${inputClass} w-48 py-1.5`} />
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className={`${inputClass} w-auto py-1.5`}>
                <option value="last_active">Last active</option>
                <option value="created_at">Newest</option>
                <option value="checks">Most checks</option>
                <option value="checks7d">Checks this week</option>
                <option value="active_days_30d">Most active days</option>
                <option value="trades">Most trades</option>
              </select>
            </div>
          }
        >
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="px-5 pb-2 font-normal sm:px-6">User</th>
                  <th className="pb-2 font-normal">Trades on</th>
                  <th className="pb-2 font-normal">Plan</th>
                  <th className="pb-2 font-normal">Signed up</th>
                  <th className="pb-2 font-normal">Last active</th>
                  <th className="pb-2 font-normal text-right" title="Days with any activity in the last 30">Days (30d)</th>
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
                      <GroupBadge group={u.group} />
                      {u.uninstalled_at && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">Uninstalled {shortDate(u.uninstalled_at)}</span>}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.platforms.map(pl => <span key={pl} className="rounded bg-ink-elevated px-1.5 py-0.5 text-[11px] text-ink-text">{answer(pl)}</span>)}
                        {u.prop_firm && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] text-blue-300">Prop</span>}
                        {u.experience && <span className="rounded bg-ink-elevated px-1.5 py-0.5 text-[11px] text-ink-muted">{answer(u.experience)}</span>}
                        {u.platforms.length === 0 && !u.experience && <span className="text-ink-muted">—</span>}
                      </div>
                    </td>
                    <td className="py-2 capitalize">
                      {u.plan}{u.subscription_status && u.plan === "pro" && u.subscription_status !== "active" && <span className="text-amber-300"> ({u.subscription_status})</span>}
                    </td>
                    <td className="py-2 text-ink-text">{shortDate(u.created_at)}</td>
                    <td className="py-2 text-ink-text">{u.last_active ? relative(u.last_active) : <span className="text-ink-muted">never</span>}</td>
                    <td className="py-2 text-right tabular-nums">{u.active_days_30d}</td>
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

function SegmentTable({ title, rows }: { title: string; rows: SegmentRow[] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th className="pb-1 font-normal" />
            <th className="pb-1 font-normal text-right">Users</th>
            <th className="pb-1 font-normal text-right">Active</th>
            <th className="pb-1 font-normal text-right">Paying</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.value} className="border-t border-ink-border/70">
              <td className="py-1.5 text-ink-text">{answer(row.value)}</td>
              <td className="py-1.5 text-right tabular-nums">{row.users}</td>
              <td className="py-1.5 text-right tabular-nums">{row.active} <span className="text-xs text-ink-muted">({Math.round((row.active / row.users) * 100)}%)</span></td>
              <td className="py-1.5 text-right tabular-nums">{row.paying}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupBadge({ group }: { group: Group }) {
  const styles: Record<Group, string> = {
    power: "bg-green-500/15 text-green-300",
    casual: "bg-ink-elevated text-ink-text",
    fading: "bg-amber-500/15 text-amber-200",
    gone: "bg-red-500/15 text-red-300",
    never: "bg-ink-elevated text-ink-muted",
  }
  const label = GROUPS.find(g => g.id === group)?.label ?? group
  return <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${styles[group]}`}>{label}</span>
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
