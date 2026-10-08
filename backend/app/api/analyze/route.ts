import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { analyzeChart } from "@/lib/llm"
import { analysisResponseSchema } from "@/lib/analysis-schema"
import { consumeUsage, getLimits, refundUsage } from "@/lib/usage"
import { signChartToken } from "@/lib/chart-token"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Request validation schema
const analyzeRequestSchema = z.object({
  rulesetId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  context: z.object({
    symbol: z.string().max(50).optional(),
    timeframe: z.string().max(20).optional(),
    notes: z.string().max(1000).optional()
  }).optional(),
  image: z.string().max(8_000_000).regex(/^data:image\/(png|jpeg|jpg);base64,/)
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

const screenshotCost = { messages: 0, screenshots: 1 }

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  // Set once usage is reserved; cleared on success. Any failure after that refunds it.
  let refundUserId: string | null = null
  
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

    // 2. Fetch user plan
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[Analyze API] Profile fetch error:', profileError)
      const response = NextResponse.json({ error: "Profile not found" }, { status: 404 })
      return addCorsHeaders(response, origin)
    }

    // 3. Parse and validate request body
    const body = await request.json()
    const validatedRequest = analyzeRequestSchema.parse(body)

    // 4. Fetch ruleset
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

    // 5. Atomically check + reserve one screenshot (refunded below if the analysis fails)
    const limits = getLimits(profile.plan)
    const usage = await consumeUsage(supabase, user.id, screenshotCost, limits)

    if (!usage.allowed) {
      const isPaid = profile.plan === 'pro' || profile.plan === 'admin'
      const response = NextResponse.json({
        error: "Daily screenshot limit reached",
        message: isPaid
          ? `You've reached your daily limit of ${limits.maxScreenshots} chart analyses. Your limit resets at midnight UTC.`
          : `You've used all ${limits.maxScreenshots} free chart analyses today. Upgrade to Pro for ${getLimits('pro').maxScreenshots} charts/day.`,
        limit: limits.maxScreenshots,
        current: usage.screenshots,
        requiresUpgrade: !isPaid
      }, { status: 429 })
      return addCorsHeaders(response, origin)
    }
    refundUserId = user.id

    // 6. Build base + tier modifier prompt
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

TASK

1) Read the chart structurally
   - Trend, range, rejection, breakout, chop

2) Check rules
   - Are they aligned, incomplete, or violated?
   - EVALUATE EACH RULE INDIVIDUALLY (REQUIRED):
     * Break down the ruleset into distinct checkable criteria (volume, indicators, price levels, structure, etc.)
     * For each criterion, determine: pass / fail / unclear
     * Add brief notes explaining the status
     * ALWAYS return rule_checks array - this is NOT optional
     * Minimum 3 rule checks, maximum 8

3) Classify setup state
   - aligned / incomplete / violated

4) Coach behavior
   - Call out FOMO, impatience, fear, forcing

5) Handle uncertainty correctly
   - Explain what's unclear
   - Ask for clarification
   - Refuse to guess if needed

Never hallucinate.

TIME DISCIPLINE

Use time to slow decisions:
"One candle."
"Next 5m close."
"If nothing changes, nothing changes."

VALIDITY ESTIMATE

Provide an estimate of how likely this setup is VALID per the user's rules and what is visible on the chart.
This is NOT a prediction of profit and NOT a market forecast.

Rules:
- Output a RANGE, not a single percent. Example: [60, 75]
- Include confidence: low/medium/high
- If key details are missing or unreadable, set validity_estimate to null and ask clarifying questions
- Tighten the range only when confirmations are clearly visible
- Always explain what would increase/decrease the estimate

OUTPUT (JSON ONLY)

Return ONLY valid JSON. No markdown. No extra text.

{
  "chart_readable": true | false,  // false ONLY if the image is not a price chart or is too unclear to analyze at all
  "setup_status": "aligned" | "incomplete" | "violated",
  "rule_checks": [{
    "rule": "Brief description of the specific rule criterion",
    "status": "pass" | "fail" | "unclear",
    "note": "Brief explanation (e.g., 'Volume at 15.2M' or 'Cannot verify from chart')"
  }],  // REQUIRED: Always include 3-8 rule checks
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

    // Provider + model selection live in lib/llm
    const aiResponse = await analyzeChart({
      system: coachingPrompt,
      image: validatedRequest.image,
      prompt: "Analyze this chart.",
      schema: analysisResponseSchema,
      plan: profile.plan
    })
    const validatedResponse = analysisResponseSchema.parse(aiResponse)

    // Unreadable charts don't count towards usage (reported by the model as a structured field)
    const chartUnreadable = validatedResponse.chart_readable === false

    // Map setup_status to verdict for backward compatibility
    const verdict = validatedResponse.setup_status === 'aligned' ? 'pass'
      : validatedResponse.setup_status === 'incomplete' ? 'warn'
      : 'fail'

    // Save both messages to chat_messages table
    const messagesToSave = [
      {
        user_id: user.id,
        role: 'user',
        content: '📸 Analyze this chart',
        screenshot_url: null // Chart images stored in extension chrome.storage
      },
      {
        user_id: user.id,
        role: 'assistant',
        content: JSON.stringify(validatedResponse)
      }
    ]

    const { data: savedMessages, error: messagesError } = await supabase
      .from('chat_messages')
      .insert(messagesToSave)
      .select('id, role')

    if (messagesError) {
      console.error('[Analyze API] Failed to save messages:', messagesError)
      await refundUsage(supabase, user.id, screenshotCost)
      refundUserId = null
      const response = NextResponse.json({ error: "Failed to save messages" }, { status: 500 })
      return addCorsHeaders(response, origin)
    }

    // Extract message IDs
    const userMsg = savedMessages?.find(m => m.role === 'user')
    const assistantMsg = savedMessages?.find(m => m.role === 'assistant')

    if (!userMsg || !assistantMsg) {
      console.error('[Analyze API] Failed to retrieve message IDs')
      await refundUsage(supabase, user.id, screenshotCost)
      refundUserId = null
      const response = NextResponse.json({ error: "Failed to save messages" }, { status: 500 })
      return addCorsHeaders(response, origin)
    }

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
      await refundUsage(supabase, user.id, screenshotCost)
      refundUserId = null
      const response = NextResponse.json({ error: "Failed to save analysis" }, { status: 500 })
      return addCorsHeaders(response, origin)
    }

    // Usage was reserved up front; give it back if the chart was unreadable
    if (chartUnreadable) {
      console.log('[Analyze API] Chart unreadable - not counting towards usage')
      await refundUsage(supabase, user.id, screenshotCost)
    }
    refundUserId = null

    // Include ruleset name and message IDs in response
    const responseWithRuleset = {
      ...validatedResponse,
      ruleset_name: ruleset.name,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      chartUnreadable: chartUnreadable || undefined,
      // Lets the extension re-send this exact image as follow-up context without being charged again
      chartToken: signChartToken(user.id, validatedRequest.image)
    }

    const response = NextResponse.json(responseWithRuleset)
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("Analysis error:", error)

    if (refundUserId) {
      await refundUsage(supabase, refundUserId, screenshotCost)
    }
    
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
