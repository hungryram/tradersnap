import { NextRequest, NextResponse, after } from "next/server"
import { effectivePlan, features, isPaid } from "@/lib/plans"
import { APP_ORIGINS, APP_URL, SUPPORT_EMAIL } from "@/lib/urls"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { chat as llmChat, provider as llmProvider } from "@/lib/llm"
import { allowanceUsedMessage, claimWelcomeCredit, consumeUsage, creditState, getLimits, refundUsage, usagePayload, type Reservation, type UsageCost } from "@/lib/usage"
import { verifyChartToken } from "@/lib/chart-token"
import { buildTradesContext } from "@/lib/trades-context"
import { loadJournalNotes, loadNotes, maybeRefreshNotes, memoryContext } from "@/lib/pip-notes"
import { loadRecentDays, loadTradePatterns } from "@/lib/trade-patterns"
import { loadActiveStrategies, loadAlwaysRules, strategiesBlock, strategiesFor } from "@/lib/strategies"
import { logLlmUsage } from "@/lib/llm-cost"
import { alreadyLogged, detectTradeClaim, loggedToday } from "@/lib/trade-claims"

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
// Helping the trader write or tighten their rules in chat. The extension shows a
// "Save as my rules" button under any reply that has a rules code block.
function rulesHelpSection(maxChars: number) {
  return `HELPING WITH THEIR RULES
When the trader asks for help writing, fixing or tightening their trading rules:
- Help them put THEIR OWN strategy into words. Ask short questions if you need details (timeframe, what their setup looks like, what triggers an entry, where the stop goes, when not to trade). Never invent entries, setups or indicators for them.
- You may suggest discipline and risk rules freely (stop-loss rule, max trades per day, daily loss limit, cooldown after losses, no trading right after the open).
- Make each rule checkable: concrete things visible on a chart or in their trades (timeframe, level or indicator they use, candle condition, time window, number, dollar amount).
- When you have a full ruleset, put the COMPLETE ruleset (not just the changes) in one fenced block whose first line is \`\`\`rules followed by a space and the strategy's name (e.g. \`\`\`rules Opening range breakout), and that ends with \`\`\`, one rule per line starting with "- ". Use the exact name of an existing strategy to update it, or a short new name for a new one. Keep it under ${maxChars} characters. Then say in one line that they can tap "Save as my rules" below to make these the rules you check their charts against.
- Only use a \`\`\`rules block for a complete ruleset you'd be happy for them to save.
- They can have several strategies (setups). Write one strategy per block; "Save as my rules" saves it under the name on the block (updating that strategy if it exists, creating it if not). Rules that apply to every trade belong on the Rules page under "Rules for every trade", not in a strategy.`
}

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

  return [header, mandate, analysisFramework, output, style, rulesHelpSection(10000)].join("\n\n")
}

function buildCoachingPrompt({ profile, fullName, userRules }: BuildPromptParams): string {
  const tier: PlanTier = profile?.plan === "admin" ? "admin" : isPaid(profile?.plan) ? "pro" : "free"

  // Admin tier gets a completely different prompt with market thesis analysis
  if (tier === "admin") {
    return buildAdminPrompt({ fullName })
  }

  const header = `You are Pip — a sharp trading coach focused on discipline (a friendly robot mascot; the product is also called Pip, at tradewithpip.ai).
You do not provide signals, entries, or exits.
You never validate or authorize trades.
You help the trader think, not act.
You can't save trades yourself, but the app can log one for them. When a trader tells you a result ("I just made 200"), respond to it as a coach; the app offers a log button on its own, so don't mention buttons or say you logged it. If they ask you to log a trade and haven't said how much, ask for the amount and whether it was a win or a loss ("How much was it?"). Never tell them to log it somewhere else or tag it yourself.

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
Use format: TIMEOUT: X. Offer 10 minutes unless they ask for a different length (5, 10, or 15).

For severe emotional trading, you MAY trigger a timeout, but confirm with user.`

  const conversationStyle = `NOT BEING REPETITIVE
Say each thing once. A coach who repeats the same line gets tuned out.
- Use a number from their data (a 30-day total, a streak) once per conversation. Use it again only if it has changed or they ask.
- Ask each question at most twice. If they answer something else, or move on to a new topic, answer what they asked and drop the old question.
- Offer a timeout once. Offer it again only if they show a new urge (adding size, revenge, chasing), not on every reply.
- End with one question or one next step, not a list of demands.
- Describe where losses came from ("those trades are where the money went"). Never say a loss would have been avoided or that following the rules would have made them money.`

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
    rulesHelpSection(tier === "pro" ? 5000 : 1000),
    writing,
    conversationStyle,
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
  dayStart: z.string().optional(), // ISO time of the trader's local midnight
  strategyId: z.string().uuid().optional() // the strategy picked in the chat box
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
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[Chat API] Profile fetch error:', profileError)
      const response = NextResponse.json({ error: "Profile not found" }, { status: 404 })
      return addCorsHeaders(response, origin)
    }

    // Limits, model and prompt follow the effective plan (a Free account in its trial gets Pro)
    profile.plan = effectivePlan(profile)

    // 3. Parse request
    const body = await request.json()
    
    const validatedRequest = chatRequestSchema.parse(body)

    // 4. Define usage limits based on plan
    const limits = getLimits(profile.plan)
    const paidPlan = isPaid(profile.plan)

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
        message: allowanceUsedMessage(paidPlan, canBuyMore),
        limit: limits.maxMessages,
        current: quota.messages,
        requiresUpgrade: !paidPlan,
        canBuyMore
      }, { status: 429 })
      return addCorsHeaders(response, origin)
    }

    if (!quota.allowed) {
      const messageLimitHit = quota.messages >= limits.maxMessages
      const response = NextResponse.json(messageLimitHit ? {
        error: "Daily message limit reached",
        message: paidPlan
          ? `That's all ${limits.maxMessages} messages for today. They refill at midnight UTC.`
          : `That's all ${limits.maxMessages} free messages for today. They refill at midnight UTC, or Pro gives you ${getLimits('pro').maxMessages} a day.`,
        limit: limits.maxMessages,
        current: quota.messages,
        requiresUpgrade: !paidPlan
      } : {
        error: "Daily screenshot limit reached",
        message: paidPlan
          ? `That's all ${limits.maxScreenshots} chart checks for today. They refill at midnight UTC.`
          : `That's all ${limits.maxScreenshots} free chart checks for today. They refill at midnight UTC, or Pro gives you ${getLimits('pro').maxScreenshots} a day.`,
        limit: limits.maxScreenshots,
        current: quota.screenshots,
        requiresUpgrade: !paidPlan
      }, { status: 429 })
      return addCorsHeaders(response, origin)
    }
    reserved = { userId: user.id, reservation: quota.reservation }

    // 6. The trader's active strategies, rules for every trade and daily limits
    const strategies = await strategiesFor(supabase, user.id, await loadActiveStrategies(supabase, user.id), validatedRequest.strategyId)
    const ruleset = strategies[0] ?? null
    const [alwaysRules, { data: limitsRow }] = await Promise.all([
      loadAlwaysRules(supabase, user.id),
      supabase.from("profiles").select("trading_limits").eq("id", user.id).single()
    ])
    const userRules = strategies.length || alwaysRules
      ? strategiesBlock(strategies, alwaysRules, limitsRow?.trading_limits ?? null)
      : "No specific rules defined yet."

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
    const [notes, patterns, journal, recentDays] = memoryOn
      ? await Promise.all([
          loadNotes(supabase, user.id),
          loadTradePatterns(supabase, user.id, dayStart, memorySettings?.trading_limits ?? null, validatedRequest.timezone),
          // Pip reads journal notes on paid plans
          features(profile.plan).pipReadsNotes ? loadJournalNotes(supabase, user.id) : Promise.resolve([]),
          loadRecentDays(supabase, user.id, dayStart, validatedRequest.timezone)
        ])
      : [[], [], [], []]
    const memory = [favoritedContext, memoryContext(notes, patterns, journal, recentDays)].filter(Boolean).join('\n\n') || null

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

    // 8. Call the model (provider + model selection live in lib/llm). When the message may report
    // a trade result, a cheap model checks it alongside, so the reply isn't delayed.
    const recentTurns = history.slice(-2).map(turn => `${turn.role === 'user' ? 'Trader' : 'Coach'}: ${turn.content.slice(0, 300)}`).join('\n')
    const claimCheck = detectTradeClaim(validatedRequest.message, recentTurns)
    const result = await llmChat({
      system: coachingPrompt,
      memory,
      volatileContext: [timeContext, tradesContext].filter(Boolean).join("\n\n") || null,
      history,
      message: userMessage,
      image: validatedRequest.image,
      plan: profile.plan,
      // Cache key based on user rules to group similar prompts together
      cacheKey: `v1:${profile.plan}:${strategies.map(st => st.id).join(',') || 'norules'}`
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
        aiResponse = isPaid(profile.plan)
          ? "My response got a bit long! 📝 Could you ask me something more specific, or break your question into smaller parts? I'm here to help!"
          : "My response got a bit long! 📝 Could you ask me something more specific, or break your question into smaller parts? (Pro users get longer responses for more detailed analysis)"
      } else if (result.finishReason === 'refusal') {
        aiResponse = "I can't help with that one. Try rephrasing, or ask about your chart and rules."
      } else {
        aiResponse = "I'm sorry, I couldn't generate a response. Please try again."
      }
    }

    // "I just made 200": offer to log it (the trader confirms in the widget; nothing is saved here)
    const { claim, tokens: claimTokens } = await claimCheck
    let tradeProposal: { id: string; kind: string; amount: number; symbol: string | null; logged_net: number; logged_count: number; strategies: { id: string; name: string }[] } | null = null
    if (claim && !responseFailed) {
      const today = await loggedToday(supabase, user.id, dayStart)
      // A day total the journal already adds up to needs nothing; a single trade the platform already logged neither
      const covered = claim.kind === 'day_total' ? Math.abs(claim.amount - today.net) < 0.5 : await alreadyLogged(supabase, user.id, claim.amount)
      if (!covered) {
        tradeProposal = {
          id: crypto.randomUUID(), kind: claim.kind, amount: claim.amount, symbol: claim.symbol,
          logged_net: today.net, logged_count: today.count,
          strategies: strategies.map(st => ({ id: st.id, name: st.name }))
        }
      }
    }

    // Cost tracking, and the once-a-day notes update, after the reply is sent
    after(async () => {
      await logLlmUsage(supabase, user.id, 'chat', result.tokens)
      await logLlmUsage(supabase, user.id, 'chat', claimTokens)
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
          created_at: new Date().toISOString(),
          // The offer to log a reported result stays with the message (see 20261023_trade_proposals.sql)
          ...(tradeProposal ? { trade_proposal: { ...tradeProposal, status: 'pending' } } : {})
        }
      ]

      let { data: savedMessages, error: dbError } = await supabase
        .from('chat_messages')
        .insert(messagesToSave)
        .select('id, role')
      if (dbError && tradeProposal) {
        // The column doesn't exist yet: save the messages without the offer
        ;({ data: savedMessages, error: dbError } = await supabase
          .from('chat_messages')
          .insert(messagesToSave.map(({ trade_proposal, ...rest }: any) => rest))
          .select('id, role'))
      }

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
      tradeProposal,
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
