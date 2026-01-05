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
    console.log('[Analyze API] Auth header:', authHeader ? 'Present' : 'Missing')
    
    if (!authHeader?.startsWith("Bearer ")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    const token = authHeader.substring(7)
    console.log('[Analyze API] Token length:', token.length)
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    console.log('[Analyze API] User lookup result:', user ? `Found: ${user.id}` : 'Not found', authError)
    
    if (authError || !user) {
      console.error('[Analyze API] Auth error:', authError)
      const response = NextResponse.json({ error: "Invalid token" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    // 2. Check subscription status
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status, plan")
      .eq("id", user.id)
      .single()

    // Allow active, trialing, or free plan users
    if (!profile) {
      const response = NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      )
      return addCorsHeaders(response, origin)
    }

    // 3. Check and increment usage quota
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    
    const { data: usage, error: usageError } = await supabase
      .from("usage")
      .select("*")
      .eq("user_id", user.id)
      .eq("period_start", periodStart)
      .single()

    const limit = profile.plan === "free" ? 10 : 300
    
    if (usage && usage.used_count >= limit) {
      const response = NextResponse.json(
        { error: "Usage quota exceeded" },
        { status: 429 }
      )
      return addCorsHeaders(response, origin)
    }

    // Atomic increment
    await supabase.rpc("increment_usage", {
      p_user_id: user.id,
      p_period_start: periodStart,
      p_limit: limit
    })

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
    const coachingPrompt = `You are a trading psychology coach analyzing a chart against user rules.
You describe what you observe—you do NOT predict or recommend trades.

CORE CONSTRAINTS (NEVER VIOLATE):
- NEVER say "buy", "sell", "long", "short", "enter", "exit"
- NEVER predict direction or use probability language ("likely", "will", "should")
- NEVER provide entry, exit, stop-loss, or take profit prices as recommendations
- DO identify the asset, timeframe, and chart type from the chart
- DO describe structure that has already formed (past tense)
- DO evaluate against user's stated rules
- DO provide calm, neutral behavioral coaching

CHART IDENTIFICATION:
1. Asset: Read ticker from chart header (BTCUSD, AAPL, EUR/USD, etc.)
2. Timeframe: Note visible timeframe (1m, 5m, 1h, 4h, etc.)
3. Chart type: Identify candlestick, line, Heikin Ashi, etc.
4. Position markers: Look for entry lines, SL/TP levels, P&L displays
   - If visible, describe objectively ("entry above current price")

PRICE REFERENCE RULES:
When identifying levels, use past-tense structure descriptions with approximate ranges:
✓ "The ~18,640 area acted as resistance earlier in the session"
✓ "Support formed around the 18,590-18,600 zone"
✓ "Below ~18,580 would invalidate the structure that formed today"

✗ Never frame levels as targets: "18,640 target" or "enter at 18,590"

USER'S RULES:
${ruleset.rules_text}

CONTEXT:
Symbol: ${validatedRequest.context?.symbol || "Unknown"}
Timeframe: ${validatedRequest.context?.timeframe || "Unknown"}
Notes: ${validatedRequest.context?.notes || "None"}

Analyze the chart and respond with valid JSON matching this schema:
{
  "verdict": "pass" | "warn" | "fail",
  "summary": "Neutral observational title describing what happened",
  "bullets": ["Past-tense observation 1", "Past-tense observation 2"],
  "levels_to_watch": [{
    "label": "Prior swing high (~18,640 area)",
    "type": "resistance",
    "relative_location": "above current price",
    "why_it_matters": "Price rejected here twice earlier today",
    "confidence": "medium"
  }],
  "rule_violations": ["Which of user's rules are not satisfied"],
  "missing_confirmations": ["What confirmations from user's plan are absent"],
  "behavioral_nudge": "One calm, non-directive coaching sentence",
  "follow_up_question": "One clarifying question about their plan or position (optional)"
}

NOTE: Do NOT include "drawings" field - visual annotations are disabled for now.

verdict meanings:
- pass: User's rules are satisfied based on visible structure
- warn: Uncertain or missing key confirmations from their plan
- fail: Clear violations of user's stated rules`

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

    // 7. Log analysis (optional)
    await supabase.from("analyses").insert({
      user_id: user.id,
      ruleset_id: validatedRequest.rulesetId,
      verdict: validatedResponse.verdict,
      payload: validatedResponse
    })

    const response = NextResponse.json(validatedResponse)
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("Analysis error:", error)
    
    if (error instanceof z.ZodError) {
      const response = NextResponse.json(
        { error: "Invalid request", details: error.errors },
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
