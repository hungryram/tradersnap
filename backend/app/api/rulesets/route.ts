import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const createRulesetSchema = z.object({
  name: z.string().min(1).max(100),
  rules_text: z.string().min(10),
  is_primary: z.boolean().optional()
})

const updateRulesetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rules_text: z.string().min(10).optional(),
  is_primary: z.boolean().optional()
})

// GET /api/rulesets - List all rulesets for user
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const { data: rulesets, error } = await supabase
      .from("rulesets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) throw error

    return NextResponse.json({ rulesets: rulesets || [] })

  } catch (error) {
    console.error("GET /api/rulesets error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST /api/rulesets - Create new ruleset
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Get user's plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single()

    // Check ruleset limit
    const { count } = await supabase
      .from("rulesets")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", user.id)

    const limit = profile?.plan === "free" ? 3 : 20
    if (count !== null && count >= limit) {
      return NextResponse.json(
        { error: `Ruleset limit reached (${limit} max). Upgrade your plan to create more.` },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validated = createRulesetSchema.parse(body)

    // If this is marked as primary, unset any existing primary
    if (validated.is_primary) {
      await supabase
        .from("rulesets")
        .update({ is_primary: false })
        .eq("user_id", user.id)
    }

    const { data: ruleset, error } = await supabase
      .from("rulesets")
      .insert({
        user_id: user.id,
        name: validated.name,
        rules_text: validated.rules_text,
        is_primary: validated.is_primary ?? true // First ruleset is primary by default
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ ruleset }, { status: 201 })

  } catch (error) {
    console.error("POST /api/rulesets error:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
