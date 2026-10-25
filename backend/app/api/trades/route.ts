import { NextRequest, NextResponse, after } from "next/server"
import { isAllowedOrigin } from "@/lib/cors"
import { disciplineStreak, markChecked } from "@/lib/trade-insights"
import { prepareTrades } from "@/lib/copy-trades"
import { features, loadPlan } from "@/lib/plans"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CORS helper
function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin")
  const response = new NextResponse(null, { status: 200 })
  return addCorsHeaders(response, origin)
}

async function getUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.substring(7))
  return error ? null : user
}

const tradeSchema = z.object({
  client_trade_id: z.string().min(1).max(200),
  platform: z.enum(["tradingview", "tradovate", "topstepx"]),
  account: z.string().max(100).nullable().optional(),
  symbol: z.string().min(1).max(60),
  side: z.enum(["long", "short"]),
  qty: z.number().positive().max(1_000_000),
  entry_price: z.number().nullable().optional(),
  exit_price: z.number().nullable().optional(),
  fill_count: z.number().int().min(1).max(10_000).nullable().optional(),
  realized_pnl: z.number().nullable().optional(),
  pnl_source: z.enum(["realized", "estimated"]).default("realized"),
  opened_at: z.string().datetime().nullable().optional(),
  closed_at: z.string().datetime()
})

type TradeRow = {
  realized_pnl: number | null; closed_at: string; source?: string; kind?: string
  account?: string | null; symbol?: string | null; side?: string | null; opened_at?: string | null
  is_copy?: boolean; group_pnl?: number
}

// A chart check this long before a trade opened tags the trade with its strategy
const TAG_WINDOW_MS = 20 * 60 * 1000

// Tags recent untagged trades with the strategy of the chart check made just
// before they were opened. Quietly does nothing before 20261020_strategies.sql.
async function autoTagTrades(userId: string) {
  const { data: trades, error } = await supabase
    .from("trades")
    .select("id, opened_at")
    .eq("user_id", userId)
    .is("strategy_id", null)
    .not("opened_at", "is", null)
    .gte("closed_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100)
  if (error || !trades?.length) return

  const earliest = Math.min(...trades.map(t => Date.parse(t.opened_at!)))
  const { data: checks } = await supabase
    .from("analyses")
    .select("strategy_id, created_at")
    .eq("user_id", userId)
    .not("strategy_id", "is", null)
    .gte("created_at", new Date(earliest - TAG_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
  if (!checks?.length) return

  for (const trade of trades) {
    const opened = Date.parse(trade.opened_at!)
    const check = checks.find(c => {
      const at = Date.parse(c.created_at)
      return at <= opened + 60_000 && at >= opened - TAG_WINDOW_MS
    })
    if (check) {
      await supabase.from("trades").update({ strategy_id: check.strategy_id, strategy_source: "auto" }).eq("id", trade.id).is("strategy_id", null)
    }
  }
}

// Counts, net PnL and the current losing streak (most recent trades first)
// Day-total entries count in net P&L but are not trades, and a trade copied to several accounts counts once
// (its win or loss is the whole group's), while net P&L adds up every account
function summarize(all: TradeRow[]) {
  const trades = all.filter(t => t.kind !== "day_total" && !t.is_copy)
  const decision = (t: TradeRow) => t.group_pnl ?? Number(t.realized_pnl ?? 0)
  let wins = 0
  let losses = 0
  let net = all.reduce((sum, t) => sum + Number(t.realized_pnl ?? 0), 0)
  for (const trade of trades) {
    const pnl = decision(trade)
    if (pnl > 0) wins++
    else if (pnl < 0) losses++
  }
  let lossStreak = 0
  for (const trade of trades) {
    if (decision(trade) < 0) lossStreak++
    else break
  }
  return { count: trades.length, wins, losses, net: Math.round(net * 100) / 100, lossStreak }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")

  try {
    const user = await getUser(request)
    if (!user) {
      return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin)
    }

    // One trade, or { trades: [...] } when the order history is first read
    const body = await request.json()
    const parsed = z.array(tradeSchema).min(1).max(200).safeParse(Array.isArray(body?.trades) ? body.trades : [body])
    if (!parsed.success) {
      return addCorsHeaders(NextResponse.json({ error: "Invalid trade" }, { status: 400 }), origin)
    }

    // Trades the trader deleted stay deleted, even though the platform still has them and sends them again
    const incoming = await withoutDeleted(user.id, parsed.data)
    if (incoming.length === 0) return addCorsHeaders(NextResponse.json({ success: true }), origin)

    // Reloads and other open tabs re-send the same trades; the unique key keeps one row each
    const { error } = await supabase
      .from("trades")
      .upsert(incoming.map(trade => ({ ...trade, user_id: user.id })), { onConflict: "user_id,client_trade_id", ignoreDuplicates: true })

    if (error) {
      console.error("[Trades] Insert error:", error)
      return addCorsHeaders(NextResponse.json({ error: "Failed to save trade" }, { status: 500 }), origin)
    }

    after(() => autoTagTrades(user.id).catch(err => console.error("[Trades] Auto-tag failed:", err)))
    return addCorsHeaders(NextResponse.json({ success: true }), origin)
  } catch (error) {
    console.error("[Trades] Error:", error)
    return addCorsHeaders(NextResponse.json({ error: "Internal server error" }, { status: 500 }), origin)
  }
}

// GET /api/trades?since=<ISO>&until=<ISO>&limit=<n> — trades closed in a window (the extension
// sends local midnight), newest first. History is limited by the plan (lib/plans historyDays).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin")

  try {
    const user = await getUser(request)
    if (!user) {
      return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin)
    }

    const sinceParam = request.nextUrl.searchParams.get("since")
    const since = sinceParam && !isNaN(Date.parse(sinceParam))
      ? new Date(sinceParam)
      : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const untilParam = request.nextUrl.searchParams.get("until")
    const until = untilParam && !isNaN(Date.parse(untilParam)) ? new Date(untilParam) : null
    const limitParam = Number(request.nextUrl.searchParams.get("limit"))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 1000) : 200

    // Free plan: history only goes back FREE_HISTORY_DAYS (local midnight that many days ago, roughly)
    const { plan } = await loadPlan(supabase, user.id)
    const historyDays = features(plan).historyDays
    const historyFrom = historyDays ? new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000) : null
    const from = historyFrom && historyFrom > since ? historyFrom : since

    const columns = "id, platform, account, symbol, side, qty, entry_price, exit_price, fill_count, realized_pnl, pnl_source, opened_at, closed_at"
    const query = (cols: string) => {
      let q = supabase.from("trades").select(cols).eq("user_id", user.id).gte("closed_at", from.toISOString())
      if (until) q = q.lt("closed_at", until.toISOString())
      return q.order("closed_at", { ascending: false }).limit(limit)
    }
    let { data, error } = await query(`${columns}, strategy_id, strategy_source, source, kind`)
    if (error) ({ data, error } = await query(`${columns}, strategy_id, strategy_source, source`)) // before 20261024_day_totals.sql
    if (error) ({ data, error } = await query(`${columns}, strategy_id, strategy_source`)) // before 20261022_manual_trades.sql
    if (error) ({ data, error } = await query(columns)) // before 20261020_strategies.sql

    if (error || !data) {
      console.error("[Trades] Fetch error:", error)
      return addCorsHeaders(NextResponse.json({ error: "Failed to load trades" }, { status: 500 }), origin)
    }

    // Whether each trade had a chart check first, and (on request) the discipline streak
    const trades = prepareTrades(await markChecked(supabase, user.id, data as unknown as (TradeRow & { opened_at: string | null; account: string | null; symbol: string | null; side: string | null; platform: string; qty: number | null; entry_price: number | null; exit_price: number | null })[]))
    const params = request.nextUrl.searchParams
    const streak = params.get("streak") ? await disciplineStreak(supabase, user.id, params.get("tz") || undefined) : undefined
    // Trades the trader typed in have no entry time, so they can't be "checked first" or not
    const detected = trades.filter(t => t.source !== "manual" && !t.is_copy)
    const checked = detected.filter(t => t.checked).length
    return addCorsHeaders(NextResponse.json({
      trades,
      stats: { ...summarize(trades), checked, unchecked: detected.length - checked },
      ...(streak !== undefined ? { streak } : {}),
      // Set when older trades were left out because of the Free plan's history
      historyFrom: historyFrom && historyFrom > since ? historyFrom.toISOString() : null
    }), origin)
  } catch (error) {
    console.error("[Trades] Error:", error)
    return addCorsHeaders(NextResponse.json({ error: "Internal server error" }, { status: 500 }), origin)
  }
}

// DELETE /api/trades { ids } — permanently deletes trades. A detected trade is remembered as deleted, so when the
// platform sends it again it isn't imported. DELETE /api/trades { all: true } clears every trade: nothing that
// closed before now is imported again, while new trades keep coming in.
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin")
  const user = await getUser(request)
  if (!user) return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin)

  const parsed = z.union([
    z.object({ all: z.literal(true) }),
    z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }),
    z.object({ id: z.string().uuid() }) // older dashboards
  ]).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return addCorsHeaders(NextResponse.json({ error: "Invalid request" }, { status: 400 }), origin)
  const fail = () => addCorsHeaders(NextResponse.json({ error: "Couldn't delete that. Try again." }, { status: 500 }), origin)

  if ("all" in parsed.data) {
    const { error: cutoffError } = await supabase.from("profiles").update({ trades_cleared_at: new Date().toISOString() }).eq("id", user.id)
    if (cutoffError) {
      // Without the cut-off (20261029_deleted_trades.sql not run), cleared trades would come straight back
      console.error("[Trades] Clear all: cut-off not saved:", cutoffError.message)
      return fail()
    }
    const { error } = await supabase.from("trades").delete().eq("user_id", user.id)
    if (error) return fail()
    // Reviews were about trades that are gone; notes are the trader's own words and stay
    await supabase.from("day_reviews").delete().eq("user_id", user.id)
    return addCorsHeaders(NextResponse.json({ success: true }), origin)
  }

  const ids = "ids" in parsed.data ? parsed.data.ids : [parsed.data.id]
  const { data: rows, error: findError } = await supabase.from("trades").select("id, client_trade_id, source").eq("user_id", user.id).in("id", ids)
  if (findError) return fail()
  const detected = (rows ?? []).filter(r => r.source !== "manual")
  if (detected.length) {
    const { error: rememberError } = await supabase.from("deleted_trades").upsert(
      detected.map(r => ({ user_id: user.id, client_trade_id: r.client_trade_id })),
      { onConflict: "user_id,client_trade_id", ignoreDuplicates: true }
    )
    if (rememberError) {
      // Without the list (20261029_deleted_trades.sql not run), a deleted trade would come straight back
      console.error("[Trades] Delete: not remembered:", rememberError.message)
      return fail()
    }
  }
  const { error } = await supabase.from("trades").delete().eq("user_id", user.id).in("id", ids)
  if (error) return fail()
  return addCorsHeaders(NextResponse.json({ success: true, deleted: rows?.length ?? 0 }), origin)
}

// Drops trades the trader deleted (one by one, or everything before "Clear all trades")
async function withoutDeleted<T extends { client_trade_id: string; closed_at: string }>(userId: string, trades: T[]): Promise<T[]> {
  const [{ data: profile }, { data: deleted }] = await Promise.all([
    supabase.from("profiles").select("trades_cleared_at").eq("id", userId).single(),
    supabase.from("deleted_trades").select("client_trade_id").eq("user_id", userId).in("client_trade_id", trades.map(t => t.client_trade_id))
  ])
  const clearedAt = profile?.trades_cleared_at ? Date.parse(profile.trades_cleared_at) : null
  const gone = new Set((deleted ?? []).map(d => d.client_trade_id))
  return trades.filter(t => !gone.has(t.client_trade_id) && !(clearedAt && Date.parse(t.closed_at) <= clearedAt))
}

// PATCH /api/trades { id, strategy_id } — the trader sets (or clears) a trade's strategy
export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin")
  const user = await getUser(request)
  if (!user) return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin)

  const parsed = z.object({ id: z.string().uuid(), strategy_id: z.string().uuid().nullable() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return addCorsHeaders(NextResponse.json({ error: "Invalid request" }, { status: 400 }), origin)

  if (parsed.data.strategy_id) {
    const { data: strategy } = await supabase.from("rulesets").select("id").eq("id", parsed.data.strategy_id).eq("user_id", user.id).maybeSingle()
    if (!strategy) return addCorsHeaders(NextResponse.json({ error: "Strategy not found" }, { status: 404 }), origin)
  }
  const { error } = await supabase
    .from("trades")
    .update({ strategy_id: parsed.data.strategy_id, strategy_source: parsed.data.strategy_id ? "user" : null })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
  if (error) return addCorsHeaders(NextResponse.json({ error: "Couldn't update the trade" }, { status: 500 }), origin)
  return addCorsHeaders(NextResponse.json({ success: true }), origin)
}
