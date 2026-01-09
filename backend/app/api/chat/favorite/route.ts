import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-client"
import { createAdminClient } from "@/lib/supabase-admin"

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

    // Get token from Authorization header
    const authHeader = req.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      const response = NextResponse.json({ error: "Invalid token" }, { status: 401 })
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

    // Use admin client to bypass RLS (we manually check user_id for security)
    const adminClient = createAdminClient()

    // If favoriting (not unfavoriting), check limits
    if (isFavorited) {
      // Get user profile to check plan
      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single()

      if (profile) {
        // Count current favorites
        const { count, error: countError } = await adminClient
          .from("chat_messages")
          .select("*", { count: 'exact', head: true })
          .eq("user_id", user.id)
          .eq("is_favorited", true)

        if (countError) {
          console.error("[Favorite API] Error counting favorites:", countError)
        } else if (count !== null) {
          const limit = profile.plan === 'pro' ? 20 : 3
          
          if (count >= limit) {
            const message = profile.plan === 'pro' 
              ? "You've reached the maximum of 20 saved messages."
              : "Free plan limited to 3 saved messages. Upgrade to Pro for 20 saved messages."
            
            const response = NextResponse.json(
              { error: message },
              { status: 429 }
            )
            return addCorsHeaders(response, origin)
          }
        }
      }
    }

    // Update the message's favorited status
    const { data, error } = await adminClient
      .from("chat_messages")
      .update({ is_favorited: isFavorited })
      .eq("id", messageId)
      .eq("user_id", user.id) // Security: only update own messages
      .select()

    if (error) {
      console.error("[Favorite API] Error updating message:", error)
      const response = NextResponse.json(
        { error: "Failed to update message" },
        { status: 500 }
      )
      return addCorsHeaders(response, origin)
    }

    if (!data || data.length === 0) {
      console.warn("[Favorite API] No rows updated - message not found or not owned by user")
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
