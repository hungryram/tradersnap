import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CORS helper
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

const eventSchema = z.object({
  event_type: z.enum([
    'extension_opened',
    'chart_uploaded',
    'analysis_started',
    'analysis_finished',
    'user_reported_trade_taken',
    'chat_message_sent',
    'session_cleared'
  ]),
  session_id: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional()
})

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  
  try {
    // Auth
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

    // Validate request
    const body = await request.json()
    const validated = eventSchema.parse(body)

    // Log event
    const { error: insertError } = await supabase
      .from("usage_events")
      .insert({
        user_id: user.id,
        event_type: validated.event_type,
        session_id: validated.session_id || null,
        metadata: validated.metadata || {}
      })

    if (insertError) {
      console.error('[Events] Insert error:', insertError)
      const response = NextResponse.json({ error: "Failed to log event" }, { status: 500 })
      return addCorsHeaders(response, origin)
    }

    const response = NextResponse.json({ success: true })
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("[Events] Error:", error)
    const response = NextResponse.json({ error: "Internal server error" }, { status: 500 })
    return addCorsHeaders(response, origin)
  }
}
