import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Request validation schema
const analyzeRequestSchema = z.object({
  rulesetId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  context: z.object({
    symbol: z.string().optional(),
    timeframe: z.string().optional(),
    notes: z.string().optional()
  }).optional(),
  image: z.string().regex(/^data:image\/(png|jpeg|jpg);base64,/)
})

// Response schema
const analysisResponseSchema = z.object({
  verdict: z.enum(["pass", "warn", "fail"]),
  summary: z.string(),
  bullets: z.array(z.string()),
  levels_to_watch: z.array(z.object({
    label: z.string(),
    type: z.enum(["support", "resistance", "structure", "invalidation"]),
    relative_location: z.string(),
    why_it_matters: z.string(),
    confidence: z.enum(["low", "medium", "high"])
  })),
  rule_violations: z.array(z.string()),
  missing_confirmations: z.array(z.string()),
  behavioral_nudge: z.string(),
  follow_up_question: z.string().optional(),
  drawings: z.array(z.union([
    z.object({
      type: z.literal("trendline"),
      anchors: z.array(z.object({
        x_rel: z.number().min(0).max(1),
        price: z.number()
      })).length(2),
      label: z.string(),
      color: z.enum(["blue", "red", "green", "yellow", "purple"]),
      style: z.enum(["solid", "dashed"]).optional(),
      confidence: z.enum(["low", "medium", "high"]).optional()
    }),
    z.object({
      type: z.literal("zone"),
      x_start_rel: z.number().min(0).max(1),
      x_end_rel: z.number().min(0).max(1),
      price_min: z.number(),
      price_max: z.number(),
      label: z.string(),
      color: z.enum(["blue", "red", "green", "yellow", "purple"]),
      style: z.enum(["solid", "dashed"]).optional(),
      confidence: z.enum(["low", "medium", "high"]).optional()
    })
  ])).optional()
})

// Helper to add CORS headers
function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin")
  const response = new NextResponse(null, { status: 200 })
  return addCorsHeaders(response, origin)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  
  try {
    // 1. Validate JWT from Authorization header
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    const token = authHeader.substring(7)
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.error('[Analyze API] Auth error:', authError)
      const response = NextResponse.json({ error: "Invalid token" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    // 2. Fetch user profile with usage data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, message_count, screenshot_count, usage_reset_date')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[Analyze API] Profile fetch error:', profileError)
      const response = NextResponse.json({ error: "Profile not found" }, { status: 404 })
      return addCorsHeaders(response, origin)
    }

    // Check if usage needs to be reset
    const today = new Date().toISOString().split('T')[0]
    if (profile.usage_reset_date < today) {
      await supabase
        .from('profiles')
        .update({ 
          message_count: 0, 
          screenshot_count: 0, 
          usage_reset_date: today 
        })
        .eq('id', user.id)
      profile.message_count = 0
      profile.screenshot_count = 0
    }

    // 3. Check daily screenshot limit
    const limits = {
      maxScreenshots: profile.plan === 'pro' ? 50 : 5
    }

    if (profile.screenshot_count >= limits.maxScreenshots) {
      const response = NextResponse.json({
        error: "Daily screenshot limit reached",
        message: profile.plan === 'pro'
          ? "You've reached your daily limit of 50 chart analyses. Your limit resets at midnight UTC."
          : "You've used all 5 free chart analyses today. Upgrade to Pro for 50 charts/day.",
        limit: limits.maxScreenshots,
        current: profile.screenshot_count,
        requiresUpgrade: profile.plan !== 'pro'
      }, { status: 429 })
      return addCorsHeaders(response, origin)
    }

    // 4. Parse and validate request body
    const body = await request.json()
    const validatedRequest = analyzeRequestSchema.parse(body)

    // 5. Fetch ruleset
    const { data: ruleset } = await supabase
      .from("rulesets")
      .select("*")
      .eq("id", validatedRequest.rulesetId)
      .eq("user_id", user.id)
      .single()

    if (!ruleset) {
      const response = NextResponse.json({ error: "Ruleset not found" }, { status: 404 })
      return addCorsHeaders(response, origin)
    }

    // 6. Call OpenAI Vision API
    const coachingPrompt = `You are a sharp, experienced trading coach analyzing charts.
You call it like you see it—no corporate speak, no hand-holding.

USER'S TRADING RULES:
${ruleset.rules_text}

CONTEXT:
Symbol: ${validatedRequest.context?.symbol || "Unknown"}
Timeframe: ${validatedRequest.context?.timeframe || "Unknown"}  
Notes: ${validatedRequest.context?.notes || "None"}

---
YOUR JOB:

1. **Identify the setup**: Read the chart—asset, timeframe, what's happening structurally
2. **Check their rules**: Do their confirmations exist or not? Be honest.
3. **Give your read**: Is this clean, messy, valid, or forced?
4. **Challenge them**: Ask the question that makes them think twice
5. **Be curious when uncertain**: Ask rather than guess

---
CONFIDENCE-GATED APPROACH:

**Answer confidently** when details are clear:
- "Sharp drop to 25,340, then recovery - uptrend rebuilding"
- "Resistance at 25,730-25,740 held twice - that's a level"

**Answer + ask** when structure visible but details unclear:
- "Support looks like it's holding around 25,600. That said, can't tell what the blue line tracking price is - VWAP or custom MA? A zoomed shot of the last 20-30 candles would help me give sharper feedback."

**Refuse to guess** when too unclear:
- "Don't want to guess here - can't clearly see the timeframe or what those indicators are. Tell me the timeframe and what the lines represent?"

**Guidelines:**
- Prefer precision over confidence
- Ask 1-2 high-leverage questions max in follow_up_question field
- Explain WHY you need clarification
- Never hallucinate indicator meanings

---
HOW TO DESCRIBE WHAT YOU SEE:

✓ "Sharp drop to 25,340, then recovered—higher lows forming, uptrend rebuilding"
✓ "Resistance at 25,730-25,740 held twice—that's a level to watch"
✓ "Choppy consolidation, no clear structure—I'd stay out"
✓ "Clean breakout above prior swing high at 25,650"

Use trader language:
- Support/resistance held or broke
- Clean rejection vs weak bounce
- Trending hard vs choppy/ranging
- Structure intact vs invalidated

---
BEHAVIORAL COACHING:

Don't ask boring questions like "Are you in a position or considering a setup?"

Instead:
- "Why this chart right now? FOMO or does it match your plan?"
- "If you lose on this, will you be pissed at the market or at yourself for forcing it?"
- "Your rules say X, but this chart shows Y. So what's the move?"
- "This looks clean per your rules. What's stopping you—fear or discipline?"

Call out emotional trading:
- If it's FOMO: "You're chasing. Walk away."
- If it's revenge: "Trying to make it back? That's how you blow up."
- If they're hesitating on a good setup: "Your plan says go. Trust it or change it."

---
RESPONSE FORMAT (JSON):

{
  "verdict": "pass" | "warn" | "fail",
  "summary": "One punchy sentence describing what happened (NOT a question)",
  "bullets": [
    "Sharp drop to 25,340, then gradual recovery",
    "Resistance holding at 25,730-25,740 zone", 
    "Higher lows forming—uptrend structure rebuilding"
  ],
  "levels_to_watch": [{
    "label": "Resistance at 25,730-25,740",
    "type": "resistance",
    "relative_location": "above current price",
    "why_it_matters": "Price rejected here twice—key level",
    "confidence": "high"
  }],
  "rule_violations": ["Missing X confirmation per your rules"],
  "missing_confirmations": ["No volume spike", "No confirmation candle yet"],
  "behavioral_nudge": "One sharp coaching sentence that challenges or validates them",
  "follow_up_question": "One direct question that makes them think (not generic)"
}

verdict meanings:
- **pass**: Their rules are clearly met—setup looks valid
- **warn**: Iffy—some confirmations missing or structure unclear
- **fail**: Violates their rules or structure is broken

---
EXAMPLES OF GOOD BEHAVIORAL NUDGES:

✓ "You said you don't trade ranges—this IS a range. Why are you looking?"
✓ "Your rules check out. Now execute or admit you don't trust your system."
✓ "If you're forcing this trade, you already know the answer."
✓ "Clean setup per your plan—stop overthinking and follow your rules."

✗ "Consider your risk tolerance and plan carefully" (too generic)
✗ "What are your thoughts on this setup?" (boring, passive)

---
REMEMBER: Be direct, be real, make them think. No corporate compliance speak.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: coachingPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: validatedRequest.image
              }
            },
            { type: "text", text: "Analyze this chart." }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500
    })

    const aiResponse = JSON.parse(completion.choices[0].message.content || "{}")
    const validatedResponse = analysisResponseSchema.parse(aiResponse)

    // Save analysis to database (linked to session for deletion)
    await supabase.from("analyses").insert({
      user_id: user.id,
      ruleset_id: validatedRequest.rulesetId,
      session_id: validatedRequest.sessionId || null,
      verdict: validatedResponse.verdict,
      payload: validatedResponse
    })

    // Increment screenshot counter
    await supabase
      .from('profiles')
      .update({
        screenshot_count: profile.screenshot_count + 1
      })
      .eq('id', user.id)

    const response = NextResponse.json(validatedResponse)
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("Analysis error:", error)
    
    if (error instanceof z.ZodError) {
      const response = NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      )
      return addCorsHeaders(response, origin)
    }

    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
