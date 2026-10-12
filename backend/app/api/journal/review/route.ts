import { NextRequest, NextResponse, after } from "next/server"
import { effectivePlan, features } from "@/lib/plans"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { mainJson } from "@/lib/llm"
import { logLlmUsage } from "@/lib/llm-cost"
import { prepareTrades, instrumentOf } from "@/lib/copy-trades"
import { loadActiveStrategies, loadAlwaysRules, strategiesBlock } from "@/lib/strategies"

// "Review this day": Pip reads one trading day from the journal (its trades and the trader's own note) and
// says what held up against their rules, what slipped, and one question to take away. Paid plans, a few a day.
// It doesn't use the chat allowance. The latest review of each day is saved, so reopening it costs nothing.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const dayPattern = /^\d{4}-\d{2}-\d{2}$/

const reviewSchema = z.object({
  summary: z.string().describe("Two or three sentences in Pip's voice: how the day went against their rules and limits"),
  went_well: z.array(z.string()).describe("Up to 3 specific things that followed their rules, each one short; empty if nothing did"),
  to_work_on: z.array(z.string()).describe("Up to 3 specific things that broke or bent their rules, each one short, naming the numbers; empty if nothing did"),
  question: z.string().describe("One question for the trader to think about before the next session")
})

const SYSTEM = `You are Pip, an AI trading-discipline coach. A trader asked you to review one trading day from their journal.

You are given that day's trades, any note the trader wrote about the day, and the trader's own rules and daily limits. Judge the day against THEIR rules and limits, using only what you are given.

Rules for the review:
- You never give signals, entries, exits or predictions, and you never say what a trade "should" have done in the market.
- Don't claim a loss would have been avoided, or that following the rules would have made money. Describe what happened.
- A trade copied to several accounts is one decision. Their limits (max trades, daily loss, losses in a row) apply to each account separately, so judge each account against its own numbers.
- A "day total" entry is an adjustment so the journal matches what the trader reported. It is not a trade.
- Use the real numbers (counts, times, amounts). Don't invent anything you can't see. If you can't tell whether a rule was kept (for example an entry rule that needs the chart), say so.
- If their note mentions a feeling or a reason, use it, gently. Don't quote it back at length.
- Be warm, short and specific. No lectures. One core insight.`

// Midnight of the trader's local day, as a UTC time
function startOfDayUtc(day: string, timeZone: string) {
  const [y, m, d] = day.split("-").map(Number)
  const target = Date.UTC(y, m - 1, d)
  let utc = target
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utc))
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
    utc -= local - target
  }
  return utc
}

async function getUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  const { data: { user } } = await supabase.auth.getUser(authHeader.substring(7))
  return user
}

// Free plans get a taste: one review a week. Counted from the saved reviews (one per day reviewed); null when that
// table isn't there yet, in which case free reviews stay off rather than going unlimited.
const usedThisWeek = async (userId: string) => {
  const { count, error } = await supabase
    .from("day_reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  return error ? null : count ?? 0
}

// What this plan allows: a daily number (paid), or one a week (free), and how many are used
async function allowance(userId: string, plan: ReturnType<typeof effectivePlan>) {
  const f = features(plan)
  if (f.dayReviewsPerDay) return { period: "day" as const, limit: f.dayReviewsPerDay, used: await usedToday(userId) }
  if (f.dayReviewsPerWeek) {
    const used = await usedThisWeek(userId)
    return { period: "week" as const, limit: f.dayReviewsPerWeek, used: used ?? f.dayReviewsPerWeek }
  }
  return { period: null, limit: 0, used: 0 }
}

const usedToday = async (userId: string) => {
  const { count, error } = await supabase
    .from("llm_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", "review")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  return error ? 0 : count ?? 0
}

// GET /api/journal/review?day=YYYY-MM-DD — the saved review for a day, and what the plan allows
export async function GET(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const day = request.nextUrl.searchParams.get("day") ?? ""
  if (!dayPattern.test(day)) return NextResponse.json({ error: "Invalid day" }, { status: 400 })

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
  const { period, limit, used } = await allowance(user.id, effectivePlan(profile))
  const { data } = await supabase.from("day_reviews").select("review, created_at").eq("user_id", user.id).eq("day", day).maybeSingle()
  return NextResponse.json({ review: data ? { ...data.review, created_at: data.created_at } : null, limit, used, period })
}

// POST /api/journal/review { day, timezone } — Pip writes (or rewrites) the review
export async function POST(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = z.object({ day: z.string().regex(dayPattern), timezone: z.string().max(60).optional() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { day } = parsed.data
  let timezone = parsed.data.timezone || "America/New_York"
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }) } catch { timezone = "America/New_York" }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
  const plan = effectivePlan(profile)
  const { period, limit, used } = await allowance(user.id, plan)
  if (!period) return NextResponse.json({ error: "Day reviews are part of Pro.", requiresUpgrade: true }, { status: 403 })
  if (used >= limit) {
    return NextResponse.json({
      error: period === "week" ? "You've used this week's free day review. Pro gives you 5 a day." : `You've used your ${limit} day reviews for today. They free up over the next 24 hours.`,
      limit, used, period, requiresUpgrade: period === "week"
    }, { status: 429 })
  }
  if (period === "week") {
    // The free taste is one review of a recent day; a day can't be reviewed again, and history is limited like the journal's
    const { data: existing } = await supabase.from("day_reviews").select("id").eq("user_id", user.id).eq("day", day).maybeSingle()
    if (existing) return NextResponse.json({ error: "Pro lets you review a day again. Your review of this day is above.", requiresUpgrade: true }, { status: 403 })
    const historyDays = features(plan).historyDays
    if (historyDays && Date.now() - startOfDayUtc(day, timezone) > (historyDays + 1) * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: `Free keeps ${historyDays} days of history, so older days can't be reviewed. Pro keeps all of it.`, requiresUpgrade: true }, { status: 403 })
    }
  }

  // The day's trades (copies across accounts are one decision) and the trader's note
  const start = startOfDayUtc(day, timezone)
  const { data: rows } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", user.id)
    .gte("closed_at", new Date(start).toISOString())
    .lt("closed_at", new Date(start + 24 * 60 * 60 * 1000).toISOString())
    .order("closed_at", { ascending: true })
    .limit(300)
  const marked = prepareTrades((rows ?? []) as { account: string | null; symbol: string | null; side: string | null; opened_at: string | null; closed_at: string; realized_pnl: number | null; platform: string; qty: number | null; entry_price: number | null; exit_price: number | null; kind?: string; source?: string; pnl_source?: string }[])
  const { data: noteRow } = await supabase.from("journal_notes").select("text").eq("user_id", user.id).eq("day", day).maybeSingle()
  const note = noteRow?.text?.trim().slice(0, 1000) ?? ""

  if (marked.length === 0 && !note) {
    return NextResponse.json({ error: "There's nothing to review for this day yet: no trades and no note.", limit, used }, { status: 400 })
  }

  const pnl = (t: { realized_pnl: number | null }) => Number(t.realized_pnl ?? 0)
  const money = (v: number) => `${v < 0 ? "-" : "+"}$${Math.abs(v).toFixed(2)}`
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })
  const price = (v: number | null) => (v === null ? "?" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }))
  const decisions = marked.filter(t => !t.is_copy)
  const accounts = [...new Set(marked.map(t => t.account).filter((a): a is string => !!a))]

  const lines = decisions.slice(0, 60).map((t, i) => {
    if (t.kind === "day_total") return `${i + 1}. ${time(t.closed_at)} adjustment so the journal matches the day total the trader reported (not a trade): ${money(pnl(t))}`
    if (t.source === "manual") return `${i + 1}. ${time(t.closed_at)} ${t.symbol ? instrumentOf(t.symbol) + " " : ""}reported by the trader: ${money(pnl(t))}`
    const where = t.copies > 1 ? ` (copied to ${t.copies} accounts, ${money(t.group_pnl)} combined)` : accounts.length > 1 && t.account ? ` [account ${t.account.replace(/^[a-z]+:/i, "")}]` : ""
    return `${i + 1}. ${time(t.opened_at ?? t.closed_at)} to ${time(t.closed_at)} ${instrumentOf(t.symbol ?? "?")} ${t.side} ${t.qty} @ ${price(t.entry_price)} -> ${price(t.exit_price)}: ${money(pnl(t))}${where}`
  })
  const perAccount = accounts.length > 1
    ? accounts.map(a => {
        const own = marked.filter(t => t.account === a && t.kind !== "day_total")
        return `- account ${a.replace(/^[a-z]+:/i, "")}: ${own.length} trades, net ${money(own.reduce((s, t) => s + pnl(t), 0))}`
      }).join("\n")
    : null

  const strategies = await loadActiveStrategies(supabase, user.id)
  const alwaysRules = await loadAlwaysRules(supabase, user.id)
  const rules = strategies.length || alwaysRules ? strategiesBlock(strategies, alwaysRules, profile?.trading_limits ?? null) : "The trader hasn't written any rules or limits yet."

  const prompt = [
    `Day: ${day} (the trader's local time zone: ${timezone})`,
    `THE TRADER'S RULES AND LIMITS:\n${rules}`,
    decisions.length ? `THE DAY'S TRADES (${decisions.filter(t => t.kind !== "day_total").length} decisions, net ${money(marked.reduce((s, t) => s + pnl(t), 0))}${accounts.length > 1 ? ` across ${accounts.length} accounts` : ""}):\n${lines.join("\n")}` : "No trades were recorded this day.",
    perAccount ? `PER ACCOUNT (limits apply to each account separately):\n${perAccount}` : null,
    note ? `THE TRADER'S NOTE FOR THIS DAY:\n${note}` : "The trader didn't write a note for this day."
  ].filter(Boolean).join("\n\n")

  try {
    const { output, tokens } = await mainJson({ system: SYSTEM, prompt, schema: reviewSchema, maxTokens: 3000 })
    after(() => logLlmUsage(supabase, user.id, "review", tokens))
    const review = {
      summary: output.summary.trim(),
      went_well: output.went_well.map(s => s.trim()).filter(Boolean).slice(0, 3),
      to_work_on: output.to_work_on.map(s => s.trim()).filter(Boolean).slice(0, 3),
      question: output.question.trim()
    }
    const saved = await supabase.from("day_reviews").upsert({ user_id: user.id, day, review, created_at: new Date().toISOString() }, { onConflict: "user_id,day" })
    if (saved.error && saved.error.code !== "42P01" && saved.error.code !== "PGRST205") console.error("[Day review] Save failed:", saved.error.message) // table missing until 20261026_day_reviews.sql runs
    return NextResponse.json({ review: { ...review, created_at: new Date().toISOString() }, limit, used: used + 1, period })
  } catch (error) {
    console.error("[Day review] Failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Pip couldn't review this day just now. Try again in a moment." }, { status: 500 })
  }
}
