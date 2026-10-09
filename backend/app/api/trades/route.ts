import { NextRequest, NextResponse } from "next/server"
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
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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

type TradeRow = { realized_pnl: number | null; closed_at: string }

// Counts, net PnL and the current losing streak (most recent trades first)
function summarize(trades: TradeRow[]) {
  let wins = 0
  let losses = 0
  let net = 0
  for (const trade of trades) {
    const pnl = Number(trade.realized_pnl ?? 0)
    net += pnl
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

    return addCorsHeaders(NextResponse.json({ success: true }), origin)
  } catch (error) {
    console.error("[Trades] Error:", error)
    return addCorsHeaders(NextResponse.json({ error: "Internal server error" }, { status: 500 }), origin)
  }
}

// GET /api/trades?since=<ISO>&limit=<n> — trades closed since a time (the extension sends local midnight), newest first
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
    const limitParam = Number(request.nextUrl.searchParams.get("limit"))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 1000) : 200

    const { data, error } = await supabase
      .from("trades")
      .select("id, platform, account, symbol, side, qty, entry_price, exit_price, fill_count, realized_pnl, pnl_source, opened_at, closed_at")
      .eq("user_id", user.id)
      .gte("closed_at", since.toISOString())
      .order("closed_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[Trades] Fetch error:", error)
      return addCorsHeaders(NextResponse.json({ error: "Failed to load trades" }, { status: 500 }), origin)
    }

    return addCorsHeaders(NextResponse.json({ trades: data, stats: summarize(data) }), origin)
  } catch (error) {
    console.error("[Trades] Error:", error)
    return addCorsHeaders(NextResponse.json({ error: "Internal server error" }, { status: 500 }), origin)
  }
}
