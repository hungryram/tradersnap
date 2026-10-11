import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { smallText } from "@/lib/llm"
import { logLlmUsage } from "@/lib/llm-cost"
import { loadNotes, memoryContext } from "@/lib/pip-notes"
import { loadTradePatterns } from "@/lib/trade-patterns"

// Writes any of Pip's check-ins in his own words, using what he knows about the
// trader. The extension sends its rules-based version as the fallback and uses it
// whenever this returns no text (slow, failed, or a reply that dropped a number).
// Small model; not counted against the trader's allowance.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_PER_DAY = 30

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

const KINDS = ["morning_plan", "session_recap", "loss_streak", "daily_loss", "revenge", "max_trades", "over_max", "outside_hours", "big_win"] as const

const bodySchema = z.object({
  kind: z.enum(KINDS),
  fallback: z.string().min(1).max(800),
  facts: z.record(z.string(), z.unknown()).default({}),
  timezone: z.string().max(64).optional(),
  dayStart: z.string().max(40).optional()
})

// What each check-in is for; the plain version always carries the facts
const TASKS: Record<(typeof KINDS)[number], string> = {
  morning_plan: "The morning check-in: greet them (by name if given), restate today's plan with every limit, and add one short line of focus for today.",
  session_recap: "The end-of-session recap: state the day's numbers, say plainly whether rules were kept or which were broken (no lecturing), and ask one short reflective question.",
  loss_streak: "A warning in the moment: they just hit a losing streak. Calm and direct, like a coach putting a hand on their shoulder. If they've hit their stop rule, be clear the day is done.",
  daily_loss: "A warning in the moment: they're past their daily loss limit. Calm, firm and kind; their own rule says stop.",
  revenge: "A warning in the moment: they opened a new trade minutes after a loss. Ask whether it's their plan or the last trade talking. No accusations.",
  max_trades: "A heads-up: that was their last allowed trade for today. Acknowledge it and say the day's done by their rule.",
  over_max: "A warning in the moment: they're opening a trade past their daily max. Ask what's different about this one, gently.",
  outside_hours: "A heads-up: they're trading outside the hours they set. Point it out and ask if it's worth breaking their rule.",
  big_win: "After a big winning trade: congratulate them briefly, then remind them that overconfidence follows big wins.",
}

const SYSTEM = `You are Pip, a friendly AI trading-discipline coach who lives on the trader's chart. You're writing one short message you send on your own (the trader didn't ask).

Voice: warm, direct, human, like a coach who knows them. Plain words. No emojis, no hashtags, no hype.

Hard rules:
- Warnings: 1 or 2 short sentences. Morning plan and recap: up to 3. Under 320 characters in total.
- Keep every number, amount, time and limit from the plain version, written exactly the same way, as digits ("2", not "two"; "$500", not "500 dollars").
- Never give signals, predictions or price targets, or tell them to buy or sell. You coach discipline and process, not the market.
- Use at most one thing you know about them (a note or a pattern), only if it genuinely fits right now. Never say "according to my notes".
- Write only the message itself.`

const WORDS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" }
// Digits in a message; with words, "two" counts as "2" too (Pip's side only, so phrases
// like "one good setup" in the plain version don't become required numbers)
const numbersIn = (text: string, words = false) => {
  const source = words ? text.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, w => WORDS[w]) : text
  return (source.match(/\d+(?:[.,]\d+)*/g) ?? []).map(n => n.replace(/,/g, ""))
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const reply = (body: object, status = 200) => addCorsHeaders(NextResponse.json(body, { status }), origin)
  // No text: the extension shows its plain version. `reason` says why, for debugging.
  const fallback = (reason: string, detail?: unknown) => {
    console.warn(`[Check-in compose] Fallback: ${reason}`, detail ?? "")
    return reply({ text: null, reason })
  }

  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401)
  const { data: { user } } = await supabase.auth.getUser(authHeader.substring(7))
  if (!user) return reply({ error: "Unauthorized" }, 401)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return reply({ error: "Invalid request" }, 400)
  const { kind, facts, timezone, dayStart } = parsed.data
  const plain = parsed.data.fallback

  const { count, error: countError } = await supabase
    .from("llm_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("feature", "checkin")
    .gte("created_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
  if (!countError && (count ?? 0) >= MAX_PER_DAY) return fallback("daily_cap")

  try {
    const { data: profile } = await supabase.from("profiles").select("memory_enabled, trading_limits").eq("id", user.id).single()
    const memoryOn = profile?.memory_enabled !== false
    const todayStart = dayStart && !isNaN(Date.parse(dayStart)) ? new Date(dayStart) : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [notes, patterns] = memoryOn
      ? await Promise.all([
          loadNotes(supabase, user.id),
          loadTradePatterns(supabase, user.id, todayStart, profile?.trading_limits ?? null, timezone)
        ])
      : [[], []]

    const prompt = [
      `Write this check-in: ${TASKS[kind]}`,
      Object.keys(facts).length ? `Facts (JSON):\n${JSON.stringify(facts)}` : null,
      `The plain version (same facts; keep all of its numbers):\n${plain}`,
      memoryContext(notes, patterns) ?? "You don't know anything else about this trader yet."
    ].filter(Boolean).join("\n\n")

    const { text, tokens, stop } = await smallText({ system: SYSTEM, prompt, maxTokens: 300 })
    after(() => logLlmUsage(supabase, user.id, "checkin", tokens))

    const clean = text?.replace(/^["'\s]+|["'\s]+$/g, "") ?? ""
    if (!clean) return fallback("no_text", stop)
    if (clean.length > 420) return fallback("too_long", clean.length)
    const have = new Set(numbersIn(clean, true))
    const missing = numbersIn(plain).filter(n => !have.has(n))
    if (missing.length) return fallback("numbers_changed", { missing, clean })
    return reply({ text: clean })
  } catch (error) {
    return fallback("error", error instanceof Error ? error.message : error)
  }
}
