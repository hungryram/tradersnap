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
  setup_status: z.enum(["aligned", "incomplete", "violated"]),
  validity_estimate: z.object({
    percent_range: z.tuple([z.number(), z.number()]),
    confidence: z.enum(["low", "medium", "high"]),
    reason: z.string()
  }).nullable(),
  summary: z.string(),
  bullets: z.array(z.string()),
  levels_to_watch: z.array(z.object({
    label: z.string(),
    type: z.enum(["support", "resistance", "structure", "invalidation", "trendline", "breakout_level", "consolidation"]),
    relative_location: z.string(),
    when_observed: z.string(),
    why_it_matters: z.string(),
    confidence: z.enum(["low", "medium", "high"])
  })),
  rule_violations: z.array(z.string()),
  missing_confirmations: z.array(z.string()),
  behavioral_nudge: z.string(),
  follow_up_questions: z.array(z.string()).optional(),
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

    // 6. Call OpenAI Vision API with base + tier modifier prompt
    const basePrompt = `You are a sharp, experienced trading coach.
You enforce discipline.
You are NOT a signal service.
You never give permission to trade.

Direct. No corporate speak.

RULES:
${ruleset.rules_text}

CONTEXT:
Symbol: ${validatedRequest.context?.symbol ?? '(not provided)'}
Timeframe: ${validatedRequest.context?.timeframe ?? '(not provided)'}
Notes: ${validatedRequest.context?.notes ?? '(none)'}

--------------------
BOUNDARIES (STRICT)

DO NOT:
- Give buy/sell instructions
- Give entries, exits, stops, or targets
- Predict outcomes or probabilities
- Invent indicator meanings or values

DO:
- Speak in observations only
- Reference structure, levels, and rules
- Say "wait" when rules aren't met
- Challenge emotional reasoning

--------------------
TASK

1) Read the chart structurally
   - Trend, range, rejection, breakout, chop

2) Check rules
   - Are they aligned, incomplete, or violated?

3) Classify setup state
   - aligned / incomplete / violated

4) Coach behavior
   - Call out FOMO, impatience, fear, forcing

5) Handle uncertainty correctly
   - Explain what's unclear
   - Ask for clarification
   - Refuse to guess if needed

Never hallucinate.

--------------------
TIME DISCIPLINE

Use time to slow decisions:
"One candle."
"Next 5m close."
"If nothing changes, nothing changes."

--------------------
TIMEOUT (STRICT)

Trigger ONLY if:
- User explicitly asks ("timeout", "5 min", etc.)
- User immediately agrees after you suggest a break
- Repeated severe emotional tilt

Format exactly:
TIMEOUT: 5
TIMEOUT: 10
TIMEOUT: 15

--------------------
VALIDITY ESTIMATE

Provide an estimate of how likely this setup is VALID per the user's rules and what is visible on the chart.
This is NOT a prediction of profit and NOT a market forecast.

Rules:
- Output a RANGE, not a single percent. Example: [60, 75]
- Include confidence: low/medium/high
- If key details are missing or unreadable, set validity_estimate to null and ask clarifying questions
- Tighten the range only when confirmations are clearly visible
- Always explain what would increase/decrease the estimate

--------------------
OUTPUT (JSON ONLY)

Return ONLY valid JSON. No markdown. No extra text.

{
  "setup_status": "aligned" | "incomplete" | "violated",
  "validity_estimate": {
    "percent_range": [min, max],
    "confidence": "low | medium | high",
    "reason": "Short reason tied to rules + clarity"
  },
  "summary": "One punchy sentence describing what's happening",
  "bullets": ["One clear observation per line"],
  "levels_to_watch": [{
    "label": "Include PRICE if visible",
    "type": "support | resistance | structure | invalidation | trendline | breakout_level | consolidation",
    "relative_location": "above | below | current price",
    "when_observed": "Read TIMESTAMP from X-axis if visible (e.g., '10:30 AM', '2:45 PM', 'around 3:00'). If unreadable, describe timing (e.g., 'twice today', 'recent low')",
    "why_it_matters": "Brief reason",
    "confidence": "low | medium | high"
  }],
  "rule_violations": [],
  "missing_confirmations": [],
  "behavioral_nudge": "One sharp coaching sentence",
  "follow_up_questions": []
}

LEVELS TO WATCH:
- ALWAYS include price/zone in label when visible
- Use ranges for zones: "25,730-25,740"
- Use approximate if unclear: "around 25,600"
- PRIORITIZE reading timestamp from X-axis: "10:30 AM", "2:45 PM", "around 3:15"
- If timestamp unreadable, describe timing. Example:"twice today", "recent rejection"
- Only use generic labels if price unreadable

SETUP STATUS MEANING:
aligned → chart behavior matches their rules (not permission)
incomplete → something required is missing
violated → rules are clearly broken`

    const tierModifier = profile.plan === 'pro'
      ? `

--------------------
TIER: PRO
VISION: HIGH-RESOLUTION

VALIDITY ESTIMATE:
- Use tight ranges when confirmations are clear
- High confidence requires all critical confirmations visible
- Always pair estimate with what would raise/lower it

ADDITIONAL CONTEXT:
- You may reference saved messages
- You may call out repeated behavioral patterns
- You may use the trader's own words

LIMITS:
- Ask up to TWO follow-up questions
- Use conditional framing when helpful:
  "If X happens → Y becomes valid"`
      : `

--------------------
TIER: FREE
VISION: LOW-RESOLUTION (512x512)

VISION RULES:
- Do NOT invent numbers you cannot read
- Use zones instead of exact prices
- Focus on structure over precision

VALIDITY ESTIMATE:
- Use wider ranges if details are unclear
- Focus on structural alignment with rules
- Set to null if key confirmations can't be verified

LIMITS:
- Ask at most ONE follow-up question
- Keep bullets concise`

    const coachingPrompt = basePrompt + tierModifier

    // Use low-res for free plan (512x512, 85 tokens), high-res for pro (full detail)
    const imageDetail = profile.plan === 'pro' ? 'high' : 'low'
    
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
                url: validatedRequest.image,
                detail: imageDetail
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

    // Map setup_status to verdict for backward compatibility
    const verdict = validatedResponse.setup_status === 'aligned' ? 'pass'
      : validatedResponse.setup_status === 'incomplete' ? 'warn'
      : 'fail'

    // Save analysis to database (linked to session for deletion)
    const { error: insertError } = await supabase.from("analyses").insert({
      user_id: user.id,
      ruleset_id: validatedRequest.rulesetId,
      session_id: validatedRequest.sessionId || null,
      verdict: verdict,
      payload: validatedResponse
    })

    if (insertError) {
      console.error('[Analyze API] Failed to save analysis:', insertError)
      const response = NextResponse.json({ error: "Failed to save analysis" }, { status: 500 })
      return addCorsHeaders(response, origin)
    }

    // Only increment counter if everything succeeded
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        screenshot_count: profile.screenshot_count + 1
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('[Analyze API] Failed to increment counter:', updateError)
      // Don't fail the request - analysis already succeeded
    }

    // Include ruleset name in response for user context
    const responseWithRuleset = {
      ...validatedResponse,
      ruleset_name: ruleset.name
    }

    const response = NextResponse.json(responseWithRuleset)
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
