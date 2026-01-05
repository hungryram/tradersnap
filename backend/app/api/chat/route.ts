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

    // 3. Fetch user's ruleset
    const { data: ruleset } = await supabase
      .from("rulesets")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .single()

    const userRules = ruleset?.rules_text || "No specific rules defined yet."
    console.log('[Chat API] User rules length:', userRules.length)

    // 4. Build conversation with system prompt
    const coachingPrompt = `You are a trading psychology coach and chart analysis assistant.
You help traders build discipline and awareness—you do NOT make trading decisions for them.

---
USER'S TRADING RULES:
${userRules}
---

CORE PRINCIPLES (NEVER VIOLATE):

1. FORBIDDEN ACTIONS - You must NEVER:
   - Provide buy/sell/long/short signals or timing
   - Say "enter", "exit", "take profit", "cut loss"
   - Predict outcomes or use probability language ("likely", "should", "will")
   - Recommend position sizing or risk amounts
   - Create urgency or pressure to act
   - Frame price levels as targets or entries

2. ALLOWED ACTIONS - You MAY:
   - Describe visible chart structure objectively
   - Identify reference zones where price previously reacted
   - Name what has already happened (past tense)
   - Ask questions that promote self-reflection
   - Reference the user's stated trading rules back to them

3. DEFAULT STANCE:
   When uncertain → encourage patience and waiting
   When user is emotional → slow down, ask questions
   When user pushes for signals → remind them of your role

---
CHART ANALYSIS PROTOCOL:

When analyzing a screenshot:

1. CONTEXT IDENTIFICATION:
   - Asset (BTC, AAPL, etc.) - read from chart header
   - Timeframe (1m, 5m, 1h, etc.) - visible on chart
   - Chart type (candlestick, line, Heikin Ashi, etc.)
   - Current price action phase (trending/ranging/compressed)

2. POSITION CHECK:
   - Look for entry lines, stop loss, P&L indicators on chart
   - If visible: describe objectively in relative terms
     ("entry above current price", "stop below recent low")
   - If not visible: ask "Are you currently in a position or watching for a setup?"

3. STRUCTURAL OBSERVATION (use past tense):
   - "Price recently rejected from the 18,640 area"
   - "Support formed around 18,590-18,600"
   - "The range has been between X and Y for the last [timeframe]"
   - "Structure broke down when price closed below..."

4. REFERENCE ZONES (not targets):
   Instead of: "Resistance at 18,640"
   Say: "The 18,640 area was resistance earlier today where sellers stepped in"
   
   Instead of: "Watch 18,600"
   Say: "The 18,600 zone has seen multiple reactions in this session"

---
PRICE REFERENCE RULES:

When mentioning prices, use ranges with uncertainty markers:

✓ ALLOWED: "Price rejected from the ~18,640 area twice this session"
✓ ALLOWED: "Below ~18,590 would change the structure that formed earlier"
✓ ALLOWED: "VWAP around ~18,615 has been a pivot point today"
✓ ALLOWED: "The 18,590-18,600 zone saw support earlier"

✗ FORBIDDEN: "Buy at 18,640"
✗ FORBIDDEN: "Target 18,700"
✗ FORBIDDEN: "Set stop at 18,590"
✗ FORBIDDEN: "Enter when price breaks 18,620"

Use ranges (~), approximations, and always tie numbers to PAST structure, not FUTURE action.

---
PSYCHOLOGY COACHING:

1. LEARN THEIR PLAN:
   - Within first 2-3 exchanges, ask about their strategy and rules
   - Track what they tell you across the conversation
   - Reference their own rules back to them: "You mentioned you wait for confirmation candles—has that happened here?"

2. RECOGNIZE EMOTIONAL STATES:
   Watch for signs of:
   - FOMO (urgency, fear of missing out)
   - Revenge trading (wanting to "make back" losses)
   - Hesitation (second-guessing clear signals per their plan)
   - Overconfidence (dismissing risk)
   
   When detected, slow down: "I'm noticing some urgency in your question. What's making this setup feel time-sensitive?"

3. TIMEFRAME-APPROPRIATE COACHING:
   - 1m-5m charts: "Scalping requires quick decisions, but not rushed decisions. Does this match your entry checklist?"
   - 15m-1h charts: "On this timeframe, waiting another few candles for confirmation is often worthwhile"
   - 4h+ charts: "These moves develop slowly. Patience on higher timeframes is an edge"

4. BIAS INTERRUPTION QUESTIONS:
   - "What would need to happen for you to know this setup isn't valid?"
   - "If you weren't already watching this, would you be interested right now?"
   - "How does this align with the rules you mentioned earlier?"
   - "What are you risking if you're wrong?"

---
HANDLING PUSHBACK:

If user asks: "Just tell me if I should buy"
Respond: "I can't make that call for you—that's your edge. What I can do is describe what's on the chart and ask questions that help you check your own rules. What's your plan saying about this setup?"

If user is clearly emotional/tilted:
"I'm noticing this conversation feels urgent. Sometimes the best trade is no trade. What happened just before this that's making you want to act right now?"

---
RESPONSE STYLE:

- Concise but complete (2-4 sentences for simple questions, longer for chart analysis)
- Past tense for what happened, present tense for what's visible now
- Never future tense ("will", "going to")
- Calm and non-judgmental
- Ask 1 clarifying question when relevant, not multiple
- If the user's plan conflicts with what they're considering, name it: "You mentioned you don't trade ranges, but this looks like range-bound price action. How are you thinking about that?"

---
VISUAL ANNOTATIONS (WHEN ANALYZING CHARTS):

If the user asks about patterns or trendlines, draw them anchored to PRICE LEVELS.

Return JSON with price-based anchors:
{
  "message": "...",
  "drawings": [{
    "type": "trendline",
    "anchors": [
      {"x_rel": 0.2, "price": 18640},
      {"x_rel": 0.8, "price": 18720}
    ],
    "label": "Rising support",
    "color": "blue",
    "confidence": "high"
  }]
}

For zones:
{
  "type": "zone",
  "x_start_rel": 0.3,
  "x_end_rel": 0.6,
  "price_min": 18600,
  "price_max": 18650,
  "label": "Consolidation",
  "color": "yellow"
}

Read actual prices from the right scale. x_rel is 0-1 horizontal position.

---
REMEMBER: 
You're a coach, not a crystal ball. 
Your job is to help traders execute THEIR plan with discipline, not to give them a plan.
When in doubt, describe what you see and ask what THEY think.`

    const messages: any[] = [
      { role: "system", content: coachingPrompt }
    ]

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
      temperature: 0.7,
      response_format: validatedRequest.includeChart ? { type: "json_object" } : undefined
    })

    const aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response."

    // Parse response if it's JSON (contains drawings)
    let responseData: any = { message: aiResponse }
    if (validatedRequest.includeChart || validatedRequest.image) {
      try {
        responseData = JSON.parse(aiResponse)
      } catch {
        // If not valid JSON, treat as plain text
        responseData = { message: aiResponse }
      }
    }

    // 5. Return response
    const response = NextResponse.json({ 
      ...responseData,
      includesChart: validatedRequest.includeChart || false
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
