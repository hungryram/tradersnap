import { NextRequest, NextResponse, after } from "next/server"
import { APP_ORIGINS, APP_URL, SUPPORT_EMAIL } from "@/lib/urls"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { chat as llmChat, provider as llmProvider } from "@/lib/llm"
import { claimWelcomeCredit, consumeUsage, creditState, getLimits, refundUsage, usagePayload, type Reservation, type UsageCost } from "@/lib/usage"
import { verifyChartToken } from "@/lib/chart-token"
import { buildTradesContext } from "@/lib/trades-context"
import { loadNotes, maybeRefreshNotes, memoryContext } from "@/lib/pip-notes"
import { loadTradePatterns } from "@/lib/trade-patterns"
import { logLlmUsage } from "@/lib/llm-cost"

// Recent conversation sent with each message. The window starts on a multiple
// of HISTORY_STEP, so it holds still for a few exchanges and stays cached,
// then jumps forward; it always has at least HISTORY_MIN recent messages.
const HISTORY_MIN = 12
const HISTORY_STEP = 8

function historyWindow<T>(turns: T[], historyStart?: number): T[] {
  if (historyStart === undefined) return turns.slice(-HISTORY_MIN) // older extensions
  const total = historyStart + turns.length
  const start = Math.floor(Math.max(0, total - HISTORY_MIN) / HISTORY_STEP) * HISTORY_STEP
  return turns.slice(Math.max(0, start - historyStart))
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Coaching prompt builder with type safety
type PlanTier = "admin" | "pro" | "free"

type Profile = {
  plan?: PlanTier | string
}

type BuildPromptParams = {
  profile: Profile
  fullName?: string | null
  userRules: string
}

// Admin-only prompt — AI-led market thesis (independent, no user rules)
function buildAdminPrompt({
  fullName,
}: {
  fullName?: string | null
}): string {
  const header = `You are Pip — ADMIN THESIS MODE.

PRIVATE INTERNAL MODE for the creator.
You are the LEAD ANALYST and DAY TRADER: you form your own market thesis from the chart and direct what you want to see next.


${fullName ? `TRADER: ${fullName}\n` : ""}MODE: THESIS (AI-LED)`

  const mandate = `YOUR JOB
Let the user know when to buy and sell where the current candle is based on chart evidence alone, and how long the expected trade might be.
`

  const analysisFramework = `ANALYSIS FRAMEWORK (USE WHAT'S VISIBLE) YOU ARE IN CHARGE

A) STRUCTURE FIRST
- Identify swing highs/lows, HH/HL or LH/LL
- Call out breaks of structure and key pivots
- Identify range boundaries if applicable

B) LEVELS & ZONES (ONLY IF CLEAR)
- Prior day high/low if visible
- Major swing levels
- Clear support/resistance
- If zones are ambiguous, don't label them

C) MOMENTUM / PRICE ACTION
- Displacement vs. grind
- Acceptance vs. rejection around levels
- Candle behavior (wicks, closes, follow-through)

D) CONFIDENCE RULE
- Confidence must match evidence.
- If higher timeframe is not shown, say: "HTF not visible — confidence capped."

E) NO INVENTING
- Do not claim order flow, institutional activity, liquidity sweeps, news catalysts unless clearly shown/provided.`

  const output = `OUTPUT FORMAT

GIVE USER A CLEAR TRADING DECISION:

- BUY/SELL/HOLD DECISION: one of these three only, based on chart evidence
BOTTOM LINE: one sentence`

  const style = `STYLE
- Direct, decisive, and structured.
- No fluff, no hype, no urgency.
- If edge is weak: say "No clear edge — stand aside."`

  return [header, mandate, analysisFramework, output, style].join("\n\n")
}

function buildCoachingPrompt({ profile, fullName, userRules }: BuildPromptParams): string {
  const tier: PlanTier = profile?.plan === "admin" ? "admin" : profile?.plan === "pro" ? "pro" : "free"

  // Admin tier gets a completely different prompt with market thesis analysis
  if (tier === "admin") {
    return buildAdminPrompt({ fullName })
  }

  const header = `You are Pip — a sharp trading coach focused on discipline (a friendly robot mascot; the product is also called Pip, at tradewithpip.ai).
You do not provide signals, entries, or exits.
You never validate or authorize trades.
You help the trader think, not act.

${fullName ? `TRADER: ${fullName}\n` : ""}SUBSCRIPTION TIER: ${tier.toUpperCase()}`

  const vision = tier === "pro"
    ? `VISION
You can analyze charts (timeframes, indicators, levels, structure, patterns) if provided.
If something is unclear, state exactly what's missing.
Never guess or hallucinate.`
    : `VISION (LOW-RESOLUTION)
Charts may be blurry or low detail.
If values can't be read accurately, say so and focus on structure instead.`

  const imageCapabilities = `IMAGE CAPABILITIES
You may ONLY:
- Analyze charts and describe what you see
- Describe levels, zones, structure in text
- Answer questions about chart behavior

You may NOT:
- Annotate, draw on, or mark up images
- Create overlays or visual edits

Describe levels clearly in text only.`

  const userRulesBlock = `USER RULES
${userRules}
---
END USER RULES
`

  const savedContext = `You may reference favorited messages, earlier decisions, and repeated patterns. Use the trader's own language when quoting.`

  const safety = `SAFETY & BOUNDARIES (NON-NEGOTIABLE)
NO:
- Buy/sell instructions
- Entries, exits, stops
- Permission-giving language

YES:
- Market state
- What price has or has not proven
- What would confirm or invalidate a state`

  const confidence = tier === "pro"
    ? `CONFIDENCE
If clear: answer confidently.
If partially unclear: answer + ask up to TWO clarifying questions.
If too unclear: refuse to guess and explain why.`
    : `CONFIDENCE
If clear: answer confidently.
If unclear: ask ONE clarifying question or refuse.`

  const engagement = `ENGAGEMENT
Reward pattern recognition.
Challenge assumptions.
Ask before explaining when possible.
Acknowledge correct reads clearly.
Match tone to state: learning = guide, sharp = test, tilted = firm.`

  const emotionalCoaching = tier === "pro"
    ? `EMOTIONAL COACHING
Identify FOMO, impatience, tilt, validation-seeking.
Challenge emotions using structure, rules, and time.`
    : `EMOTIONAL COACHING
Spot impatience, FOMO, overthinking.
Redirect to structure and rules.`

  const timeDiscipline = `TIME DISCIPLINE
Use time to slow behavior:
"One candle."
"Next close."
"If nothing changes, nothing changes."`

  const timeoutProtocol = `TIMEOUT PROTOCOL
Trigger ONLY if user explicitly requests a break.
Use format: TIMEOUT: X (5, 10, or 15 minutes).

For severe emotional trading, you MAY trigger a timeout, but confirm with user.`

  const writing = `WRITING STYLE
Be concise and human.
One core insight per response.
Simple questions: 1–2 sentences.
Complex analysis: max 5 lines.
Bullets only when listing.
Stop speaking once clarity is achieved.`

  const judgmentMode = `COACHING JUDGMENT MODE (HIGH PRIORITY)

Think before responding:
- Is the state clear or unresolved?
- Is the user aligned or violating their own rules?
- Are they seeking confirmation, clarity, or permission?

Respond with ONLY what is necessary.

Response patterns (NOT mandatory, adapt to situation):
- Clear state → one-line verdict
- Rule violation → direct correction (2-3 lines)
- Multiple points → bullets (max 2)
- Need clarity → ask one question only when critical`

  const featureRequests = `YOUR FEATURES:

AVAILABLE NOW:
- Chat coaching (text or chart analysis)
- Save important messages (click star to favorite)
- Custom trading rulesets (dashboard → rules)
- Chart image analysis with vision
- Timeout breaks (ask for one when needed)
- Daily usage tracking
- Trade Quality
- Ruleset checklist

WANT SOMETHING NEW, OR FOUND A BUG?
Email ${SUPPORT_EMAIL}. Every message is read by the person building Pip.`

  const goal = tier === "pro"
    ? `GOAL
Coach, not lecture.
Expose flawed reasoning.
Reinforce discipline.
Make waiting feel like progress.`
    : `GOAL
Make the user think.
Never tell them what to do.
Waiting is a valid outcome.`

  return [
    header,
    vision,
    imageCapabilities,
    userRulesBlock,
    savedContext,
    safety,
    confidence,
    engagement,
    emotionalCoaching,
    timeDiscipline,
    timeoutProtocol,
    writing,
    judgmentMode,
    featureRequests,
    goal,
  ].filter(Boolean).join("\n\n")
}

const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  includeChart: z.boolean().optional(),
  image: z.string().max(8_000_000).regex(/^data:image\/(png|jpeg|jpg);base64,/).optional(),
  isContextImage: z.boolean().optional(), // Flag to indicate image is from previous analysis
  chartToken: z.string().max(100).optional(), // Server-issued proof the context image was already counted
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8000)
  })).max(50).optional(),
  historyStart: z.number().int().min(0).optional(), // position of conversationHistory[0] in the whole chat
  timestamp: z.string().optional(), // ISO timestamp from client
  timezone: z.string().optional(), // IANA timezone (e.g., "America/New_York")
  dayStart: z.string().optional() // ISO time of the trader's local midnight
})

function addCorsHeaders(response: NextResponse, origin: string | null) {
  const allowedOrigins = [
    ...APP_ORIGINS,
    'https://www.tradingview.com',
    'https://tradingview.com'
  ]
  
  // Trading platforms and exchanges supported by the extension
  const tradingDomains = [
    'tradingview.com', 'tradovate.com', 'thinkorswim.com', 'tdameritrade.com',
    'ninjatrader.com', 'tradestation.com', 'interactivebrokers.com', 'etrade.com',
    'schwab.com', 'fidelity.com', 'robinhood.com', 'webull.com', 'tastytrade.com',
    'tastyworks.com', 'metatrader4.com', 'metatrader5.com', 'ctrader.com',
    'tradier.com', 'lightspeed.com', 'speedtrader.com', 'topstepx.com', 'rithmic.com',
    'binance.com', 'coinbase.com', 'kraken.com', 'bybit.com'
  ]
  
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    origin.startsWith('chrome-extension://') ||
    tradingDomains.some(domain => origin.includes(domain))
  )
  
  if (isAllowed && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
    response.headers.set("Access-Control-Allow-Credentials", "true")
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
  // Explicit timestamps keep the user message ordered before the reply
  // (a single insert would give both rows the same NOW())
  const requestStartedAt = new Date().toISOString()
  // Set once usage is reserved; cleared on success. Any failure after that refunds it.
  let reserved: { userId: string, reservation: Reservation } | null = null
  
  try {
    // 1. Validate JWT
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      const response = NextResponse.json({ error: "Invalid token" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    // 2. Fetch user profile with usage data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, first_name, last_name, total_tokens_used, total_input_tokens, total_output_tokens')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[Chat API] Profile fetch error:', profileError)
      const response = NextResponse.json({ error: "Profile not found" }, { status: 404 })
      return addCorsHeaders(response, origin)
    }

    // 3. Parse request
    const body = await request.json()
    
    const validatedRequest = chatRequestSchema.parse(body)

    // 4. Define usage limits based on plan
    const limits = getLimits(profile.plan)
    const isPaid = profile.plan === 'pro' || profile.plan === 'admin'

    // A context image is only free if it carries a valid token from /api/analyze.
    // Without one, drop the image instead of charging (keeps older extension versions working).
    if (validatedRequest.image && validatedRequest.isContextImage &&
        !verifyChartToken(user.id, validatedRequest.image, validatedRequest.chartToken)) {
      validatedRequest.image = undefined
    }

    const hasImage = !!validatedRequest.image
    const isNewScreenshot = hasImage && !validatedRequest.isContextImage

    // 5. Atomically check + reserve usage (refunded below if the response fails)
    const cost: UsageCost = { messages: 1, screenshots: isNewScreenshot ? 1 : 0 }
    const quota = await consumeUsage(supabase, user.id, cost, limits)

    if (!quota.allowed && quota.credits) {
      const canBuyMore = !!process.env.STRIPE_PRICE_ID_TOPUP
      const response = NextResponse.json({
        error: "Daily usage limit reached",
        message: `You've used today's allowance. It resets at midnight UTC.${canBuyMore ? " You can buy more to keep going today" + (isPaid ? "." : ", or upgrade to Pro for about 10x more every day.") : isPaid ? "" : " Upgrade to Pro for about 10x more every day."}`,
        limit: limits.maxMessages,
        current: quota.messages,
        requiresUpgrade: !isPaid,
        canBuyMore
      }, { status: 429 })
      return addCorsHeaders(response, origin)
    }

    if (!quota.allowed) {
      const messageLimitHit = quota.messages >= limits.maxMessages
      const response = NextResponse.json(messageLimitHit ? {
        error: "Daily message limit reached",
        message: isPaid
          ? `You've reached your daily limit of ${limits.maxMessages} messages. Your limit resets at midnight UTC.`
          : `You've used all ${limits.maxMessages} free messages today. Upgrade to Pro for ${getLimits('pro').maxMessages} messages/day and ${getLimits('pro').maxScreenshots} chart analyses.`,
        limit: limits.maxMessages,
        current: quota.messages,
        requiresUpgrade: !isPaid
      } : {
        error: "Daily screenshot limit reached",
        message: isPaid
          ? `You've reached your daily limit of ${limits.maxScreenshots} chart analyses. Your limit resets at midnight UTC.`
          : `You've used all ${limits.maxScreenshots} free chart analyses today. Upgrade to Pro for ${getLimits('pro').maxScreenshots} charts/day.`,
        limit: limits.maxScreenshots,
        current: quota.screenshots,
        requiresUpgrade: !isPaid
      }, { status: 429 })
      return addCorsHeaders(response, origin)
    }
    reserved = { userId: user.id, reservation: quota.reservation }

    // 6. Fetch user's ruleset (primary first, then any ruleset)
    let { data: ruleset } = await supabase
      .from("rulesets")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle()

    // If no primary ruleset, get any ruleset
    if (!ruleset) {
      const { data: anyRuleset } = await supabase
        .from("rulesets")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle()
      ruleset = anyRuleset
    }

    const userRules = ruleset?.rules_text || "No specific rules defined yet."

    // Build user name context (use first name for natural conversation)
    const firstName = profile.first_name?.trim()
    const lastName = profile.last_name?.trim()
    const fullName = [firstName, lastName].filter(Boolean).join(' ')

    // 7. Build conversation with system prompt using type-safe builder
    const coachingPrompt = buildCoachingPrompt({
      profile,
      fullName,
      userRules
    })

    // Log full prompt for debugging/verification (remove or comment out in production)
    // console.log('\n========== COACHING PROMPT ==========')
    // console.log(coachingPrompt)
    // console.log('\n========== END PROMPT ==========\n')

    // Fetch favorited messages to include in context (limited by plan)
    const { data: favoritedMessages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_favorited', true)
      .order('created_at', { ascending: false }) // Most recent first
      .limit(limits.maxFavoritesInContext) // 3 for free, 20 for pro

    // Time context for coaching
    let timeContext: string | null = null
    if (validatedRequest.timestamp && validatedRequest.timezone) {
      const clientTime = new Date(validatedRequest.timestamp)
      timeContext = `CURRENT TIME: ${clientTime.toLocaleString('en-US', { timeZone: validatedRequest.timezone, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}

Use for time-based coaching when they ask about the next candle or how long they've been trading.`
    }

    // Today's auto-detected trades, from the trader's local midnight
    const dayStart = validatedRequest.dayStart && !isNaN(Date.parse(validatedRequest.dayStart))
      ? new Date(validatedRequest.dayStart)
      : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const tradesContext = await buildTradesContext(supabase, user.id, dayStart, validatedRequest.timezone)

    // Favorited messages (AI's persistent memory)
    const favoritedContext = favoritedMessages && favoritedMessages.length > 0
      ? `SAVED MESSAGES (User's important insights/rules to always remember):\n${favoritedMessages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}`
      : null

    // Long-term memory: Pip's notes and trading patterns (stable all day, so cached).
    // Skipped entirely when the trader has turned memory off.
    const { data: memorySettings } = await supabase.from('profiles').select('memory_enabled, trading_limits').eq('id', user.id).single()
    const memoryOn = memorySettings?.memory_enabled !== false
    const [notes, patterns] = memoryOn
      ? await Promise.all([
          loadNotes(supabase, user.id),
          loadTradePatterns(supabase, user.id, dayStart, memorySettings?.trading_limits ?? null, validatedRequest.timezone)
        ])
      : [[], []]
    const memory = [favoritedContext, memoryContext(notes, patterns)].filter(Boolean).join('\n\n') || null

    // Recent conversation, the same size on every plan (see historyWindow)
    const fullHistory = validatedRequest.conversationHistory ?? []
    const history = profile.plan === 'admin' ? fullHistory : historyWindow(fullHistory, validatedRequest.historyStart)

    // Message with chart image (either new capture or context from previous analysis)
    const imageDescription = validatedRequest.isContextImage
      ? "Here's the chart I analyzed earlier:"
      : "Current chart:"
    const userMessage = validatedRequest.image
      ? `${imageDescription}\n\n${validatedRequest.message}`
      : validatedRequest.message

    // 8. Call the model (provider + model selection live in lib/llm)
    const result = await llmChat({
      system: coachingPrompt,
      memory,
      volatileContext: [timeContext, tradesContext].filter(Boolean).join("\n\n") || null,
      history,
      message: userMessage,
      image: validatedRequest.image,
      plan: profile.plan,
      // Cache key based on user rules to group similar prompts together
      cacheKey: `v1:${profile.plan}:${ruleset?.id || 'norules'}`
    })

    let aiResponse = result.text
    let responseFailed = false
    
    if (!aiResponse) {
      responseFailed = true // Don't count failed responses towards limits
      console.error('[Chat API] Empty response from model:', {
        provider: llmProvider,
        model: result.model,
        plan: profile.plan,
        finishReason: result.finishReason
      })
      // Provide helpful message based on why response failed
      if (result.finishReason === 'length') {
        aiResponse = profile.plan === 'pro'
          ? "My response got a bit long! 📝 Could you ask me something more specific, or break your question into smaller parts? I'm here to help!"
          : "My response got a bit long! 📝 Could you ask me something more specific, or break your question into smaller parts? (Pro users get longer responses for more detailed analysis)"
      } else if (result.finishReason === 'refusal') {
        aiResponse = "I can't help with that one. Try rephrasing, or ask about your chart and rules."
      } else {
        aiResponse = "I'm sorry, I couldn't generate a response. Please try again."
      }
    }

    // Cost tracking, and the once-a-day notes update, after the reply is sent
    after(async () => {
      await logLlmUsage(supabase, user.id, 'chat', result.tokens)
      if (memoryOn) await maybeRefreshNotes(supabase, user.id)
    })

    // Track token usage (check the provider dashboard for actual costs)
    const usage = result.usage
    if (usage) {
      await supabase
        .from('profiles')
        .update({
          total_tokens_used: (profile.total_tokens_used || 0) + usage.totalTokens,
          total_input_tokens: (profile.total_input_tokens || 0) + usage.inputTokens,
          total_output_tokens: (profile.total_output_tokens || 0) + usage.outputTokens
        })
        .eq('id', user.id)
    }

    // 9. Save messages to database for audit trail
    let userMessageId: string | null = null
    let assistantMessageId: string | null = null
    
    try {
      const messagesToSave = [
        {
          user_id: user.id,
          role: 'user',
          content: validatedRequest.message,
          screenshot_url: null, // Chart images stored in extension chrome.storage
          created_at: requestStartedAt
        },
        {
          user_id: user.id,
          role: 'assistant',
          content: aiResponse,
          created_at: new Date().toISOString()
        }
      ]

      const { data: savedMessages, error: dbError } = await supabase
        .from('chat_messages')
        .insert(messagesToSave)
        .select('id, role')

      if (dbError) {
        console.error('[Chat API] Failed to save messages:', dbError)
        // Don't fail the request if DB save fails - user still gets response
      } else {
        // Extract message IDs
        if (savedMessages && savedMessages.length === 2) {
          userMessageId = savedMessages.find(m => m.role === 'user')?.id || null
          assistantMessageId = savedMessages.find(m => m.role === 'assistant')?.id || null
        }
      }
    } catch (dbError) {
      console.error('[Chat API] Error saving to database:', dbError)
      // Continue anyway - chat works even if audit trail fails
    }

    // 10. Check if AI recommended a timeout
    let action = null
    const timeoutMatch = aiResponse.match(/TIMEOUT:\s*(\d+)/)
    if (timeoutMatch) {
      const minutes = parseInt(timeoutMatch[1])
      action = {
        type: 'timeout',
        duration: minutes * 60, // Convert to seconds
        reason: 'Mandatory break to reset'
      }
    }

    // 11. Usage was reserved up front; give it back if the response failed
    if (responseFailed) {
      console.log('[Chat API] Response failed - not counting towards usage limits')
      await refundUsage(supabase, user.id, quota.reservation)
    }
    reserved = null

    // The first question sent with a chart while getting started is on us
    const welcomeFree = !responseFailed && isNewScreenshot && await claimWelcomeCredit(supabase, user.id, "welcome_chart_chat_used")
    if (welcomeFree) await refundUsage(supabase, user.id, quota.reservation)
    const refunded = responseFailed || welcomeFree

    // 12. Return response with message IDs and action
    const response = NextResponse.json({ 
      message: aiResponse,
      userMessageId,
      assistantMessageId,
      action,
      welcomeFree: welcomeFree || undefined,
      usage: usagePayload(
        quota.credits && refunded
          ? creditState(quota.credits.used - (quota.reservation.units - quota.reservation.fromBonus), quota.credits.bonus + quota.reservation.fromBonus, limits)
          : quota.credits,
        {
          messages: refunded ? quota.messages - cost.messages : quota.messages,
          screenshots: refunded ? quota.screenshots - cost.screenshots : quota.screenshots
        },
        limits
      )
    })
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("Chat error:", error)

    if (reserved) {
      await refundUsage(supabase, reserved.userId, reserved.reservation)
    }
    
    if (error instanceof z.ZodError) {
      console.error('[Chat API] Validation errors:', JSON.stringify(error.issues, null, 2))
      const response = NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      )
      return addCorsHeaders(response, origin)
    }

    const response = NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
