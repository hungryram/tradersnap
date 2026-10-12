import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { SITE_ORIGINS } from "@/lib/urls"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Only the marketing site's form posts here
function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin && (SITE_ORIGINS.includes(origin) || (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost")))) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  return addCorsHeaders(new NextResponse(null, { status: 200 }), request.headers.get("origin"))
}

const bodySchema = z.object({
  kind: z.enum(["bug", "idea", "other"]),
  message: z.string().trim().min(5).max(2000),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  source: z.string().max(40).optional(),
  version: z.string().max(20).optional(),
  // A hidden field real people leave empty
  website: z.string().max(200).optional()
})

// POST /api/feedback/submit — the feedback and bug-report form on tradewithpip.ai
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const reply = (body: object, status = 200) => addCorsHeaders(NextResponse.json(body, { status }), origin)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return reply({ error: "Please add a few words about what happened." }, 400)
  // Bots fill in every field: pretend it worked
  if (parsed.data.website) return reply({ success: true })

  // A flood of submissions is almost certainly a script
  const { count } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if ((count ?? 0) >= 200) return reply({ error: "We're getting a lot of messages right now. Please try again later." }, 429)

  const { error } = await supabase.from("feedback").insert({
    kind: parsed.data.kind,
    message: parsed.data.message,
    email: parsed.data.email || null,
    source: parsed.data.source ?? null,
    extension_version: parsed.data.version ?? null
  })
  if (error) {
    console.error("[Feedback form] Insert error:", error)
    return reply({ error: "Couldn't send that. Please try again, or email us." }, 500)
  }
  return reply({ success: true })
}
