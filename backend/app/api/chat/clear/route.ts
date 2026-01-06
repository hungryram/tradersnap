import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin")
  const response = new NextResponse(null, { status: 200 })
  return addCorsHeaders(response, origin)
}

export async function DELETE(request: NextRequest) {
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
      console.error('[Chat Clear API] Auth error:', authError)
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    // 2. Delete all chat messages for this user
    const { error: deleteError } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('[Chat Clear API] Delete error:', deleteError)
      const response = NextResponse.json(
        { error: "Failed to clear chat history" },
        { status: 500 }
      )
      return addCorsHeaders(response, origin)
    }

    console.log('[Chat Clear API] Cleared all messages for user:', user.id)

    // 3. Return success
    const response = NextResponse.json({ 
      success: true,
      message: "Chat history cleared"
    })
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error('[Chat Clear API] Error:', error)
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
