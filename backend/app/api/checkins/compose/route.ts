import { NextRequest, NextResponse, after } from "next/server"
import { aiBudgetBlock } from "@/lib/ai-budget"
import { isAllowedOrigin } from "@/lib/cors"
import { z } from "zod"
import { PIP_BOUNDARIES, PIP_IDENTITY, PIP_VOICE } from "@/lib/pip-voice"
import { createClient } from "@supabase/supabase-js"
import { smallText } from "@/lib/llm"
import { logLlmUsage } from "@/lib/llm-cost"
import { loadNotes, memoryContext } from "@/lib/pip-notes"
import { loadTradePatterns } from "@/lib/trade-patterns"
import { dayRuleOf } from "@/lib/trading-day"

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

const KINDS = ["morning_plan", "session_recap", "loss_streak", "daily_loss", "revenge", "max_trades", "over_max", "outside_hours", "big_win", "loss_reset", "size_up", "max_size"] as const

const bodySchema = z.object({
  kind: z.enum(KINDS),
  fallback: z.string().min(1).max(800),
  facts: z.record(z.string(), z.unknown()).default({}),
  timezone: z.string().max(64).optional(),
  dayStart: z.string().max(40).optional()
})

// What each check-in is for; the plain version always carries the facts
const TASKS: Record<(typeof KINDS)[number], string> = {
  morning_plan: "The morning check-in: greet them (by name if given), restate today's plan with every limit, and add one short line of focus for today. If streak_days is 2 or more, mention their run of days with no rules broken.",
  session_recap: "The end-of-session recap: state the day's numbers, say plainly whether rules were kept or which were broken (no lecturing), and ask one short reflective question.",
  loss_streak: "A warning in the moment: they just hit a losing streak. Calm and direct, like a coach putting a hand on their shoulder. If they've hit their stop rule, be clear the day is done.",
  daily_loss: "A warning in the moment: they're past their daily loss limit. Calm, firm and kind; their own rule says stop.",
  revenge: "A warning in the moment: they already opened a new position minutes after a loss (it's live now). Ask whether it's their plan or the last trade talking. No accusations.",
  max_trades: "A heads-up: that was their last allowed trade for today. Acknowledge it and say the day's done by their rule.",
  over_max: "A warning in the moment: they already opened a trade past their daily max (it's live now). Ask what's different about this one, gently.",
  outside_hours: "A heads-up: they just opened a trade outside the hours they set. Point it out and ask if it's worth breaking their rule.",
  big_win: "After a winning trade. If the plain version is about position size (a win at far more than their usual size) or winning back losses, do not congratulate them: say plainly it was a big risk that happened to work and steer them back to their plan. Otherwise acknowledge the win briefly, then remind them that overconfidence follows big wins.",
  size_up: "A heads-up in the moment: they just opened a position clearly bigger than their usual size today (it's live now). Name the jump plainly and ask whether the size is part of their plan. Firmer if it came right after a loss.",
  max_size: "A warning in the moment: they just opened a position bigger than their own max position size (it's live now). Calm and direct: their rule says no more than that.",
  loss_reset: "After a single losing trade: acknowledge it without drama and suggest a 60-second reset before the next trade (a button for it appears under your message). One or two sentences.",
}

const SYSTEM = `${PIP_IDENTITY}

${PIP_BOUNDARIES}

${PIP_VOICE}

Right now you're writing one short check-in you send on your own (the trader didn't ask).

Hard rules:
- Warnings: 1 or 2 short sentences. Morning plan and recap: up to 3. Under 320 characters in total.
- Keep every number, amount, time and limit from the plain version, written exactly the same way, as digits ("2", not "two"; "$500", not "500 dollars").
- Never give signals, predictions or price targets, or tell them to buy or sell. You coach discipline and process, not the market.
- Use at most one thing you know about them (a note or a pattern), only if it genuinely fits right now. Never say "according to my notes".
- Only state what you were given. Never invent a past event or link two facts that weren't linked for you (for example, don't say a past mistake happened "after a loss" unless that's in the facts).
- Never mention what you don't know or where your information comes from (no "no name on file", "based on your data", "my notes say").
- Don't tell them how to respond (no "no need to answer", "reply below"); just say your piece or ask your question.
- When a trade is already open, don't talk as if they haven't clicked yet.
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
  const { kind, timezone, dayStart } = parsed.data
  // Leave out empty facts (like a missing name) so Pip doesn't remark on them
  const facts = Object.fromEntries(Object.entries(parsed.data.facts).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)))
  const plain = parsed.data.fallback

  const { count, error: countError } = await supabase
    .from("llm_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("feature", "checkin")
    .gte("created_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
  if (!countError && (count ?? 0) >= MAX_PER_DAY) return fallback("daily_cap")
  if (JSON.stringify(parsed.data.facts).length > 4000) return fallback("facts_too_long")
  if (await aiBudgetBlock(supabase, user.id)) return fallback("budget")

  try {
    const { data: profile } = await supabase.from("profiles").select("memory_enabled, trading_limits, trading_profile").eq("id", user.id).single()
    const memoryOn = profile?.memory_enabled !== false
    const todayStart = dayStart && !isNaN(Date.parse(dayStart)) ? new Date(dayStart) : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [notes, patterns] = memoryOn
      ? await Promise.all([
          loadNotes(supabase, user.id),
          loadTradePatterns(supabase, user.id, todayStart, profile?.trading_limits ?? null, timezone, dayRuleOf(profile?.trading_profile))
        ])
      : [[], []]

    // What Pip already told them today, so he builds on it instead of repeating himself
    const { data: earlier } = await supabase
      .from("chat_messages")
      .select("content, created_at")
      .eq("user_id", user.id)
      .eq("kind", "checkin")
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(8)
    const earlierLines = (earlier ?? []).reverse().map(m => `- ${new Date(m.created_at).toLocaleTimeString("en-US", { timeZone: timezone || "America/New_York", hour: "numeric", minute: "2-digit" })}: ${m.content}`)

    // The last few messages between them today, so the check-in fits what the trader just said (for example that they
    // sized up to win money back) instead of reading like it came from nowhere
    const { data: recentChat } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(6)
    const conversation = (recentChat ?? []).reverse()
      .filter(m => typeof m.content === "string" && !m.content.trim().startsWith("{"))
      .map(m => `${m.role === "user" ? "Trader" : "You"}: ${m.content.replace(/\s+/g, " ").slice(0, 300)}`)

    const prompt = [
      `Write this check-in: ${TASKS[kind]}`,
      Object.keys(facts).length ? `Facts (JSON):\n${JSON.stringify(facts)}` : null,
      `The plain version (same facts; keep all of its numbers):\n${plain}`,
      memoryContext(notes, patterns) ?? "You don't know anything else about this trader yet.",
      conversation.length ? `Your conversation with them in the last while (oldest first). If they told you how they feel or what they're doing, this message must fit it, and never contradict it:\n${conversation.join("\n")}` : null,
      earlierLines.length ? `What you already told them today (don't repeat it; if this is the same problem again, say so plainly):\n${earlierLines.join("\n")}` : null
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
