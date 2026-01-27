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
  const header = `You are Snapchart — ADMIN THESIS MODE.

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

  const header = `You are Snapchart — a sharp trading coach focused on discipline.
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

WANT SOMETHING NEW?
Feature requests: https://snapchart.canny.io/feature-requests
Join Discord: https://discord.gg/vCSS8mbV3U`

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
  message: z.string().min(1),
  includeChart: z.boolean().optional(),
  image: z.string().regex(/^data:image\/(png|jpeg|jpg);base64,/).optional(),
  isContextImage: z.boolean().optional(), // Flag to indicate image is from previous analysis
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  })).optional(),
  timestamp: z.string().optional(), // ISO timestamp from client
  timezone: z.string().optional() // IANA timezone (e.g., "America/New_York")
})

function addCorsHeaders(response: NextResponse, origin: string | null) {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || 'https://admin.snapchartapp.com',
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
      .select('plan, message_count, screenshot_count, usage_reset_date, first_name, last_name, total_tokens_used, total_input_tokens, total_output_tokens')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[Chat API] Profile fetch error:', profileError)
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

    // 3. Parse request
    const body = await request.json()
    
    const validatedRequest = chatRequestSchema.parse(body)

    // 4. Define usage limits based on plan
    const limits = {
      maxMessages: profile.plan === 'admin' ? 999999 : profile.plan === 'pro' ? 200 : 15,
      maxScreenshots: profile.plan === 'admin' ? 999999 : profile.plan === 'pro' ? 50 : 5,
      maxFavoritesInContext: profile.plan === 'admin' ? 100 : profile.plan === 'pro' ? 20 : 3
    }

    // 5. Check usage limits
    const hasImage = !!validatedRequest.image
    const isNewScreenshot = hasImage && !validatedRequest.isContextImage
    
    // Check message limit
    if (profile.message_count >= limits.maxMessages) {
      const response = NextResponse.json({
        error: "Daily message limit reached",
        message: profile.plan === 'pro' 
          ? "You've reached your daily limit of 200 messages. Your limit resets at midnight UTC."
          : "You've used all 15 free messages today. Upgrade to Pro for 200 messages/day and 50 chart analyses.",
        limit: limits.maxMessages,
        current: profile.message_count,
        requiresUpgrade: profile.plan !== 'pro'
      }, { status: 429 })
      return addCorsHeaders(response, origin)
    }

    // Check screenshot limit (only for new screenshots, not context images)
    if (isNewScreenshot && profile.screenshot_count >= limits.maxScreenshots) {
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

    // 4. Build conversation with system prompt using type-safe builder
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
    const { data: favoritedMessages, error: favoritesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_favorited', true)
      .order('created_at', { ascending: false }) // Most recent first
      .limit(limits.maxFavoritesInContext) // 3 for free, 20 for pro

    const messages: any[] = [
      { role: "system", content: coachingPrompt }
    ]

    // Add time context for coaching
    if (validatedRequest.timestamp && validatedRequest.timezone) {
      const clientTime = new Date(validatedRequest.timestamp)
      const timeContext = `CURRENT TIME: ${clientTime.toLocaleString('en-US', { timeZone: validatedRequest.timezone, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}

Use for time-based coaching when they ask about the next candle or how long they've been trading.`
      
      messages.push({
        role: "system",
        content: timeContext
      })
    }

    // Add favorited messages first (AI's persistent memory)
    if (favoritedMessages && favoritedMessages.length > 0) {
      const favoritedContext = `SAVED MESSAGES (User's important insights/rules to always remember):\n${favoritedMessages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}`
      messages.push({
        role: "system",
        content: favoritedContext
      })
    } else {
    }

    // Add conversation history if provided (limit based on plan to control token usage)
    if (validatedRequest.conversationHistory) {
      const historyLimit = profile.plan === 'admin' ? 50 : profile.plan === 'pro' ? 20 : 10
      const limitedHistory = validatedRequest.conversationHistory.slice(-historyLimit)
      messages.push(...limitedHistory)
    }

    // Add current message
    if (validatedRequest.image) {
      // Message with chart image (either new capture or context from previous analysis)
      const imageDescription = validatedRequest.isContextImage 
        ? "Here's the chart I analyzed earlier:"
        : "Current chart:"
      
      // Use auto-res for free plan (~765 tokens, much better readability), high-res for pro (full detail)
      const imageDetail = profile.plan === 'admin' || profile.plan === 'pro' ? 'high' : 'auto'
      
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `${imageDescription}\n\n${validatedRequest.message}` },
          { 
            type: "image_url", 
            image_url: { 
              url: validatedRequest.image,
              detail: imageDetail
            } 
          }
        ]
      })
    } else {
      // Text-only message
      messages.push({
        role: "user",
        content: validatedRequest.message
      })
    }

    // 4. Call OpenAI with plan-based model selection
    const model = profile.plan === 'admin' || profile.plan === 'pro' ? 'gpt-5.1' : 'gpt-5-mini'
    
    // Different token limits based on plan
    const maxTokens = profile.plan === 'admin' ? 4000 : profile.plan === 'pro' ? 3000 : 2000
    
    // Some models (like gpt-5-mini) don't support custom temperature
    const completionParams: any = {
      model,
      messages,
      max_completion_tokens: maxTokens
    }
    
    // Only add temperature for models that support it (gpt-5.1)
    if (model === 'gpt-5.1') {
      completionParams.temperature = 0.7
      // Extended prompt caching (24h retention) for Pro users
      // Significantly reduces cost and latency for repeated system prompts
      completionParams.prompt_cache_retention = '24h'
    }
    
    // Cache key based on user rules to group similar prompts together
    // This improves cache hit rates when users have the same ruleset
    const cacheKey = `v1:${profile.plan}:${ruleset?.id || 'norules'}`
    completionParams.prompt_cache_key = cacheKey
    
    const completion = await openai.chat.completions.create(completionParams)

    // Check finish reason for better error messages
    const finishReason = completion.choices[0]?.finish_reason
    let aiResponse = completion.choices[0]?.message?.content
    let responseFailed = false
    
    if (!aiResponse) {
      responseFailed = true // Don't count failed responses towards limits
      // Provide helpful message based on why response failed
      if (finishReason === 'length') {
        aiResponse = profile.plan === 'pro'
          ? "My response got a bit long! 📝 Could you ask me something more specific, or break your question into smaller parts? I'm here to help!"
          : "My response got a bit long! 📝 Could you ask me something more specific, or break your question into smaller parts? (Pro users get longer responses for more detailed analysis)"
      } else {
        aiResponse = "I'm sorry, I couldn't generate a response. Please try again."
      }
    }
    
    // Check if AI couldn't read the chart properly (for screenshot tracking)
    const cantReadIndicators = [
      'unable to read',
      'cannot read',
      'can\'t see',
      'cannot see',
      'too blurry',
      'zoom in',
      'unclear image',
      'image quality',
      'clean up chart',
      'remove indicators',
      'hard to read',
      'difficult to read',
      'unclear chart',
      'lacks visible',
      'not visible',
      'not displayed',
      'is absent',
      'are absent',
      'no visible',
      'information is absent',
      'lacks candlestick',
      'lacks price action'
    ]
    
    const responseText = aiResponse.toLowerCase()
    const chartUnreadable = isNewScreenshot && cantReadIndicators.some(indicator => responseText.includes(indicator))
    
    // Log if response is empty
    if (!completion.choices[0]?.message?.content) {
      console.error('[Chat API] Empty response from OpenAI:', {
        model,
        plan: profile.plan,
        finishReason: completion.choices[0]?.finish_reason,
        choices: completion.choices.length,
        hasContent: !!completion.choices[0]?.message?.content
      })
    }

    // Track token usage (model-agnostic - check OpenAI dashboard for actual costs)
    const usage = completion.usage
    if (usage) {
      const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0
      const cacheHitRate = usage.prompt_tokens > 0 ? ((cachedTokens / usage.prompt_tokens) * 100).toFixed(1) : '0'
      
      // console.log(`[OpenAI Usage] User: ${user.email} | Model: ${model} | Plan: ${profile.plan} | Tokens: ${usage.total_tokens} (in: ${usage.prompt_tokens}, out: ${usage.completion_tokens}) | Cached: ${cachedTokens} (${cacheHitRate}%)`)

      // Update user's token usage in profile
      await supabase
        .from('profiles')
        .update({
          total_tokens_used: profile.total_tokens_used ? profile.total_tokens_used + usage.total_tokens : usage.total_tokens,
          total_input_tokens: profile.total_input_tokens ? profile.total_input_tokens + usage.prompt_tokens : usage.prompt_tokens,
          total_output_tokens: profile.total_output_tokens ? profile.total_output_tokens + usage.completion_tokens : usage.completion_tokens
        })
        .eq('id', user.id)
    }

    // 5. Save messages to database for audit trail
    let userMessageId: string | null = null
    let assistantMessageId: string | null = null
    
    try {
      const messagesToSave = [
        {
          user_id: user.id,
          role: 'user',
          content: validatedRequest.message,
          screenshot_url: null // Chart images stored in extension chrome.storage
        },
        {
          user_id: user.id,
          role: 'assistant',
          content: aiResponse
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

    // 6. Check if AI recommended a timeout
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

    // 7. Increment usage counters (don't count screenshot if chart was unreadable or if response failed)
    const shouldCountScreenshot = isNewScreenshot && !chartUnreadable
    
    // Only increment counters if the response was successful
    if (!responseFailed) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          message_count: profile.message_count + 1,
          screenshot_count: shouldCountScreenshot ? profile.screenshot_count + 1 : profile.screenshot_count
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('[Chat API] Failed to update usage counters:', updateError)
      }

      if (chartUnreadable) {
        console.log('[Chat API] Chart unreadable - not counting towards usage')
      }
    } else {
      console.log('[Chat API] Response failed - not counting towards usage limits')
    }

    // 8. Return response with message IDs and action
    const response = NextResponse.json({ 
      message: aiResponse,
      userMessageId,
      assistantMessageId,
      action,
      chartUnreadable: chartUnreadable || undefined,
      usage: {
        messages: responseFailed ? profile.message_count : profile.message_count + 1,
        screenshots: responseFailed ? profile.screenshot_count : (shouldCountScreenshot ? profile.screenshot_count + 1 : profile.screenshot_count),
        limits: limits
      }
    })
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("Chat error:", error)
    
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
