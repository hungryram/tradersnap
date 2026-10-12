import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { alreadyLogged } from "@/lib/trade-claims"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  return addCorsHeaders(new NextResponse(null, { status: 200 }), request.headers.get("origin"))
}

const MAX_PER_DAY = 20

const bodySchema = z.object({
  // Made by the chat reply; logging the same card twice saves one trade
  proposal_id: z.string().uuid(),
  amount: z.number().finite().refine(n => n !== 0 && Math.abs(n) <= 1_000_000),
  symbol: z.string().max(20).nullable().optional()
})

// POST /api/trades/manual — the trader tapped "Log it" on a result they told Pip about
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const reply = (body: object, status = 200) => addCorsHeaders(NextResponse.json(body, { status }), origin)

  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "")
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!user) return reply({ error: "Unauthorized" }, 401)

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return reply({ error: "Invalid trade" }, 400)
    const { proposal_id, amount, symbol } = parsed.data

    // The same result may have been picked up from the platform since Pip offered
    if (await alreadyLogged(supabase, user.id, amount)) return reply({ success: true, duplicate: true })

    const { count } = await supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("source", "manual")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if ((count ?? 0) >= MAX_PER_DAY) return reply({ error: "That's a lot of manual trades for one day. Try again tomorrow." }, 429)

    const { error } = await supabase.from("trades").upsert({
      user_id: user.id,
      client_trade_id: `manual:${proposal_id}`,
      platform: "manual",
      source: "manual",
      symbol: symbol?.replace(/[^A-Za-z0-9:._!-]/g, "").toUpperCase() || null,
      realized_pnl: Math.round(amount * 100) / 100,
      pnl_source: "realized",
      closed_at: new Date().toISOString()
    }, { onConflict: "user_id,client_trade_id", ignoreDuplicates: true })

    if (error) {
      console.error("[Manual trade] Insert error:", error)
      return reply({ error: "Couldn't log that trade. Try again in a moment." }, 500)
    }
    return reply({ success: true })
  } catch (error) {
    console.error("[Manual trade] Error:", error)
    return reply({ error: "Internal server error" }, 500)
  }
}
