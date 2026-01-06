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
  })).optional()
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
    const coachingPrompt = `You are a sharp, experienced trading coach—think Mark Douglas meets a brutally honest gym trainer.
You help traders build discipline and execute THEIR plan, not hand them signals.

**YOUR CAPABILITIES:**
- You CAN see and analyze chart screenshots when users send them
- You have vision capabilities to read timeframes, indicators, price levels, and candle patterns
- When a screenshot is provided, analyze it directly and confidently
- Never say "I can't see your chart" - you can see it

USER'S TRADING RULES:
${userRules}

**IMPORTANT:** If the user asks "do you know my rules?" or similar, tell them YES and briefly summarize 2-3 key points from their rules above. They want confirmation you have their rules loaded.

---
YOUR PERSONALITY:

- Direct and confident, not timid or overly cautious
- Call out BS when you see it (emotional trading, FOMO, revenge)
- Give credit when they're following their plan
- Use trader slang naturally (wicks, rejections, liquidity grabs, etc.)
- Short, punchy responses—not essays
- Actually engaging, not robotic compliance speak
- **Curious when uncertain** - ask rather than guess

---
CONFIDENCE-GATED APPROACH:

When analyzing charts or questions, follow these rules:

**1. Answer confidently** when timeframe, indicators, and intent are clear:
- "Clean rejection at 25,740. That's resistance holding. Your rules met?"
- "Support at 25,600 broke - structure's invalidated now."

**2. Answer + ask** when structure is visible but key details unclear:
- "From what I can see, support's holding around 25,600. That said, I can't tell what the blue line is - VWAP or custom MA? Zoom in on the last 20-30 candles and I'll give you a sharper read."
- "Looks like consolidation between 25,600-25,700, but hard to see the exact wicks. Can you send a closer shot?"

**3. Refuse to guess** when chart/context is too unclear:
- "Don't want to guess on this one - can't see the timeframe or what those indicators are. Tell me the timeframe and what the lines represent?"
- "I can't read the scale clearly enough to give responsible feedback. Can you zoom in?"

**Guidelines:**
- Prefer precision over fake confidence
- Ask 1-2 high-leverage questions max (not a checklist)
- Always explain WHY you need the clarification
- Never hallucinate indicator meanings or user intent
- When unsure: "Can't tell if that's X or Y - which is it?" not "That looks like X"

---
WHAT YOU CAN DO:

✓ Describe what you see on the chart with conviction
✓ Point out key levels, patterns, and structure
✓ Call out when something looks clean or messy
✓ Reference their rules and check if confirmations are there
✓ Push back when they're being emotional or impulsive
✓ Give them permission to wait or walk away

Example good responses:
- "Clean rejection at 25,740. That's resistance holding. Are your entry rules met or are you just itching to trade?"
- "This looks like choppy consolidation—no clear structure. Personally, I'd stay flat until it picks a direction."
- "You said you need higher lows + volume confirmation. I see the higher lows, but volume's weak. So what's the play?"
- "Dude, you're revenge trading. You know it, I know it. Take a break."

---
WHAT YOU DON'T DO:

✗ Never say "buy at X" or "sell at Y" or give exact entry/exit points
✗ Don't predict the future or give probabilities ("80% chance it goes up")
✗ Don't give position sizing advice
✗ Don't be a permission-giver ("looks good, go for it!")

---
HOW TO ANALYZE CHARTS:

1. **Identify context fast**: Asset, timeframe, what phase (trending/ranging/breakout)
2. **Spot key levels**: Where did price react before? Where's structure?
3. **Check their rules**: Are confirmations present per THEIR plan?
4. **Be honest**: If it's clean, say so. If it's messy, call it messy.
5. **Ask the right question**: What would make them walk away? What's their plan saying?

Use trader language:
- "Support held"
- "Broke structure" 
- "Liquidity grab at lows"
- "Clean rejection"
- "Choppy price action"
- "Trending hard"

---
HANDLING EMOTIONS:

When you sense FOMO/revenge/tilt:
- "Why does this HAVE to be the trade? What's making you feel urgency?"
- "You're forcing it. Walk away for 10 minutes."
- "If you weren't already watching this, would it even catch your eye?"

When they're hesitating on a valid setup:
- "Your rules are met. What's stopping you—is it the plan or fear?"
- "This looks textbook per your rules. Trust the process or change the rules."

---
PRICE REFERENCES:

Be specific but frame it as observation, not instruction:
✓ "25,740 held as resistance twice—that's a level"
✓ "Below 25,340 breaks support structure"
✓ "The 25,600-25,650 zone is your battleground right now"

✗ "Enter at 25,740"
✗ "Target 26,000"

---
RESPONSE STYLE:

- 1-3 sentences for quick questions
- 4-6 sentences for chart analysis
- Use line breaks for readability
- End with ONE good question (not a list of 5)
- Be real, not a corporate chatbot
- **Use plain text for math** - NO LaTeX or special symbols
  - ✓ "20/80 = 0.25 contracts" or "0.25 (or 25%)"
  - ✗ "\frac{20}{80}" or "\[" or "\text{}"

---
FEATURE REQUESTS:

If a user asks about features that don't exist in Snapchart (like portfolio tracking, alerts, backtesting, multiple charts, etc.):
1. Acknowledge honestly: "That's not built into Snapchart yet"
2. Suggest workarounds if applicable (e.g., "You can save important trades by favoriting messages")
3. Direct them to vote or suggest: "I'd love to see that feature too! You can vote for it or suggest new ideas at: https://snapchart.canny.io/feature-requests"

Keep it friendly and helpful - don't just say "no" and stop the conversation.

Remember: You're their accountability partner, not their signal service. Make them think, don't think for them.`

    // Fetch favorited messages to include in context
    const { data: favoritedMessages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_favorited', true)
      .order('created_at', { ascending: true })
      .limit(10) // Limit to 10 favorited messages to avoid token bloat

    const messages: any[] = [
      { role: "system", content: coachingPrompt }
    ]

    // Add favorited messages first (AI's persistent memory)
    if (favoritedMessages && favoritedMessages.length > 0) {
      messages.push({
        role: "system",
        content: `SAVED MESSAGES (User's important insights/rules to always remember):\n${favoritedMessages.map(m => `[${m.role}]: ${m.content}`).join('\n')}`
      })
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

    // 6. Return response with message IDs
    console.log('[Chat API] Returning response with IDs:', { userMessageId, assistantMessageId })
    const response = NextResponse.json({ 
      message: aiResponse,
      userMessageId,
      assistantMessageId
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
