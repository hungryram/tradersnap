import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  return addCorsHeaders(new NextResponse(null, { status: 200 }), request.headers.get("origin"))
}

const ratingSchema = z.object({
  message_id: z.string().uuid(),
  rating: z.union([z.literal(1), z.literal(-1)])
})

// 👍/👎 on an analysis verdict. The verdict is copied from the user's own
// message so it can be reviewed later even if they clear their chat.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin)
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7))
  if (authError || !user) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid token" }, { status: 401 }), origin)
  }

  const parsed = ratingSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid rating" }, { status: 400 }), origin)
  }

  const { data: message } = await supabase
    .from("chat_messages")
    .select("content")
    .eq("id", parsed.data.message_id)
    .eq("user_id", user.id)
    .eq("role", "assistant")
    .single()
  if (!message) {
    return addCorsHeaders(NextResponse.json({ error: "Message not found" }, { status: 404 }), origin)
  }

  let snapshot: Record<string, unknown> = { text: String(message.content).slice(0, 2000) }
  try {
    const analysis = JSON.parse(message.content)
    snapshot = {
      headline: analysis.headline ?? null,
      setup_status: analysis.setup_status ?? null,
      headline_reason: analysis.headline_reason ?? null,
      summary: analysis.summary ?? null
    }
  } catch {
    // A plain chat reply rather than an analysis card
  }

  const { error } = await supabase.from("analysis_ratings").upsert(
    { user_id: user.id, message_id: parsed.data.message_id, rating: parsed.data.rating, snapshot },
    { onConflict: "user_id,message_id" }
  )
  if (error) {
    console.error("[Ratings] Upsert error:", error)
    return addCorsHeaders(NextResponse.json({ error: "Failed to save rating" }, { status: 500 }), origin)
  }
  return addCorsHeaders(NextResponse.json({ success: true }), origin)
}
