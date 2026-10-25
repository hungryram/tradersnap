import { NextRequest, NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/cors"
import { features, loadPlan } from "@/lib/plans"
import { createClient } from "@supabase/supabase-js"
import { activeStrategyLimit, loadActiveStrategies } from "@/lib/strategies"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (isAllowedOrigin(origin)) {
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

    // The strategies the trader has switched on, for the picker in the chat box
    const active = await loadActiveStrategies(supabase, user.id, ruleset.id)
    const response = NextResponse.json({ ruleset, strategies: active.map(s => ({ id: s.id, name: s.name })) })
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

// PUT /api/rulesets/active { rules_text, name? } - "Save as my rules" in the chat.
// Updates the strategy with that name, or the main one without a name; creates the
// strategy if it doesn't exist yet. Returns which strategy was saved.
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

  const { plan } = await loadPlan(supabase, user.id)
  const maxChars = features(plan).rulesChars
  if (rulesText.length > maxChars) {
    return reply({ error: `These rules are ${rulesText.length} characters and your plan holds ${maxChars}. Ask Pip to shorten them.` }, 400)
  }

  // Which strategy: the one named in Pip's draft (matched by name), otherwise the main one
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : ""
  const { data: existing, error: listError } = await supabase
    .from("rulesets")
    .select("id, name, is_primary")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
  if (listError) {
    console.error("PUT /api/rulesets/active list error:", listError)
    return reply({ error: "Couldn't save your rules." }, 500)
  }
  const all = existing ?? []
  const target = name
    ? all.find(r => r.name.trim().toLowerCase() === name.toLowerCase())
    : all.find(r => r.is_primary) ?? all[0]

  // Pip checks it from now on, if the plan has room for another active strategy
  const { count: activeCount, error: activeError } = await supabase
    .from("rulesets").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true)
  const maxActive = activeStrategyLimit(plan)

  if (target) {
    const { error } = await supabase.from("rulesets").update({ rules_text: rulesText }).eq("id", target.id)
    if (error) {
      console.error("PUT /api/rulesets/active update error:", error)
      return reply({ error: "Couldn't save your rules." }, 500)
    }
    if (!activeError && (activeCount ?? 0) < maxActive) {
      await supabase.from("rulesets").update({ is_active: true }).eq("id", target.id)
    }
    return reply({ success: true, id: target.id, name: target.name, created: false })
  }

  // A new strategy (the trader's first one becomes the main one)
  const maxRulesets = features(plan).rulesets
  if (all.length >= maxRulesets) {
    return reply({ error: `You have ${all.length} strategies, the most your plan holds. Delete one on the Rules page, or ask Pip to update an existing one by name.` }, 403)
  }
  const row = { user_id: user.id, name: name || "My strategy", rules_text: rulesText, is_primary: all.length === 0 }
  const isActive = all.length === 0 || (!activeError && (activeCount ?? 0) < maxActive)
  let { data: created, error } = await supabase.from("rulesets").insert({ ...row, is_active: isActive }).select("id, name").single()
  if (error?.code === "PGRST204") ({ data: created, error } = await supabase.from("rulesets").insert(row).select("id, name").single()) // before 20261020_strategies.sql
  if (error || !created) {
    console.error("PUT /api/rulesets/active insert error:", error)
    return reply({ error: "Couldn't save your rules." }, 500)
  }
  return reply({ success: true, id: created.id, name: created.name, created: true, active: isActive })
}
