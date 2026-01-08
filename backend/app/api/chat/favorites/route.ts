import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-client"
import { createAdminClient } from "@/lib/supabase-admin"

export const runtime = "nodejs"

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

export async function GET(req: NextRequest) {
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

    // Use admin client to bypass RLS
    const adminClient = createAdminClient()

    // Fetch all favorited messages for this user
    const { data: messages, error } = await adminClient
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_favorited", true)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Favorites API] Error fetching messages:", error)
      const response = NextResponse.json(
        { error: "Failed to fetch favorited messages" },
        { status: 500 }
      )
      return addCorsHeaders(response, origin)
    }

    const response = NextResponse.json({ messages: messages || [] })
    return addCorsHeaders(response, origin)
  } catch (error) {
    console.error("[Favorites API] Error:", error)
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
