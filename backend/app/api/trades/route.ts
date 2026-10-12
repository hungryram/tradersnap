import { NextRequest, NextResponse, after } from "next/server"
import { disciplineStreak, markChecked } from "@/lib/trade-insights"
import { features, loadPlan } from "@/lib/plans"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CORS helper
function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin) {
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

type TradeRow = { realized_pnl: number | null; closed_at: string; source?: string; kind?: string }

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
// Day-total entries count in net P&L but are not trades
function summarize(all: TradeRow[]) {
  const trades = all.filter(t => t.kind !== "day_total")
  let wins = 0
  let losses = 0
  let net = all.reduce((sum, t) => sum + Number(t.realized_pnl ?? 0), 0)
  for (const trade of trades) {
    const pnl = Number(trade.realized_pnl ?? 0)
    if (pnl > 0) wins++
    else if (pnl < 0) losses++
  }
  let lossStreak = 0
  for (const trade of trades) {
    if (Number(trade.realized_pnl ?? 0) < 0) lossStreak++
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

    // Reloads and other open tabs re-send the same trades; the unique key keeps one row each
    const { error } = await supabase
      .from("trades")
      .upsert(parsed.data.map(trade => ({ ...trade, user_id: user.id })), { onConflict: "user_id,client_trade_id", ignoreDuplicates: true })

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
    const trades = await markChecked(supabase, user.id, data as unknown as (TradeRow & { opened_at: string | null })[])
    const params = request.nextUrl.searchParams
    const streak = params.get("streak") ? await disciplineStreak(supabase, user.id, params.get("tz") || undefined) : undefined
    // Trades the trader typed in have no entry time, so they can't be "checked first" or not
    const detected = trades.filter(t => t.source !== "manual")
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

// DELETE /api/trades { id } — removes a result the trader logged by hand. Trades read from the
// platform stay (they would be read again), so only manual ones can be deleted.
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin")
  const user = await getUser(request)
  if (!user) return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin)

  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return addCorsHeaders(NextResponse.json({ error: "Invalid request" }, { status: 400 }), origin)

  const { error } = await supabase.from("trades").delete().eq("id", parsed.data.id).eq("user_id", user.id).eq("source", "manual")
  if (error) return addCorsHeaders(NextResponse.json({ error: "Couldn't delete the trade" }, { status: 500 }), origin)
  return addCorsHeaders(NextResponse.json({ success: true }), origin)
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
