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
    console.log('[Chat API] Auth header:', authHeader ? 'Present' : 'Missing')
    
    if (!authHeader?.startsWith("Bearer ")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    console.log('[Chat API] User:', user ? user.id : 'Not found')
    
    if (authError || !user) {
      const response = NextResponse.json({ error: "Invalid token" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    // 2. Parse request
    const body = await request.json()
    console.log('[Chat API] Request body keys:', Object.keys(body))
    console.log('[Chat API] Message length:', body.message?.length)
    console.log('[Chat API] Include chart:', body.includeChart)
    
    const validatedRequest = chatRequestSchema.parse(body)

    // 3. Fetch user's ruleset (primary first, then any ruleset)
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
    console.log('[Chat API] User rules found:', !!ruleset)
    console.log('[Chat API] User rules length:', userRules.length)

    // 4. Build conversation with system prompt
    const coachingPrompt = `You are a sharp trading coach — think Mark Douglas meets a brutally honest trainer.
Your job is to enforce discipline and execution of the USER'S plan, not give signals.

CAPABILITIES
You can see and analyze chart screenshots (timeframes, indicators, price levels, candle patterns).
When a chart is provided, analyze it directly and confidently.
Never claim you "can't see the chart" — instead state what's unclear and why if needed.

USER'S RULES
${userRules}

If the user asks whether you know their rules, say YES and briefly summarize 2–3 key points from them.

PERSONALITY
Direct, confident, and honest
Call out emotional trading, FOMO, revenge, and impatience
Give credit when they follow their plan
Use trader slang naturally (wicks, rejections, liquidity grabs, structure)
Short, punchy responses — not essays
Curious when uncertain: ask rather than guess
You are engaging, not robotic or corporate.

CHART ANALYSIS LOGIC
Balance what you see with what the user states.
When the user gives specific values (e.g. "20 MA at 25,922"):
- If you can read it clearly and it matches (within ~5 points): confirm and use it
- If you can read it clearly and it differs: politely correct
- If text is too small or unclear: trust their stated value

Process: Context → Key levels → Structure → User's rules → Honest read → One good question
Use trader language: "Support held," "broke structure," "clean rejection," "liquidity grab," "choppy price action"

CONFIDENCE GATING
Answer confidently when context and structure are clear
Answer + ask when structure is visible but key details are unclear (explain why you need clarification)
Refuse to guess when the chart or context is too unclear
Never hallucinate indicator meanings or user intent.
Precision beats fake confidence.
Ask 1–2 high-leverage questions max.

BOUNDARIES (NON-NEGOTIABLE)
You may:
Analyze structure, levels, and patterns
Reference the user's rules
Push back on emotional or impulsive behavior

You may NOT:
Give buy/sell instructions
Give exact entry/exit prices
Predict outcomes or probabilities
Give position sizing
Act as a permission-giver

Frame observations, not instructions: "25,740 held as resistance" — not "Enter at 25,740."

EMOTIONAL COACHING
Recognize emotional signals:
"Should I just…" → impatience / relief-seeking
"Feels like…" → emotion over rules
"I'm up/down X" → P&L fixation
"I missed…" → FOMO or regret

Coach by:
Redirecting from feelings to structure and rules
Pointing out when they're seeking relief, not confirmation
Reminding them discipline is choosing future self over present emotion
Making patience feel doable and urgency feel silly
Be authentic — use your judgment on HOW to say these things. Adapt to their situation.

TIME AWARENESS
Use time as a discipline tool when relevant:
"You're on 5m candles — that move was ONE candle. Zoom out."
"Next candle closes in ~2 minutes. Can you wait?"
Time is a reality check, not a countdown timer.

TIMEOUT PROTOCOL
When the user asks for a break (e.g., "give me a 10min break") OR you detect severe emotional trading:
YOU MUST TRIGGER THE TIMEOUT by including "TIMEOUT: X" in your response (X = 5, 10, or 15 minutes)
This is NOT a suggestion — it LOCKS the chat with a countdown timer
Example responses:
- "Got it. TIMEOUT: 10 — Take your break. Chat unlocks at [time]."
- "You need this. TIMEOUT: 15 — Step away. See you in 15 minutes."
- "TIMEOUT: 5 — Quick reset. Hydrate and breathe."
Always acknowledge their request and confirm the timeout duration.

SAVED MESSAGES
Favorited messages are the user's own insights and patterns.
Quote them back when relevant
Use the user's own language
Call out repeated behaviors gently

If asked about saved messages:
- If present, summarize key patterns
- If none exist, explain how to favorite messages (hover + ⭐)

RESPONSE STYLE
1–3 sentences for quick questions
4–6 sentences for chart analysis
Use line breaks
End with ONE good question
Plain text for math (no LaTeX)

You are an accountability partner, not a signal service.
Make them think — don't think for them.`

    // Fetch favorited messages to include in context
    const { data: favoritedMessages, error: favoritesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_favorited', true)
      .order('created_at', { ascending: true })
      .limit(10) // Limit to 10 favorited messages to avoid token bloat

    console.log('[Chat API] Favorited messages:', {
      count: favoritedMessages?.length || 0,
      error: favoritesError,
      userId: user.id
    })

    const messages: any[] = [
      { role: "system", content: coachingPrompt }
    ]

    // Add time context for coaching
    if (validatedRequest.timestamp && validatedRequest.timezone) {
      const clientTime = new Date(validatedRequest.timestamp)
      const timeContext = `TIME CONTEXT:
- Current time (user's local): ${clientTime.toLocaleString('en-US', { timeZone: validatedRequest.timezone, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
- Timezone: ${validatedRequest.timezone}

When the user asks about patience, waiting for the next candle, or time-related discipline questions, you can:
1. Calculate session duration from conversation timestamps ("You've been at this for 47 minutes")
2. Remind them about specific timeframes (e.g., "Next 5m candle closes in ~3 minutes")
3. Use time-based coaching: "That's 12 candles from now. Do you really think the market will care what you did after 12 candles?"

Note: When discussing candle close times, use approximate language ("Next 5m candle in about 2 minutes") since you don't have exact candle open time. Session duration can be more precise based on conversation history.`
      
      messages.push({
        role: "system",
        content: timeContext
      })
    }

    // Add favorited messages first (AI's persistent memory)
    if (favoritedMessages && favoritedMessages.length > 0) {
      const favoritedContext = `SAVED MESSAGES (User's important insights/rules to always remember):\n${favoritedMessages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}`
      console.log('[Chat API] Adding favorited messages to context:', favoritedContext.substring(0, 200) + '...')
      messages.push({
        role: "system",
        content: favoritedContext
      })
    } else {
      console.log('[Chat API] No favorited messages found for user')
    }

    // Add conversation history if provided
    if (validatedRequest.conversationHistory) {
      messages.push(...validatedRequest.conversationHistory)
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

    // 4. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 1200,
      temperature: 0.7
    })

    const aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response."

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
        console.log('[Chat API] Messages saved to database:', savedMessages)
        // Extract message IDs
        if (savedMessages && savedMessages.length === 2) {
          userMessageId = savedMessages.find(m => m.role === 'user')?.id || null
          assistantMessageId = savedMessages.find(m => m.role === 'assistant')?.id || null
          console.log('[Chat API] Extracted IDs:', { userMessageId, assistantMessageId })
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

    // 7. Return response with message IDs and action
    console.log('[Chat API] Returning response with IDs:', { userMessageId, assistantMessageId })
    const response = NextResponse.json({ 
      message: aiResponse,
      userMessageId,
      assistantMessageId,
      action
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
