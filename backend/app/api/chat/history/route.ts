import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin")
  const response = new NextResponse(null, { status: 200 })
  return addCorsHeaders(response, origin)
}

export async function GET(request: NextRequest) {
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
      console.error('[Chat History API] Auth error:', authError)
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    // 2. Get query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const sessionId = searchParams.get('session_id')

    // 3. Fetch chat history
    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(Math.min(limit, 500)) // Cap at 500 messages max

    // Optional: filter by session_id if provided
    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    const { data: messages, error: dbError } = await query

    if (dbError) {
      console.error('[Chat History API] Database error:', dbError)
      const response = NextResponse.json(
        { error: "Failed to fetch chat history" },
        { status: 500 }
      )
      return addCorsHeaders(response, origin)
    }

    // 4. Return messages
    const response = NextResponse.json({ 
      messages: messages || [],
      count: messages?.length || 0
    })
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error('[Chat History API] Error:', error)
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
