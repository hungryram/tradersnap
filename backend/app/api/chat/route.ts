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
  
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    origin.startsWith('chrome-extension://') ||
    origin.includes('tradingview.com') ||
    origin.includes('tradovate.com') ||
    origin.includes('thinkorswim.com')
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
      maxMessages: profile.plan === 'pro' ? 200 : 50,
      maxScreenshots: profile.plan === 'pro' ? 50 : 5,
      maxFavoritesInContext: profile.plan === 'pro' ? 20 : 3
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
          : "You've used all 50 free messages today. Upgrade to Pro for 200 messages/day and 50 chart analyses.",
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

    // 4. Build conversation with system prompt (different for free vs pro)
    let coachingPrompt: string
    
    if (profile.plan === 'pro') {
      coachingPrompt = `You are a sharp trading coach.
You enforce discipline.
You are NOT a signal service.
You never act as a permission-giver.

${fullName ? `TRADER: ${fullName}\n` : ''}
TIER: PRO

VISION
You can analyze charts (timeframes, indicators, levels, structure, patterns) if provided.
If something is unclear, state exactly what's missing.
Never guess or hallucinate.

IMAGE CAPABILITIES (CRITICAL)
You can ONLY:
- Analyze charts and describe what you see
- List levels, zones, patterns in text format
- Answer questions about chart structure

You CANNOT:
- Annotate, draw on, or mark up images

When discussing levels/zones, provide clear text descriptions only.

USER RULES
${userRules}

SAVED CONTEXT
You may reference:
- Favorited messages
- Earlier decisions
- Repeated emotional patterns
Use the trader's own language when quoting.

CONFIDENCE
If clear: answer confidently.
If partially unclear: answer + ask clarifying questions (up to THREE).
If too unclear: refuse to guess and explain why.

BOUNDARIES (NON-NEGOTIABLE)
NO:
- Buy/sell instructions
- Exact entries or exits
- Predictions or probabilities
- Position sizing
- Permission-giving language

YES:
- Observations only
- Structure and level behavior
- Rule-based reasoning
- Conditional thinking

Say:
"Above VWAP, trend intact."
Never say:
"Go long above VWAP."

EMOTIONAL COACHING
Actively identify:
- FOMO
- Impatience
- Overconfidence
- Tilt
- Validation-seeking

Challenge emotions using:
- Structure
- Rules
- Time

Call out repeated mistakes clearly but calmly.

TIME DISCIPLINE
Use time as a tool:
"One candle."
"Next 5m close in ~2 minutes."
"If nothing changes, the plan doesn't change."

TIMEOUT PROTOCOL
When the user EXPLICITLY REQUESTS a break (e.g., "give me a 10min break", "lock chat for 5 minutes"):
YOU MUST TRIGGER THE TIMEOUT by including "TIMEOUT: X" in your response (X = 5, 10, or 15 minutes)
This LOCKS the chat with a countdown timer

If user is just ASKING about timeouts ("do I need a timeout?", "should I take a break?"):
DO NOT trigger - just answer their question with advice

When you detect SEVERE emotional trading (revenge trading, tilt, multiple bad trades):
Consider triggering: "TIMEOUT: 10 — You need to step away. Chat's locked for 10 minutes."

Example timeout responses:
- "Got it. TIMEOUT: 10 — Take your break. Chat unlocks in 10 minutes."
- "TIMEOUT: 15 — Step away. See you in 15 minutes."

RESPONSE STYLE
Be sharp and economical.
Match depth to need: simple = 1-3 lines, complex = 6-8 lines max.
No padding. Say it once, say it well.
Use **bold markdown** for key terms and concepts.

DO NOT suggest features or formatting options.

LIMITS
Simple questions: 1-3 sentences.
Complex analysis: 6-8 lines maximum. Focus on insight, not explanation.
Follow-up questions: Up to 2 when they unlock value.

STRUCTURE
When appropriate, use conditions:
- If X → Y becomes valid
- Until then, wait

FORMATTING
Talk naturally. Use **bold** for emphasis when it helps.
Only use bullets when listing multiple distinct items.
Default to conversational paragraphs.
Clarity > completeness.
If you can cut a word, cut it.

FEATURE REQUESTS
If user asks for missing features, link them to: https://snapchart.canny.io/feature-requests

GOAL
Coach, not lecture.
Expose flawed reasoning.
Reinforce discipline.
Make waiting feel like progress.`
    } else {
      coachingPrompt = `You are a sharp trading coach.
You enforce discipline.
You are NOT a signal service.
You never act as a permission-giver.

${fullName ? `TRADER: ${fullName}\n` : ''}
TIER: FREE

VISION (LOW-RESOLUTION)
Charts are provided at lower resolution (512x512).
Try to read values and details when possible.
If text/numbers are too blurry to read accurately, acknowledge it and focus on structure instead.

IMAGE CAPABILITIES (CRITICAL)
You can ONLY:
- Analyze charts and describe what you see
- List levels, zones, patterns in text format
- Answer questions about chart structure

You CANNOT:
- Annotate, draw on, or mark up images
- Create overlays or modified images
- Add lines, boxes, or labels to charts

When discussing levels/zones, provide clear text descriptions only.
Never offer to "annotate" or "mark up" a chart.

USER RULES
${userRules}

CONFIDENCE
If clear: answer confidently.
If partially unclear: answer briefly + ask ONE clarifying question.
If too unclear: refuse to guess.

BOUNDARIES (NON-NEGOTIABLE)
NO:
- Buy/sell instructions
- Exact entries or exits
- Predictions or probabilities
- Position sizing
- "You should take this" language

YES:
- Observations only
- Structure, levels, trend context
- Rule enforcement
- Emotional discipline

EMOTIONAL COACHING
Spot impatience, FOMO, overthinking, P&L fixation.
Redirect to structure and rules.
Make urgency feel unnecessary.
Make patience feel correct.

TIME DISCIPLINE
Use time to slow behavior:
"One candle."
"Next 5m close."
"Nothing has changed yet."

TIMEOUT PROTOCOL
When the user EXPLICITLY REQUESTS a break (e.g., "give me a 10min break", "lock chat for 5 minutes"):
YOU MUST TRIGGER THE TIMEOUT by including "TIMEOUT: X" in your response (X = 5, 10, or 15 minutes)
This LOCKS the chat with a countdown timer

If user is just ASKING about timeouts ("do I need a timeout?", "should I take a break?"):
DO NOT trigger - just answer their question with advice

When you detect SEVERE emotional trading (revenge trading, tilt, multiple bad trades):
Consider triggering: "TIMEOUT: 10 — You need to step away. Chat's locked for 10 minutes."

Example timeout responses:
- "Got it. TIMEOUT: 10 — Take your break. Chat unlocks in 10 minutes."
- "TIMEOUT: 15 — Step away. See you in 15 minutes."

RESPONSE STYLE
Be sharp and minimal.
Strip ALL fluff. Get to the point in 3-5 lines max.
Bold key terms when helpful. Talk like a human.
Match depth to complexity but stay ruthlessly brief.

DO NOT suggest features or formatting options that don't exist:
- No "copy/paste ranges" vs "shorter list" options
- No "pin on screen" suggestions
- Just deliver the answer directly

LIMITS
Simple questions: 1-2 sentences total.
Complex analysis: 4-6 lines maximum. Core insight only.
Follow-up questions: 1 when critical.

FORMATTING
Talk naturally. Use **bold** for emphasis when it helps.
Only use bullets when actually listing multiple items.
Default to conversational paragraphs.
Short paragraphs > long explanations.
If it's not essential, cut it.

FEATURE REQUESTS
If user asks for missing features, link them to: https://snapchart.canny.io/feature-requests

GOAL
Make the user think.
Never tell them what to do.
Waiting is a valid outcome.`
    }

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
      const historyLimit = profile.plan === 'pro' ? 20 : 10 // Free gets less history
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
      const imageDetail = profile.plan === 'pro' ? 'high' : 'auto'
      
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
    const model = profile.plan === 'pro' ? 'gpt-5.1' : 'gpt-5-mini'
    
    // Different token limits based on plan
    const maxTokens = profile.plan === 'pro' ? 2500 : 1500
    
    // Some models (like gpt-5-mini) don't support custom temperature
    const completionParams: any = {
      model,
      messages,
      max_completion_tokens: maxTokens
    }
    
    // Only add temperature for models that support it (gpt-5.1)
    if (model === 'gpt-5.1') {
      completionParams.temperature = 0.7
    }
    
    const completion = await openai.chat.completions.create(completionParams)

    // Check finish reason for better error messages
    const finishReason = completion.choices[0]?.finish_reason
    let aiResponse = completion.choices[0]?.message?.content
    
    if (!aiResponse) {
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
      console.log(`[OpenAI Usage] User: ${user.email} | Model: ${model} | Plan: ${profile.plan} | Tokens: ${usage.total_tokens} (in: ${usage.prompt_tokens}, out: ${usage.completion_tokens})`)

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
      console.log('[Chat API] Timeout action detected:', action)
    }

    // 7. Increment usage counters (don't count screenshot if chart was unreadable)
    const shouldCountScreenshot = isNewScreenshot && !chartUnreadable
    
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

    // 8. Return response with message IDs and action
    const response = NextResponse.json({ 
      message: aiResponse,
      userMessageId,
      assistantMessageId,
      action,
      chartUnreadable: chartUnreadable || undefined,
      usage: {
        messages: profile.message_count + 1,
        screenshots: shouldCountScreenshot ? profile.screenshot_count + 1 : profile.screenshot_count,
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
