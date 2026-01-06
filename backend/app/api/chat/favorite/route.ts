import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-client"

export const runtime = "nodejs"

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

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin")
  
  try {
    const supabase = createClient()

    // Get authenticated user
    const {
      data: { session }
    } = await supabase.auth.getSession()

    if (!session) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    const body = await req.json()
    const { messageId, isFavorited } = body

    if (!messageId) {
      const response = NextResponse.json(
        { error: "Message ID required" },
        { status: 400 }
      )
      return addCorsHeaders(response, origin)
    }

    // Update the message's favorited status
    const { error } = await supabase
      .from("chat_messages")
      .update({ is_favorited: isFavorited })
      .eq("id", messageId)
      .eq("user_id", session.user.id) // Security: only update own messages

    if (error) {
      console.error("[Favorite API] Error updating message:", error)
      const response = NextResponse.json(
        { error: "Failed to update message" },
        { status: 500 }
      )
      return addCorsHeaders(response, origin)
    }

    const response = NextResponse.json({ success: true })
    return addCorsHeaders(response, origin)
  } catch (error) {
    console.error("[Favorite API] Error:", error)
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
