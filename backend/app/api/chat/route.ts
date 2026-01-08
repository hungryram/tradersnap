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

    // Check screenshot limit
    if (hasImage && profile.screenshot_count >= limits.maxScreenshots) {
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

    // 4. Build conversation with system prompt
    const coachingPrompt = `Sharp trading coach. Enforce discipline. NOT a signal service. Never act as permission-giver.

${fullName ? `TRADER: ${fullName}\n` : ''}

VISION
You can see charts (timeframes, indicators, levels, patterns). NEVER say "can't see chart." If unclear, state what's missing.

USER'S RULES
${userRules}

CHART ANALYSIS
Balance what you see vs user states:
- Match (~5pts): confirm
- Differ: politely correct
- Unclear: trust user
NEVER guess or hallucinate.

CONFIDENCE
Clear → answer confidently
Unclear details → answer + ask (explain why)
Too unclear → refuse to guess

BOUNDARIES (NON-NEGOTIABLE)
NO: Buy/sell instructions, exact entries/exits, predictions, probabilities, position sizing, permission-giving
YES: Analyze structure/levels, reference rules, challenge emotions
Frame observations only: "25,740 held resistance" NOT "Enter 25,740"

EMOTIONAL COACHING
Spot: "Should I..." (impatience), "Feels..." (emotion>rules), P&L fixation, FOMO
Fix: Redirect to structure/rules. Make patience doable, urgency silly.

TIME TOOL
Use for discipline: "ONE candle. Zoom out." "Next 5m in ~2min. Wait?"

TIMEOUT PROTOCOL (CRITICAL)
Trigger ONLY when user:
- Explicitly requests: "timeout", "10min", "5min"
- Confirms break IMMEDIATELY after you suggest one
Generic "yes" does NOT trigger unless directly following your break suggestion
Just asking ("should I break?") → advice only, don't trigger
Severe tilt → trigger directly
Format: "TIMEOUT: X" (5/10/15)

SAVED MESSAGES
Quote favorited messages. Use user's language. Call out patterns.

FEATURE REQUESTS
If user asks for missing features, link them to: https://snapchart.canny.io/feature-requests

RESPONSE
Quick: MAX 2 sentences
Charts: MAX 4 sentences
Cut fluff.

Make them think, not follow.`

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

    // Add conversation history if provided (limit to last 20 messages for token control)
    if (validatedRequest.conversationHistory) {
      const limitedHistory = validatedRequest.conversationHistory.slice(-20)
      messages.push(...limitedHistory)
    }

    // Add current message
    if (validatedRequest.image) {
      // Message with chart image (either new capture or context from previous analysis)
      const imageDescription = validatedRequest.isContextImage 
        ? "Here's the chart I analyzed earlier:"
        : "Current chart:"
      
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `${imageDescription}\n\n${validatedRequest.message}` },
          { 
            type: "image_url", 
            image_url: { 
              url: validatedRequest.image,
              detail: "high"
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
    const completion = await openai.chat.completions.create({
      model,
      messages,
      max_completion_tokens: 1200,
      temperature: 0.7
    })

    const aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response."

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
    }

    // 7. Increment usage counters
    await supabase
      .from('profiles')
      .update({
        message_count: profile.message_count + 1,
        screenshot_count: hasImage ? profile.screenshot_count + 1 : profile.screenshot_count
      })
      .eq('id', user.id)

    // 8. Return response with message IDs and action
    const response = NextResponse.json({ 
      message: aiResponse,
      userMessageId,
      assistantMessageId,
      action,
      usage: {
        messages: profile.message_count + 1,
        screenshots: hasImage ? profile.screenshot_count + 1 : profile.screenshot_count,
        limits: limits
      }
    })
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("Chat error:", error)
    
    if (error instanceof z.ZodError) {
      console.error('[Chat API] Validation errors:', JSON.stringify(error.errors, null, 2))
      const response = NextResponse.json(
        { error: "Invalid request", details: error.errors },
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
