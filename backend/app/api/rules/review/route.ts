import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { mainJson } from "@/lib/llm"
import { logLlmUsage } from "@/lib/llm-cost"

// "Tighten my rules": Pip reads a trader's rules and suggests concrete,
// checkable versions of the vague ones, plus any discipline rules that are
// missing. Free (not counted against the allowance), a few times a day at most.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_PER_DAY = 10

const bodySchema = z.object({ rules_text: z.string().trim().min(1).max(10000) })

const reviewSchema = z.object({
  summary: z.string().describe("One or two friendly sentences from Pip about the rules overall"),
  suggestions: z.array(z.object({
    type: z.enum(["rewrite", "add"]).describe("rewrite: replace one of their lines; add: a new line they're missing"),
    original: z.string().nullable().describe("For rewrite: the exact line from their rules, copied character for character. Null for add."),
    why: z.string().describe("One short sentence: why Pip can't check it as written, or why it helps"),
    suggestion: z.string().describe("The new rule, one line, specific enough to check on a chart or from their trades")
  })).describe("At most 8, most useful first; empty if the rules are already clear")
})

const SYSTEM = `You are Pip, an AI trading-discipline coach. A trader asked you to tighten their trading rules so you can check them reliably against their charts and trades.

You help traders put THEIR OWN strategy into clear words. You never invent a strategy, never recommend entries, indicators or markets, and never predict anything.

What makes a rule checkable: it names concrete things you can see on a chart or in their trades: a timeframe, a level or indicator they already use, a candle condition, a time window, a number of trades, a dollar amount.

How to suggest:
- Rewrite rules that are vague ("trade with the trend", "be patient", "only good setups"). Keep their idea and fill the gaps with a concrete example drawn from what they already wrote; if their rules don't say (e.g. which timeframe), use an obvious placeholder in square brackets like [your timeframe] rather than choosing for them.
- You may add missing discipline and risk rules freely (a stop-loss rule, max trades per day, a daily loss limit, a cooldown after losses, no trading in the first minutes after the open). Don't add entry or setup rules they didn't mention.
- Leave clear rules alone. Don't rewrite for style.
- Each suggestion is one line, written like their rules (same tone, starting with "- " if theirs do).
- Keep the whole ruleset within the character limit you're given.
- "original" must be copied exactly from their text, character for character, so it can be replaced.`

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(authHeader.substring(7))
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Write a few rules first, then ask Pip to tighten them." }, { status: 400 })

  const { count, error: countError } = await supabase
    .from("llm_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("feature", "rules")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  if (!countError && (count ?? 0) >= MAX_PER_DAY) {
    return NextResponse.json({ error: "Pip has reviewed your rules a lot today. Try again tomorrow." }, { status: 429 })
  }

  const { data: profile } = await supabase.from("profiles").select("plan, trading_profile").eq("id", user.id).single()
  const plan = profile?.plan ?? "free"
  const maxChars = plan === "admin" ? 10000 : plan === "pro" ? 5000 : 1000

  try {
    const { output, tokens } = await mainJson({
      system: SYSTEM,
      prompt: [
        profile?.trading_profile ? `About the trader: ${JSON.stringify(profile.trading_profile)}` : null,
        `Character limit for the whole ruleset: ${maxChars}`,
        `Their rules:\n${parsed.data.rules_text}`
      ].filter(Boolean).join("\n\n"),
      schema: reviewSchema,
      maxTokens: 6000
    })
    after(() => logLlmUsage(supabase, user.id, "rules", tokens))

    // Only keep rewrites whose original line is really in their text
    const suggestions = output.suggestions
      .filter(s => s.suggestion.trim() && (s.type === "add" || (s.original && parsed.data.rules_text.includes(s.original))))
      .slice(0, 8)
    return NextResponse.json({ summary: output.summary, suggestions, maxChars })
  } catch (error) {
    console.error("[Rules review] Failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Pip couldn't review your rules just now. Try again in a moment." }, { status: 500 })
  }
}
