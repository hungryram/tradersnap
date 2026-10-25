import { NextRequest, NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/cors"
import { loadPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase-client"
import { createAdminClient } from "@/lib/supabase-admin"
import { getLimits } from "@/lib/usage"

export const runtime = "nodejs"

function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (isAllowedOrigin(origin)) {
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

    // Saves count against the plan's limit (what Pip keeps in mind in every chat)
    const { plan } = await loadPlan(adminClient, user.id)
    const limit = getLimits(plan).maxFavoritesInContext
    const countSaved = async () => {
      const { count } = await adminClient
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_favorited", true)
      return count ?? 0
    }

    if (isFavorited) {
      const used = await countSaved()
      if (used >= limit) {
        const message = plan === "free"
          ? `You've saved ${limit} of ${limit}. Remove one to make room, or go Pro to save up to ${getLimits("pro").maxFavoritesInContext}.`
          : `You've saved ${limit} of ${limit}. Remove one to make room for this.`
        return addCorsHeaders(NextResponse.json({ error: message, used, limit }, { status: 429 }), origin)
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

    const response = NextResponse.json({ success: true, used: await countSaved(), limit })
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
