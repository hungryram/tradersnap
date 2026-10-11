import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Max-Age', '86400')
  return response
}

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  const response = new NextResponse(null, { status: 204 })
  return addCorsHeaders(response, origin)
}

// GET /api/rulesets/active - Get user's primary ruleset
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
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

    // Get primary ruleset
    const { data: ruleset, error } = await supabase
      .from("rulesets")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .single()

    if (error || !ruleset) {
      const response = NextResponse.json({ error: "No active ruleset found" }, { status: 404 })
      return addCorsHeaders(response, origin)
    }

    const response = NextResponse.json({ ruleset })
    return addCorsHeaders(response, origin)

  } catch (error) {
    console.error("GET /api/rulesets/active error:", error)
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}

// PUT /api/rulesets/active - Replace the primary ruleset's rules (e.g. "Save as my
// rules" in the chat). Creates the primary ruleset if there isn't one yet.
export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')
  const reply = (body: object, status = 200) => addCorsHeaders(NextResponse.json(body, { status }), origin)

  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401)
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7))
  if (authError || !user) return reply({ error: "Invalid token" }, 401)

  const body = await request.json().catch(() => null)
  const rulesText = typeof body?.rules_text === "string" ? body.rules_text.trim() : ""
  if (rulesText.length < 10) return reply({ error: "Those rules look empty." }, 400)

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single()
  const plan = profile?.plan ?? "free"
  const maxChars = plan === "admin" ? 10000 : plan === "pro" ? 5000 : 1000
  if (rulesText.length > maxChars) {
    return reply({ error: `These rules are ${rulesText.length} characters and your plan holds ${maxChars}. Ask Pip to shorten them.` }, 400)
  }

  const { data: primary } = await supabase.from("rulesets").select("id").eq("user_id", user.id).eq("is_primary", true).maybeSingle()
  const { error } = primary
    ? await supabase.from("rulesets").update({ rules_text: rulesText, updated_at: new Date().toISOString() }).eq("id", primary.id)
    : await supabase.from("rulesets").insert({ user_id: user.id, name: "My Trading Rules", rules_text: rulesText, is_primary: true })
  if (error) {
    console.error("PUT /api/rulesets/active error:", error)
    return reply({ error: "Couldn't save your rules." }, 500)
  }
  return reply({ success: true })
}
