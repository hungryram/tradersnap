import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { smallText } from "@/lib/llm"
import { logLlmUsage } from "@/lib/llm-cost"
import { loadNotes, memoryContext } from "@/lib/pip-notes"
import { loadTradePatterns } from "@/lib/trade-patterns"

// Writes Pip's morning plan or end-of-session recap in his own words, using what
// he knows about the trader. The extension sends its rules-based version as the
// fallback and uses it whenever this returns no text (slow, failed, or a reply
// that dropped a number). Small model, about twice a day per trader; not counted
// against the trader's allowance.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_PER_DAY = 4

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

const bodySchema = z.object({
  kind: z.enum(["morning_plan", "session_recap"]),
  fallback: z.string().min(1).max(800),
  facts: z.record(z.string(), z.unknown()).default({}),
  timezone: z.string().max(64).optional(),
  dayStart: z.string().max(40).optional()
})

const SYSTEM = `You are Pip, a friendly AI trading-discipline coach who lives on the trader's chart. You're writing one short message you send on your own (the trader didn't ask).

Voice: warm, direct, human, like a coach who knows them. Plain words. No emojis, no hashtags, no exclamation-heavy hype.

Hard rules:
- 1 to 3 short sentences, under 320 characters in total.
- Keep every number and limit exactly as given. Don't round, add or invent numbers.
- Never give signals, predictions, price targets, or tell them to buy or sell. You coach discipline and process, not the market.
- Use at most one thing you know about them (a note or a pattern), and only if it genuinely fits today. Never say "according to my notes".
- Write only the message itself, nothing before or after it.`

const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => n.replace(/,/g, ""))

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const reply = (body: object, status = 200) => addCorsHeaders(NextResponse.json(body, { status }), origin)

  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401)
  const { data: { user } } = await supabase.auth.getUser(authHeader.substring(7))
  if (!user) return reply({ error: "Unauthorized" }, 401)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return reply({ error: "Invalid request" }, 400)
  const { kind, fallback, facts, timezone, dayStart } = parsed.data

  // A few per day at most (morning plan and recap, plus a retry or a second device)
  const { count, error: countError } = await supabase
    .from("llm_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("feature", "checkin")
    .gte("created_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
  if (!countError && (count ?? 0) >= MAX_PER_DAY) return reply({ text: null })

  try {
    const { data: profile } = await supabase.from("profiles").select("memory_enabled, trading_limits, first_name").eq("id", user.id).single()
    const memoryOn = profile?.memory_enabled !== false
    const todayStart = dayStart && !isNaN(Date.parse(dayStart)) ? new Date(dayStart) : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [notes, patterns] = memoryOn
      ? await Promise.all([
          loadNotes(supabase, user.id),
          loadTradePatterns(supabase, user.id, todayStart, profile?.trading_limits ?? null, timezone)
        ])
      : [[], []]

    const task = kind === "morning_plan"
      ? "Write the morning check-in: greet them (by name if given), restate today's plan with every limit exactly as listed, and add one short line of encouragement or focus for today."
      : "Write the end-of-session recap: state the day's numbers exactly as given, say clearly whether rules were kept or which were broken (without lecturing), and ask one short reflective question."

    const prompt = [
      task,
      `Facts for this message (JSON):\n${JSON.stringify(facts)}`,
      `The plain version you're improving on (same facts):\n${fallback}`,
      memoryContext(notes, patterns) ?? "You don't know anything else about this trader yet."
    ].join("\n\n")

    const { text, tokens } = await smallText({ system: SYSTEM, prompt, maxTokens: 300 })
    after(() => logLlmUsage(supabase, user.id, "checkin", tokens))

    // Guardrails: short, and every number from the plain version is still there
    const clean = text?.replace(/^["']|["']$/g, "").trim() ?? null
    if (!clean || clean.length > 400) return reply({ text: null })
    const have = new Set(numbersIn(clean))
    if (!numbersIn(fallback).every(n => have.has(n))) return reply({ text: null })
    return reply({ text: clean })
  } catch (error) {
    console.error("[Check-in compose] Failed:", error instanceof Error ? error.message : error)
    return reply({ text: null })
  }
}
