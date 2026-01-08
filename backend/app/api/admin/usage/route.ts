import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Simple admin key check (set ADMIN_SECRET in your env)
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-in-production"

// GET /api/admin/usage - View token usage by user
export async function GET(request: NextRequest) {
  try {
    // Check admin authorization
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    
    if (token !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch all users sorted by token usage
    const { data: users, error } = await supabase
      .from("profiles")
      .select("email, first_name, last_name, plan, total_tokens_used, total_input_tokens, total_output_tokens, created_at")
      .order("total_tokens_used", { ascending: false })
      .limit(100)

    if (error) {
      console.error("Admin usage fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 })
    }

    const totalTokens = users.reduce((sum, u) => sum + (u.total_tokens_used || 0), 0)

    return NextResponse.json({
      users: users.map(u => ({
        email: u.email,
        name: u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : null,
        plan: u.plan,
        tokens: {
          total: u.total_tokens_used || 0,
          input: u.total_input_tokens || 0,
          output: u.total_output_tokens || 0
        },
        created_at: u.created_at
      })),
      summary: {
        total_users: users.length,
        total_tokens: totalTokens,
        note: "Check OpenAI dashboard for actual costs"
      }
    })

  } catch (error) {
    console.error("GET /api/admin/usage error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
