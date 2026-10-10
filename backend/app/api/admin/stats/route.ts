import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAdminUser } from "@/lib/admin"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const PRO_PRICE = 19

// Supabase returns at most 1000 rows per request; page through the rest
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

// Optional tables (migrations that may not have run yet) shouldn't break the page
async function fetchOptional<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  try {
    return await fetchAll(build)
  } catch {
    return []
  }
}

// Monday 00:00 UTC of the week containing `time`
function weekStart(time: number) {
  const d = new Date(time)
  const day = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}

type Profile = { id: string; email: string; first_name: string | null; plan: string | null; subscription_status: string | null; created_at: string; onboarded: boolean | null; trading_profile?: { markets?: string[]; platforms?: string[]; prop_firm?: boolean; experience?: string } | null; uninstalled_at?: string | null }
type Event = { user_id: string; event_type: string; created_at: string }
type TradeRow = { user_id: string; closed_at: string }
type Rating = { user_id: string; rating: number; snapshot: any; created_at: string }
type Deleted = { signed_up_month: string | null; deleted_at: string; plan: string | null; checks: number; active_days: number; trades: number; platforms: string[] | null; prop_firm: boolean | null; reason: string | null; details: string | null }
type Feedback = { reason: string; details: string | null; created_at: string; user_id?: string | null }

const PROFILE_COLUMNS = [
  "id, email, first_name, plan, subscription_status, created_at, onboarded, trading_profile, uninstalled_at",
  "id, email, first_name, plan, subscription_status, created_at, onboarded, trading_profile",
  "id, email, first_name, plan, subscription_status, created_at, onboarded"
]
async function fetchProfiles(): Promise<Profile[]> {
  let lastError: unknown
  for (const columns of PROFILE_COLUMNS) {
    try {
      return await fetchAll<Profile>((from, to) => supabase.from("profiles").select(columns).order("created_at", { ascending: false }).range(from, to) as any)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function GET(request: NextRequest) {
  // Same-origin only (no CORS headers); 404 for anyone who isn't the admin
  const admin = await getAdminUser(supabase, request.headers.get("authorization"))
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const now = Date.now()
    const since = new Date(now - 120 * DAY).toISOString()

    const [profiles, rulesetRows, events, trades, ratings, feedback, deleted] = await Promise.all([
      fetchProfiles(),
      fetchAll<{ user_id: string }>((from, to) => supabase.from("rulesets").select("user_id").range(from, to)),
      fetchAll<Event>((from, to) => supabase.from("usage_events").select("user_id, event_type, created_at").gte("created_at", since).order("created_at", { ascending: true }).range(from, to)),
      fetchOptional<TradeRow>((from, to) => supabase.from("trades").select("user_id, closed_at").range(from, to)),
      fetchOptional<Rating>((from, to) => supabase.from("analysis_ratings").select("user_id, rating, snapshot, created_at").gte("created_at", since).order("created_at", { ascending: false }).range(from, to)),
      fetchOptional<Feedback>((from, to) => supabase.from("uninstall_feedback").select("reason, details, created_at, user_id").order("created_at", { ascending: false }).range(from, to))
        .then(rows => rows.length ? rows : fetchOptional<Feedback>((from, to) => supabase.from("uninstall_feedback").select("reason, details, created_at").order("created_at", { ascending: false }).range(from, to))),
      fetchOptional<Deleted>((from, to) => supabase.from("deleted_accounts").select("signed_up_month, deleted_at, plan, checks, active_days, trades, platforms, prop_firm, reason, details").order("deleted_at", { ascending: false }).range(from, to))
    ])

    const emailById = new Map(profiles.map(p => [p.id, p.email]))
    const hasRules = new Set(rulesetRows.map(r => r.user_id))
    const isPaid = (p: Profile) => p.plan === "pro" && p.subscription_status !== "canceled"

    // Per-user activity
    type Activity = { checks: number; checks7d: number; checkTimes: number[]; lastActive: number; trades: number; activeDays: Set<string> }
    const activity = new Map<string, Activity>()
    const get = (id: string) => {
      if (!activity.has(id)) activity.set(id, { checks: 0, checks7d: 0, checkTimes: [], lastActive: 0, trades: 0, activeDays: new Set() })
      return activity.get(id)!
    }
    for (const e of events) {
      const a = get(e.user_id)
      const t = Date.parse(e.created_at)
      a.lastActive = Math.max(a.lastActive, t)
      if (now - t <= 30 * DAY) a.activeDays.add(e.created_at.slice(0, 10))
      if (e.event_type === "analysis_finished") {
        a.checks++
        a.checkTimes.push(t)
        if (now - t <= 7 * DAY) a.checks7d++
      }
    }
    for (const t of trades) {
      const a = get(t.user_id)
      a.trades++
      a.lastActive = Math.max(a.lastActive, Date.parse(t.closed_at))
      if (now - Date.parse(t.closed_at) <= 30 * DAY) a.activeDays.add(t.closed_at.slice(0, 10))
    }

    // Funnel: sign-ups in the last 30 days and all time
    const funnelFor = (cohort: Profile[]) => {
      const steps = [
        { label: "Signed up", count: cohort.length },
        { label: "Saved rules", count: cohort.filter(p => hasRules.has(p.id)).length },
        { label: "First check", count: cohort.filter(p => (activity.get(p.id)?.checks ?? 0) >= 1).length },
        { label: "Third check", count: cohort.filter(p => (activity.get(p.id)?.checks ?? 0) >= 3).length },
        { label: "Paid", count: cohort.filter(isPaid).length }
      ]
      return steps
    }
    const recent = profiles.filter(p => now - Date.parse(p.created_at) <= 30 * DAY)

    // Weekly active users (ran at least one check), last 8 weeks
    const thisWeek = weekStart(now)
    const weekly = Array.from({ length: 8 }, (_, i) => {
      const start = thisWeek - (7 - i) * WEEK
      let active = 0
      for (const a of activity.values()) {
        if (a.checkTimes.some(t => t >= start && t < start + WEEK)) active++
      }
      return { week: new Date(start).toISOString().slice(0, 10), active }
    })

    // Retention: of each sign-up week, % with a check N weeks later
    const offsets = [1, 2, 4, 8]
    const retention = Array.from({ length: 8 }, (_, i) => {
      const start = thisWeek - (8 - i) * WEEK
      const cohort = profiles.filter(p => weekStart(Date.parse(p.created_at)) === start)
      const cells = offsets.map(offset => {
        const target = start + offset * WEEK
        if (target > now) return null
        const retained = cohort.filter(p => activity.get(p.id)?.checkTimes.some(t => t >= target && t < target + WEEK)).length
        return cohort.length ? retained / cohort.length : null
      })
      return { week: new Date(start).toISOString().slice(0, 10), size: cohort.length, cells }
    })

    // Revenue
    const proActive = profiles.filter(p => p.plan === "pro" && p.subscription_status === "active").length
    const proPastDue = profiles.filter(p => p.plan === "pro" && p.subscription_status === "past_due").length
    const canceled = profiles.filter(p => p.subscription_status === "canceled").length

    // AI quality (last 30 days)
    const recentRatings = ratings.filter(r => now - Date.parse(r.created_at) <= 30 * DAY)
    const downs = recentRatings.filter(r => r.rating < 0)

    // Usage groups: power = used on 3+ days this week; fading = active before, quiet 7-29 days; gone = quiet 30+ days or never
    const groupOf = (p: Profile) => {
      const a = activity.get(p.id)
      if (!a?.lastActive) return "never"
      const quietDays = (now - a.lastActive) / DAY
      if (quietDays >= 30) return "gone"
      if (quietDays >= 7) return "fading"
      const daysThisWeek = [...a.activeDays].filter(d => now - Date.parse(`${d}T12:00:00Z`) <= 7 * DAY).length
      return daysThisWeek >= 3 ? "power" : "casual"
    }
    const groups = { power: 0, casual: 0, fading: 0, gone: 0, never: 0 } as Record<string, number>
    for (const p of profiles) groups[groupOf(p)]++

    // Onboarding answers: how many users, still active (14 days), paying, per answer
    const activeRecently = (p: Profile) => (now - (activity.get(p.id)?.lastActive ?? 0)) <= 14 * DAY
    const segment = (valuesOf: (p: Profile) => string[]) => {
      const rows = new Map<string, { users: number; active: number; paying: number }>()
      for (const p of profiles) {
        for (const value of valuesOf(p)) {
          const row = rows.get(value) ?? { users: 0, active: 0, paying: 0 }
          row.users++
          if (activeRecently(p)) row.active++
          if (isPaid(p)) row.paying++
          rows.set(value, row)
        }
      }
      return [...rows.entries()].map(([value, row]) => ({ value, ...row })).sort((a, b) => b.users - a.users)
    }
    const answered = (p: Profile) => !!p.trading_profile
    const segments = {
      answered: profiles.filter(answered).length,
      platforms: segment(p => answered(p) ? (p.trading_profile!.platforms?.length ? p.trading_profile!.platforms! : ["none picked"]) : []),
      markets: segment(p => answered(p) ? (p.trading_profile!.markets ?? []) : []),
      propFirm: segment(p => answered(p) ? [p.trading_profile!.prop_firm ? "Prop firm" : "Own account"] : []),
      experience: segment(p => answered(p) && p.trading_profile!.experience ? [p.trading_profile!.experience] : [])
    }

    const reasons = new Map<string, number>()
    for (const f of feedback) reasons.set(f.reason, (reasons.get(f.reason) ?? 0) + 1)

    return NextResponse.json({
      generatedAt: new Date(now).toISOString(),
      headline: {
        users: profiles.length,
        signups7d: profiles.filter(p => now - Date.parse(p.created_at) <= 7 * DAY).length,
        signups30d: recent.length,
        activeThisWeek: weekly[weekly.length - 1].active,
        activeLastWeek: weekly[weekly.length - 2].active,
        paying: proActive,
        mrr: proActive * PRO_PRICE
      },
      funnel: { last30d: funnelFor(recent), allTime: funnelFor(profiles) },
      groups,
      segments,
      weekly,
      retention: { offsets, rows: retention },
      revenue: { active: proActive, pastDue: proPastDue, canceled, mrr: proActive * PRO_PRICE },
      aiQuality: {
        rated: recentRatings.length,
        down: downs.length,
        recentDown: downs.slice(0, 20).map(r => ({ email: emailById.get(r.user_id) ?? null, created_at: r.created_at, snapshot: r.snapshot }))
      },
      deleted: {
        total: deleted.length,
        last30d: deleted.filter(d => now - Date.parse(d.deleted_at) <= 30 * DAY).length,
        recent: deleted.slice(0, 15)
      },
      uninstall: {
        known30d: profiles.filter(p => p.uninstalled_at && now - Date.parse(p.uninstalled_at) <= 30 * DAY).length,
        recentKnown: profiles
          .filter(p => p.uninstalled_at)
          .sort((a, b) => Date.parse(b.uninstalled_at!) - Date.parse(a.uninstalled_at!))
          .slice(0, 15)
          .map(p => {
            const answer = feedback.find(f => f.user_id === p.id)
            return { email: p.email, uninstalled_at: p.uninstalled_at, reason: answer?.reason ?? null, details: answer?.details ?? null, checks: activity.get(p.id)?.checks ?? 0 }
          }),
        total: feedback.length,
        reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
        recent: feedback.filter(f => f.details).slice(0, 10).map(f => ({ reason: f.reason, details: f.details, created_at: f.created_at, email: f.user_id ? emailById.get(f.user_id) ?? null : null }))
      },
      users: profiles.map(p => {
        const a = activity.get(p.id)
        return {
          email: p.email,
          name: p.first_name,
          plan: p.plan ?? "free",
          subscription_status: p.subscription_status,
          created_at: p.created_at,
          last_active: a?.lastActive ? new Date(a.lastActive).toISOString() : null,
          checks: a?.checks ?? 0,
          checks7d: a?.checks7d ?? 0,
          trades: a?.trades ?? 0,
          active_days_30d: a?.activeDays.size ?? 0,
          group: groupOf(p),
          has_rules: hasRules.has(p.id),
          uninstalled_at: p.uninstalled_at ?? null,
          platforms: p.trading_profile?.platforms ?? [],
          markets: p.trading_profile?.markets ?? [],
          prop_firm: p.trading_profile?.prop_firm ?? null,
          experience: p.trading_profile?.experience ?? null
        }
      })
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[Admin stats] Error:", error)
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
  }
}
