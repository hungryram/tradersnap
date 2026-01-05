import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const updateRulesetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rules_text: z.string().min(10).optional(),
  is_primary: z.boolean().optional()
})

// GET /api/rulesets/[id] - Get single ruleset
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { data: ruleset, error } = await supabase
      .from("rulesets")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single()

    if (error || !ruleset) {
      return NextResponse.json({ error: "Ruleset not found" }, { status: 404 })
    }

    return NextResponse.json({ ruleset })

  } catch (error) {
    console.error("GET /api/rulesets/[id] error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// PATCH /api/rulesets/[id] - Update ruleset
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const body = await request.json()
    const validated = updateRulesetSchema.parse(body)

    // If setting as primary, unset any existing primary
    if (validated.is_primary) {
      await supabase
        .from("rulesets")
        .update({ is_primary: false })
        .eq("user_id", user.id)
        .neq("id", params.id)
    }

    const { data: ruleset, error } = await supabase
      .from("rulesets")
      .update(validated)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error || !ruleset) {
      return NextResponse.json({ error: "Ruleset not found" }, { status: 404 })
    }

    return NextResponse.json({ ruleset })

  } catch (error) {
    console.error("PATCH /api/rulesets/[id] error:", error)
    
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

// DELETE /api/rulesets/[id] - Delete ruleset
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { error } = await supabase
      .from("rulesets")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: "Ruleset not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error("DELETE /api/rulesets/[id] error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
