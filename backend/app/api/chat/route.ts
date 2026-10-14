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
import { loadLastDayDetail, loadRecentDays, loadTradePatterns } from "@/lib/trade-patterns"
import { dayRuleOf } from "@/lib/trading-day"
import { loadActiveStrategies, loadAlwaysRules, strategiesBlock, strategiesFor } from "@/lib/strategies"
import { logLlmUsage } from "@/lib/llm-cost"
import { PIP_BOUNDARIES, PIP_IDENTITY, PIP_VOICE } from "@/lib/pip-voice"
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

// The coaching prompt. Identity, voice and boundaries are shared with every Pip prompt (lib/pip-voice); this adds
// what's specific to the chat. It changes only when the trader's rules or plan do, so it stays cached.
type Profile = {
  plan?: string
  trading_profile?: { experience?: string; markets?: string[]; platforms?: string[]; prop_firm?: boolean } | null
}

type BuildPromptParams = {
  profile: Profile
  fullName?: string | null
  userRules: string
}

// Helping the trader write or tighten a strategy in chat. The extension shows a "Save as my rules" button under any
// reply that has a rules code block, so the block's format matters.
function rulesHelpSection(maxChars: number) {
  return `Helping them write their rules
When they ask for help writing, fixing or tightening a strategy, help them put their own way of trading into words. Ask short questions when you need details: the timeframe, what the setup looks like, what triggers the entry, where the stop goes, when they don't trade. Never invent a setup, entry, indicator or strategy for them; the strategy has to be theirs. You can freely suggest discipline and risk rules (a stop on every trade, max trades per day, a daily loss limit, a break after losses, no trades in the first minutes after the open), because those protect them whatever they trade.

Make every rule something that can be checked on a chart or in their trades: a timeframe, a level or indicator they use, a candle condition, a time window, a number or a dollar amount. "Wait for confirmation" can't be checked; "a 5-minute candle closes above the opening range high" can.

When you have a complete strategy, write the whole thing (not just the changes) in one fenced block that starts with \`\`\`rules followed by a space and the strategy's name, for example \`\`\`rules Opening range breakout, with one rule per line starting with "- ", and ends with \`\`\`. Use the exact name of an existing strategy to update it, or a short new name for a new one. Keep it under ${maxChars} characters. Then say in one line that they can tap "Save as my rules" below it. Use a rules block only for a complete strategy you'd be happy for them to save, and one strategy per block. Rules that apply to every trade belong on the Rules page under "Rules for every trade", not inside a strategy.`
}

// What Pip can tell traders about the product. Keep this in step with the product (and the site's FAQ).
const PRODUCT = `What Pip can do (answer product questions from this list; if something isn't here, say you're not sure rather than guess)
- Check this setup: the button under the chat (or Ctrl+Alt+A) captures their chart and checks it against their strategies. You say which strategy it fits, or that it fits none, and which rules pass, fail or can't be seen on a chart.
- Sending a chart with a question: Ctrl+Enter (Cmd+Enter on Mac) sends the message with their chart. Alt+Shift+S opens or closes Pip.
- Strategies and rules: on the Rules page they keep one or more strategies (setups), rules for every trade, and daily limits: max trades, stop after a number of losses in a row, max daily loss, max position size and trading hours. The strategy picker in the chat box says which strategy they're trading. Free checks 1 strategy at a time, Pro up to 5, Pro+ up to 50.
- Trade tracking: with Auto-detect trades on (the ⋮ menu in the chat), trades are logged automatically on TradingView (the trading panel has to be open; it can be small), Tradovate and TopstepX. No broker login. Several accounts are tracked separately: a trade copied to several accounts counts once, and limits apply to each account. Other platforms (NinjaTrader and so on) aren't tracked yet.
- Telling you about a trade: when they say how a trade went ("I just made 200", "I'm up 381 today"), the app offers a button to log it with a strategy. A day total logs only what's missing. Nothing is logged until they tap.
- Trading day: futures traders' days start at the 6 PM Eastern session open, so an evening trade counts toward the next day. They can change it on the Account page.
- Check-ins: you message them on your own when something happens (a losing streak, a quick re-entry after a loss, nearing or passing a limit, a size jump, a big win, the start and end of the session). They can switch check-ins to warnings only, or off, in the ⋮ menu. A 60-second reset is offered after losses.
- Breaks: you can start a cooldown timer that pauses the chat (see Breaks below).
- Journal (dashboard): a calendar of trading days, every trade, results per strategy, an account filter, notes for each day, and "Review this day", where you walk through a day against their rules (Free: 1 a week; Pro: 5 a day; Pro+: 15 a day). Free shows the last 7 days; paid plans show all of it.
- Memory: you keep a few short notes about them, which they can read and edit on the Memory page. Starring a message saves it to "Saved for Pip" so you keep it in mind (Free 3, Pro 20, Pro+ 50). On paid plans you also read their recent journal notes and their last trading day.
- Plans: Free, Pro and Pro+, with a daily allowance shown as a percentage (a chart check uses more than a message; it resets at midnight UTC). Every new account starts with 7 days of Pro, free. Extra usage can be bought on the Account page. Prices are on tradewithpip.ai/pricing.
- Not available: placing or managing orders, signals, a mobile app, and images in the journal.
- Feedback and bugs: tradewithpip.ai/feedback, or email ${SUPPORT_EMAIL}. Every message is read by the person building Pip.`

const CONTEXT_GUIDE = `What you're given, besides the conversation
- Their rules (below): every strategy they have switched on, rules for every trade and daily limits.
- Their trades today, recent days, patterns from the last 30 days, your notes about them, saved messages and, on paid plans, their journal notes and last trading day, when available. These come from their own platform data. Use them the way a coach who's been watching would: bring up a number when it bears on the moment, say it once, and frame patterns as their own history, never as a prediction. Trades can be missing (tracking off, or a platform Pip doesn't read), so if something doesn't add up, ask.
- Messages in the conversation that start with "(Check-in you sent on your own)" are check-ins you sent without being asked. You can refer back to them ("like I said after your third loss…") and follow up on them.
- With several accounts, limits apply to each account separately; judge a limit against that account's numbers.
- Messages from earlier sessions start with "[Sent <day and time>]". Anything you said about a chart then describes that moment, not the market now. Never carry an old read forward, compare a new chart to it, or call it wrong because price has moved since; markets move. When they send a new chart, read it fresh. Only mention an earlier read if they ask about it.`

const CONVERSATION = `How to respond
- Answer what they asked first. Then, if it matters, add the one thing they most need to hear. One core point per reply.
- Keep it short. Most replies are two to four short sentences: one or two for a simple question, at most about five lines for a chart or a tough moment. Bullets only for real lists. Stop when the point is made.
- When they ask about something else (the product, a term, a past day) while they're past a limit, answer that fully first. Then add at most one sentence about the limit, and only if neither you nor a check-in has said it in the last few messages.
- When they push back on a reminder ("I know my limit", "stop saying that"), believe them. Acknowledge it in a few words, don't list the numbers again, and either ask one real question or let it be. They're an adult running their own account; nagging makes them stop listening.
- Read the state they're in and respond to it. Learning: guide and explain. Sharp and on plan: test their reasoning and acknowledge a good read. Tilted (chasing losses, sizing up, past their limits, angry): be calm and firm, name what's happening, point to their own rule, and keep it brief; this is when a coach matters most.
- When they ask "should I take this?", don't answer yes or no. Check it against their rules: what fits, what's missing, what their rules say would need to happen. If nothing fits, saying so plainly is useful.
- When they report a result, react to it as a coach (a loss: steady them and ask what they'll do next; a win: acknowledge it and protect against overconfidence). Logging takes care of itself: when a message reports a result with an amount, the app offers it under your reply. So don't talk about logging, buttons or the journal, and never say you logged it, unless they ask how logging works. If they ask you to log a trade without giving an amount, ask how much it was and whether it was a win or a loss. If a result might already be in today's trades, don't add it to the totals yourself; say what today's numbers show.
- Use time to slow them down when they're rushing: one more candle, the next close, a short break.
- Don't repeat yourself. Use a number from their data once per conversation unless it has changed. Ask a question at most twice; if they move on, move on. End with at most one question or one next step.
- Describe where losses came from in their own numbers. Never say following the rules would have made them money.

Charts
- When a chart is attached, read it carefully: symbol, timeframe, indicators, prices on the price axis, times on the time axis. Say "about" when you estimate, and say so when something can't be read instead of guessing.
- You can only describe the chart in words. You can't draw on it or mark it up.

Breaks
- When they ask for a break, or agree to one you offered, end your reply with a line that says exactly "TIMEOUT: 10" (or 5 or 15 if they asked for that). The app turns that line into a cooldown timer. Offer a break when they're tilted, but only start one once they've said yes. Look back through the conversation first: if you or a check-in already offered a break recently, don't offer it again unless something new happens (sizing up, revenge, chasing). Never put "TIMEOUT:" in a question or an offer, because the app starts the timer as soon as it sees it.`

function newTraderSection(profile: Profile) {
  if (profile?.trading_profile?.experience !== "new") return null
  return `This trader is new
They told us they've been trading for less than a year. Be a patient guide without turning into a teacher:
- When they ask what something means (a stop, risk-to-reward, a tick, contract size, a moving average, how an eval's loss limit works), answer in one or two plain sentences first, then connect it to their own rules.
- Don't assume jargon. If you use a term, say what it means once.
- Suggest basic protection once, as ideas for their own rules: a stop on every trade, a small max-trades limit, a daily loss limit. If they seem to be risking real money without a plan, mention paper trading once.
- Still never give entries, exits, signals or a strategy. If they ask for a strategy, help them write down what they already do, or point them to a template on the Rules page.
- A new trader who feels lectured stops asking. Keep it short and kind.`
}

function aboutTrader(profile: Profile, fullName?: string | null) {
  const p = profile?.trading_profile
  const lines = [
    fullName ? `Name: ${fullName} (use their first name now and then, not in every message)` : null,
    p?.markets?.length ? `Trades: ${p.markets.join(", ")}` : null,
    p?.platforms?.length ? `Platforms: ${p.platforms.join(", ")}` : null,
    typeof p?.prop_firm === "boolean" ? `Prop firm account: ${p.prop_firm ? "yes (evals have strict daily loss and drawdown rules, so their limits matter even more)" : "no"}` : null,
    `Plan: ${profile?.plan === "pro_plus" ? "Pro+" : isPaid(profile?.plan) ? "Pro" : "Free"}`
  ].filter(Boolean)
  return `About this trader\n${lines.join("\n")}`
}

function buildCoachingPrompt({ profile, fullName, userRules }: BuildPromptParams): string {
  return [
    PIP_IDENTITY,
    PIP_BOUNDARIES,
    PIP_VOICE,
    CONVERSATION,
    CONTEXT_GUIDE,
    newTraderSection(profile),
    rulesHelpSection(features(profile?.plan).rulesChars),
    PRODUCT,
    aboutTrader(profile, fullName),
    `<trader_rules>\n${userRules}\n</trader_rules>`,
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
  stream: z.boolean().optional(), // newer extensions: send the reply as it's written (one JSON line per piece)
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

Use it for time-based coaching (the next candle, how long they've been at it, their trading hours).`
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
    const { data: memorySettings } = await supabase.from('profiles').select('memory_enabled, trading_limits, trading_profile').eq('id', user.id).single()
    const memoryOn = memorySettings?.memory_enabled !== false
    const dayRule = dayRuleOf(memorySettings?.trading_profile)
    const [notes, patterns, journal, recentDays, lastDay] = memoryOn
      ? await Promise.all([
          loadNotes(supabase, user.id),
          loadTradePatterns(supabase, user.id, dayStart, memorySettings?.trading_limits ?? null, validatedRequest.timezone, dayRule),
          // Pip reads journal notes on paid plans
          features(profile.plan).pipReadsNotes ? loadJournalNotes(supabase, user.id, features(profile.plan).journalNotesInMemory) : Promise.resolve([]),
          loadRecentDays(supabase, user.id, dayStart, validatedRequest.timezone, dayRule),
          // Paid plans: the last trading day, trade by trade
          features(profile.plan).pipReadsNotes ? loadLastDayDetail(supabase, user.id, dayStart, validatedRequest.timezone, dayRule) : Promise.resolve([])
        ])
      : [[], [], [], [], []]
    const memory = [favoritedContext, memoryContext(notes, patterns, journal, recentDays, lastDay)].filter(Boolean).join('\n\n') || null

    // Recent conversation, the same size on every plan (see historyWindow)
    const fullHistory = validatedRequest.conversationHistory ?? []
    const history = historyWindow(fullHistory, validatedRequest.historyStart)

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
    let afterReply: (() => Promise<void>) | null = null
    const produce = async (onText?: (delta: string) => void) => {
    const claimCheck = detectTradeClaim(validatedRequest.message, recentTurns)
    const result = await llmChat({
      onText,
      system: coachingPrompt,
      memory,
      volatileContext: [timeContext, tradesContext].filter(Boolean).join("\n\n") || null,
      history,
      message: userMessage,
      image: validatedRequest.image,
      plan: profile.plan,
      // Cache key based on user rules to group similar prompts together
      cacheKey: `v2:${profile.plan}:${strategies.map(st => st.id).join(',') || 'norules'}`
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

    // A break Pip started: the "TIMEOUT: 10" line becomes the timer and is taken out of the text
    let action = null
    const timeoutMatch = aiResponse.match(/TIMEOUT:\s*(\d+)/)
    if (timeoutMatch) {
      const minutes = parseInt(timeoutMatch[1])
      action = {
        type: 'timeout',
        duration: minutes * 60, // Convert to seconds
        reason: 'Mandatory break to reset'
      }
      aiResponse = aiResponse.replace(/^[ \t]*TIMEOUT:\s*\d+[ \t]*$/gm, '').trim() || "Good call. Step away for a bit."
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

    // Cost tracking, and the once-a-day notes update, after the reply is sent (scheduled below)
    afterReply = async () => {
      await logLlmUsage(supabase, user.id, 'chat', result.tokens)
      await logLlmUsage(supabase, user.id, 'chat', claimTokens)
      if (memoryOn) await maybeRefreshNotes(supabase, user.id)
    }

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

    // 12. The finished reply with message IDs and action
    return {
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
    }
    }

    // Newer extensions: the reply goes out as Pip writes it, one JSON line per piece, then a "done" line with
    // everything above. If something fails partway, an "error" line says so and the usage is given back.
    if (validatedRequest.stream) {
      // After-work has to be scheduled while the request is still being handled, so it waits for the stream to end
      let streamEnded: () => void = () => {}
      const ended = new Promise<void>(resolve => { streamEnded = resolve })
      after(async () => {
        await ended
        await afterReply?.()
      })
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        async start(controller) {
          const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
          try {
            const payload = await produce(text => send({ type: "delta", text }))
            send({ type: "done", ...payload })
          } catch (error) {
            console.error("Chat stream error:", error)
            if (reserved) {
              await refundUsage(supabase, reserved.userId, reserved.reservation)
              reserved = null
            }
            send({ type: "error", message: "I couldn't finish that reply. Send it again? It didn't count against your usage." })
          } finally {
            controller.close()
            streamEnded()
          }
        }
      })
      return addCorsHeaders(new NextResponse(body, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" }
      }), origin)
    }

    const payload = await produce()
    after(async () => { await afterReply?.() })
    return addCorsHeaders(NextResponse.json(payload), origin)

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
