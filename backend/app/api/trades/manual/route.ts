import { NextRequest, NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/cors"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { alreadyLogged, loggedToday } from "@/lib/trade-claims"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (isAllowedOrigin(origin)) {
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
  // "Not now": the card is hidden everywhere and nothing is logged
  dismiss: z.boolean().optional(),
  amount: z.number().finite().refine(n => n !== 0 && Math.abs(n) <= 1_000_000).optional(),
  symbol: z.string().max(20).nullable().optional(),
  // trade: one position. day_total: their total for the day; what is logged is the difference from the journal.
  kind: z.enum(["trade", "day_total"]).default("trade"),
  day_start: z.string().datetime().optional(),
  // Which strategy they traded; none means no strategy (or something else)
  strategy_id: z.string().uuid().nullable().optional()
})

// Remembers the card's outcome on the chat message, so every tab and reload shows the same thing.
// Quietly does nothing before 20261023_trade_proposals.sql.
async function markProposal(userId: string, proposalId: string, status: "logged" | "duplicate" | "dismissed") {
  const { data } = await supabase
    .from("chat_messages")
    .select("id, trade_proposal")
    .eq("user_id", userId)
    .eq("trade_proposal->>id", proposalId)
    .maybeSingle()
  if (!data) return
  await supabase.from("chat_messages").update({ trade_proposal: { ...data.trade_proposal, status } }).eq("id", data.id)
}

// Pip's reply when the trader logs a result. Saved in the chat so it survives reloads and other tabs.
const fmt = (n: number) => `${n < 0 ? "-" : "+"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`

async function saveReply(userId: string, content: string) {
  const { data } = await supabase.from("chat_messages").insert({ user_id: userId, role: "assistant", content }).select("id").single()
  return { message: content, messageId: data?.id ?? null }
}

async function acknowledge(userId: string, amount: number, symbol: string | null, duplicate: boolean, strategy: string | null = null) {
  const money = fmt(amount)
  const content = duplicate
    ? "I already had that one in your journal, so there's nothing new to add."
    : `Logged. ${money}${symbol ? ` on ${symbol}` : ""}${strategy ? ` (${strategy})` : ""} is in your journal. Did that one follow your plan?`
  return saveReply(userId, content)
}

// POST /api/trades/manual — the trader tapped "Log it" (or "Not now") on a result they told Pip about
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const reply = (body: object, status = 200) => addCorsHeaders(NextResponse.json(body, { status }), origin)

  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "")
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!user) return reply({ error: "Unauthorized" }, 401)

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return reply({ error: "Invalid trade" }, 400)
    const { proposal_id, dismiss, amount, symbol, strategy_id, kind, day_start } = parsed.data

    if (dismiss) {
      await markProposal(user.id, proposal_id, "dismissed")
      return reply({ success: true })
    }
    if (amount === undefined) return reply({ error: "Invalid trade" }, 400)

    if (kind === "day_total") {
      // Log only what the journal is missing, so the day adds up to what they said
      const startOfDay = day_start ? new Date(day_start) : new Date(Date.now() - 18 * 60 * 60 * 1000)
      const today = await loggedToday(supabase, user.id, startOfDay)
      const missing = Math.round((amount - today.net) * 100) / 100
      if (Math.abs(missing) < 0.5) {
        await markProposal(user.id, proposal_id, "duplicate")
        return reply({ success: true, duplicate: true, ...(await saveReply(user.id, `Your journal already adds up to ${fmt(amount)} for today, so there's nothing to add.`)) })
      }
      const { error } = await supabase.from("trades").upsert({
        user_id: user.id,
        client_trade_id: `manual:${proposal_id}`,
        platform: "manual",
        source: "manual",
        kind: "day_total",
        symbol: null,
        realized_pnl: missing,
        pnl_source: "realized",
        closed_at: new Date().toISOString()
      }, { onConflict: "user_id,client_trade_id", ignoreDuplicates: true })
      if (error) {
        console.error("[Manual trade] Day total insert error:", error)
        return reply({ error: "Couldn't log that. Try again in a moment." }, 500)
      }
      await markProposal(user.id, proposal_id, "logged")
      const had = today.net !== 0 ? ` (I already had ${fmt(today.net)})` : ""
      return reply({ success: true, ...(await saveReply(user.id, `Logged. I added ${fmt(missing)}${had} so your day shows ${fmt(amount)}. It counts toward your P&L, not your trade count. How did the day follow your plan?`)) })
    }

    // The same result may have been picked up from the platform since Pip offered
    if (await alreadyLogged(supabase, user.id, amount)) {
      await markProposal(user.id, proposal_id, "duplicate")
      return reply({ success: true, duplicate: true, ...(await acknowledge(user.id, amount, null, true)) })
    }

    const { count } = await supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("source", "manual")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if ((count ?? 0) >= MAX_PER_DAY) return reply({ error: "That's a lot of manual trades for one day. Try again tomorrow." }, 429)

    // Only one of their own strategies
    let strategy: { id: string; name: string } | null = null
    if (strategy_id) {
      const { data } = await supabase.from("rulesets").select("id, name").eq("id", strategy_id).eq("user_id", user.id).maybeSingle()
      strategy = data
    }

    const cleanSymbol = symbol?.replace(/[^A-Za-z0-9:._!-]/g, "").toUpperCase() || null
    const { error } = await supabase.from("trades").upsert({
      user_id: user.id,
      client_trade_id: `manual:${proposal_id}`,
      platform: "manual",
      source: "manual",
      symbol: cleanSymbol,
      realized_pnl: Math.round(amount * 100) / 100,
      pnl_source: "realized",
      closed_at: new Date().toISOString(),
      ...(strategy ? { strategy_id: strategy.id, strategy_source: "user" } : {})
    }, { onConflict: "user_id,client_trade_id", ignoreDuplicates: true })

    if (error) {
      console.error("[Manual trade] Insert error:", error)
      return reply({ error: "Couldn't log that trade. Try again in a moment." }, 500)
    }
    await markProposal(user.id, proposal_id, "logged")
    return reply({ success: true, ...(await acknowledge(user.id, amount, cleanSymbol, false, strategy?.name ?? null)) })
  } catch (error) {
    console.error("[Manual trade] Error:", error)
    return reply({ error: "Internal server error" }, 500)
  }
}
