import { NextRequest, NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

// POST /api/chat/notices { items } — saves Pip's check-ins and "position opened" notices with the chat, so they
// show on every device and Pip sees them in the conversation. The same item from two tabs is saved once (client_key).
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null) {
  const allowed = isAllowedOrigin(origin)
  if (allowed) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  return addCorsHeaders(new NextResponse(null, { status: 200 }), request.headers.get("origin"))
}

const itemSchema = z.object({
  client_key: z.string().min(1).max(200),
  kind: z.enum(["checkin", "event"]),
  content: z.string().min(1).max(1000),
  created_at: z.string().datetime(),
  meta: z.record(z.string(), z.unknown()).optional()
})

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const reply = (body: object, status = 200) => addCorsHeaders(NextResponse.json(body, { status }), origin)

  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401)
  const { data: { user } } = await supabase.auth.getUser(authHeader.substring(7))
  if (!user) return reply({ error: "Unauthorized" }, 401)

  const parsed = z.object({ items: z.array(itemSchema).min(1).max(20) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return reply({ error: "Invalid request" }, 400)

  // Times come from the browser; keep them within a day of now so nothing lands far in the past or future
  const now = Date.now()
  const rows = parsed.data.items
    .filter(item => Math.abs(Date.parse(item.created_at) - now) < 24 * 60 * 60 * 1000)
    .map(item => ({ user_id: user.id, role: "assistant", kind: item.kind, content: item.content, meta: item.meta ?? null, client_key: item.client_key, created_at: item.created_at }))
  if (rows.length === 0) return reply({ saved: 0 })

  // Check-ins and "position opened" rows: a busy day is a few hundred at most; more is a script filling the table
  const { count: today } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("kind", "is", null)
    .gte("created_at", new Date(now - 24 * 60 * 60 * 1000).toISOString())
  if ((today ?? 0) >= 1000) return reply({ saved: 0, dropped: true })

  const { error } = await supabase.from("chat_messages").upsert(rows, { onConflict: "user_id,client_key", ignoreDuplicates: true })
  if (error) {
    // Before 20261028_checkins_in_chat.sql the columns don't exist; the extension still shows the notices
    console.error("[Chat notices] Save failed:", error.message)
    return reply({ error: "Couldn't save" }, 500)
  }
  return reply({ saved: rows.length })
}
