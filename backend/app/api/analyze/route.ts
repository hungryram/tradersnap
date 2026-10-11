import { NextRequest, NextResponse, after } from "next/server"
import { effectivePlan, isPaid as isPaidPlan } from "@/lib/plans"
import { logLlmUsage } from "@/lib/llm-cost"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { analyzeChart } from "@/lib/llm"
import { analysisOutputSchema, analysisResponseSchema, trimAnalysis } from "@/lib/analysis-schema"
import { buildAnalysisPrompt } from "@/lib/analysis-prompt"
import { loadActiveStrategies, loadAlwaysRules, matchStrategy, strategiesBlock } from "@/lib/strategies"
import { CREDIT_COSTS, claimWelcomeCredit, consumeUsage, getLimits, refundUsage, type Reservation, type UsageCost, allowanceUsedMessage } from "@/lib/usage"
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
  image: z.string().max(8_000_000).regex(/^data:image\/(png|jpeg|jpg);base64,/),
  timestamp: z.string().max(50).optional(), // ISO timestamp from client
  timezone: z.string().max(64).optional() // IANA timezone (e.g., "America/New_York")
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

const screenshotCost: UsageCost = { messages: 0, screenshots: 1, units: CREDIT_COSTS.analysis }

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  // Explicit timestamps keep the user message ordered before the reply
  // (a single insert would give both rows the same NOW())
  const requestStartedAt = new Date().toISOString()
  // Set once usage is reserved; cleared on success. Any failure after that refunds it.
  let refundUserId: string | null = null
  let reservation: Reservation | null = null
  
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
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[Analyze API] Profile fetch error:', profileError)
      const response = NextResponse.json({ error: "Profile not found" }, { status: 404 })
      return addCorsHeaders(response, origin)
    }
    // Limits follow the effective plan (a Free account in its trial gets Pro)
    profile.plan = effectivePlan(profile)

    // 3. Parse and validate request body
    const body = await request.json()
    const validatedRequest = analyzeRequestSchema.parse(body)

    // 4. The trader's active strategies (the chart is checked against whichever fits)
    const strategies = await loadActiveStrategies(supabase, user.id, validatedRequest.rulesetId)
    if (strategies.length === 0) {
      const response = NextResponse.json({ error: "Ruleset not found" }, { status: 404 })
      return addCorsHeaders(response, origin)
    }
    const alwaysRules = await loadAlwaysRules(supabase, user.id)

    // 5. Atomically check + reserve one screenshot (refunded below if the analysis fails)
    const limits = getLimits(profile.plan)
    const usage = await consumeUsage(supabase, user.id, screenshotCost, limits)

    if (!usage.allowed) {
      const isPaid = isPaidPlan(profile.plan)
      const canBuyMore = !!process.env.STRIPE_PRICE_ID_TOPUP
      const response = NextResponse.json({
        error: "Daily usage limit reached",
        message: usage.credits
          ? allowanceUsedMessage(isPaid, canBuyMore)
          : isPaid
            ? `That's all ${limits.maxScreenshots} chart checks for today. They refill at midnight UTC.`
            : `That's all ${limits.maxScreenshots} free chart checks for today. They refill at midnight UTC, or Pro gives you ${getLimits('pro').maxScreenshots} a day.`,
        limit: limits.maxScreenshots,
        current: usage.screenshots,
        requiresUpgrade: !isPaid,
        canBuyMore
      }, { status: 429 })
      return addCorsHeaders(response, origin)
    }
    refundUserId = user.id
    reservation = usage.reservation

    // 6. Build prompt from the trader's rules and context
    const coachingPrompt = buildAnalysisPrompt(strategiesBlock(strategies, alwaysRules, profile.trading_limits ?? null), {
      ...validatedRequest.context,
      timestamp: validatedRequest.timestamp,
      timezone: validatedRequest.timezone
    })

    // Provider + model selection live in lib/llm
    const { output: aiResponse, tokens } = await analyzeChart({
      system: coachingPrompt,
      image: validatedRequest.image,
      prompt: "Analyze this chart.",
      schema: analysisOutputSchema,
      plan: profile.plan
    })
    after(() => logLlmUsage(supabase, user.id, "analysis", tokens))
    const validatedResponse = trimAnalysis(analysisResponseSchema.parse(aiResponse))

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
        screenshot_url: null, // Chart images stored in extension chrome.storage
        created_at: requestStartedAt
      },
      {
        user_id: user.id,
        role: 'assistant',
        content: JSON.stringify(validatedResponse),
        created_at: new Date().toISOString()
      }
    ]

    const { data: savedMessages, error: messagesError } = await supabase
      .from('chat_messages')
      .insert(messagesToSave)
      .select('id, role')

    if (messagesError) {
      console.error('[Analyze API] Failed to save messages:', messagesError)
      await refundUsage(supabase, user.id, reservation)
      refundUserId = null
      const response = NextResponse.json({ error: "Failed to save messages" }, { status: 500 })
      return addCorsHeaders(response, origin)
    }

    // Extract message IDs
    const userMsg = savedMessages?.find(m => m.role === 'user')
    const assistantMsg = savedMessages?.find(m => m.role === 'assistant')

    if (!userMsg || !assistantMsg) {
      console.error('[Analyze API] Failed to retrieve message IDs')
      await refundUsage(supabase, user.id, reservation)
      refundUserId = null
      const response = NextResponse.json({ error: "Failed to save messages" }, { status: 500 })
      return addCorsHeaders(response, origin)
    }

    // Save analysis to database (linked to session for deletion)
    const matched = matchStrategy(strategies, validatedResponse.matched_strategy)
    const analysisRow = {
      user_id: user.id,
      ruleset_id: matched?.id ?? validatedRequest.rulesetId,
      session_id: validatedRequest.sessionId || null,
      verdict: verdict,
      payload: { ...validatedResponse, matched_strategy: matched?.name ?? null }
    }
    let { error: insertError } = await supabase.from("analyses").insert({ ...analysisRow, strategy_id: matched?.id ?? null })
    // Before 20261020_strategies.sql has run there's no strategy_id column
    if (insertError?.code === "PGRST204") ({ error: insertError } = await supabase.from("analyses").insert(analysisRow))

    if (insertError) {
      console.error('[Analyze API] Failed to save analysis:', insertError)
      await refundUsage(supabase, user.id, reservation)
      refundUserId = null
      const response = NextResponse.json({ error: "Failed to save analysis" }, { status: 500 })
      return addCorsHeaders(response, origin)
    }

    // Usage was reserved up front; give it back if the chart was unreadable
    if (chartUnreadable) {
      console.log('[Analyze API] Chart unreadable - not counting towards usage')
      await refundUsage(supabase, user.id, reservation)
    }
    refundUserId = null

    // The first analysis while getting started is on us
    const welcomeFree = !chartUnreadable && await claimWelcomeCredit(supabase, user.id, "welcome_analysis_used")
    if (welcomeFree) await refundUsage(supabase, user.id, reservation)

    // Include ruleset name and message IDs in response
    const responseWithRuleset = {
      ...validatedResponse,
      matched_strategy: matched?.name ?? null,
      ruleset_name: matched?.name ?? strategies[0].name,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      chartUnreadable: chartUnreadable || undefined,
      welcomeFree: welcomeFree || undefined,
      // Lets the extension re-send this exact image as follow-up context without being charged again
      chartToken: signChartToken(user.id, validatedRequest.image)
    }

    const response = NextResponse.json(responseWithRuleset)
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("Analysis error:", error)

    if (refundUserId) {
      await refundUsage(supabase, refundUserId, reservation)
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
