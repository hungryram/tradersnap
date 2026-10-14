import { NextRequest, NextResponse } from "next/server"
import { APP_ORIGINS, APP_URL } from "@/lib/urls"
import { createClient } from "@supabase/supabase-js"
import { prepareTrades } from "@/lib/copy-trades"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null) {
  const allowedOrigins = [
    ...APP_ORIGINS,
    'https://www.tradingview.com',
    'https://tradingview.com'
  ]
  
  // Trading platforms and exchanges supported by the extension
  const tradingDomains = [
    'tradingview.com', 'tradovate.com', 'thinkorswim.com', 'tdameritrade.com',
    'ninjatrader.com', 'tradestation.com', 'interactivebrokers.com', 'etrade.com',
    'schwab.com', 'fidelity.com', 'robinhood.com', 'webull.com', 'tastytrade.com',
    'tastyworks.com', 'metatrader4.com', 'metatrader5.com', 'ctrader.com',
    'tradier.com', 'lightspeed.com', 'speedtrader.com', 'topstepx.com', 'rithmic.com',
    'binance.com', 'coinbase.com', 'kraken.com', 'bybit.com'
  ]
  
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    origin.startsWith('chrome-extension://') ||
    tradingDomains.some(domain => origin.includes(domain))
  )
  
  if (isAllowed && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
    response.headers.set("Access-Control-Allow-Credentials", "true")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin")
  const response = new NextResponse(null, { status: 200 })
  return addCorsHeaders(response, origin)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin")
  
  try {
    // 1. Validate JWT
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    const token = authHeader.substring(7)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.error('[Chat History API] Auth error:', authError)
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    // 2. Get query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const sessionId = searchParams.get('session_id')

    // 3. Fetch chat history with pagination
    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }) // Most recent first for pagination
      // Older rows share a timestamp with their reply; this puts the user message first after the reverse below
      .order('role', { ascending: true })
      .range(offset, offset + limit - 1) // Supabase pagination

    // Optional: filter by session_id if provided
    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    const { data: messages, error: dbError } = await query

    if (dbError) {
      console.error('[Chat History API] Database error:', dbError)
      const response = NextResponse.json(
        { error: "Failed to fetch chat history" },
        { status: 500 }
      )
      return addCorsHeaders(response, origin)
    }

    const chronological = (messages || []).reverse()

    // Trades that closed in the same stretch of time, for the "trade closed" rows (one per trade; copies across
    // accounts are one row with the combined result). The newest page runs up to now.
    const from = chronological[0]?.created_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const until = offset === 0 ? null : chronological[chronological.length - 1]?.created_at ?? null
    let tradesQuery = supabase.from("trades").select("*").eq("user_id", user.id).gte("closed_at", from)
    if (until) tradesQuery = tradesQuery.lte("closed_at", until)
    const { data: tradeRows } = await tradesQuery.order("closed_at", { ascending: true }).limit(300)
    const trades = prepareTrades((tradeRows ?? []) as { id: string; account: string | null; symbol: string | null; side: string | null; opened_at: string | null; closed_at: string; realized_pnl: number | null; platform: string; qty: number | null; entry_price: number | null; exit_price: number | null; kind?: string; source?: string }[])
      .filter(t => !t.is_copy && t.source !== "manual" && t.kind !== "day_total")
      .map(t => ({ id: t.id, symbol: t.symbol, closed_at: t.closed_at, realized_pnl: t.realized_pnl, group_pnl: t.group_pnl, copies: t.copies }))

    // 4. Return messages (reverse to chronological order for display)
    const response = NextResponse.json({
      messages: chronological,
      trades,
      count: messages?.length || 0
    })
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error('[Chat History API] Error:', error)
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
