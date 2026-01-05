import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CORS headers helper
function getCorsHeaders(origin: string | null) {
  const allowedOrigins = [
    'http://localhost:3000',
    'chrome-extension://',
    'https://www.tradingview.com',
    'https://tradingview.com'
  ]
  
  const isAllowed = origin && (
    allowedOrigins.some(allowed => origin.startsWith(allowed)) ||
    origin.includes('chrome-extension://')
  )
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true'
  }
}

function addCorsHeaders(response: NextResponse, origin: string | null) {
  const headers = getCorsHeaders(origin)
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

// Handle OPTIONS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(origin)
  })
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
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

    // Fetch user profile
    let { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    // If profile doesn't exist, create it (new user)
    if (!profile) {
      console.log('[API /me] Profile not found, creating new profile for user:', user.id)
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          plan: "free",
          onboarded: false
        })
        .select()
        .single()

      if (createError) {
        console.error('[API /me] Failed to create profile:', createError)
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
      }

      profile = newProfile
    }

    // Fetch primary ruleset
    const { data: ruleset } = await supabase
      .from("rulesets")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .single()

    // Get current usage
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    
    const { data: usage } = await supabase
      .from("usage")
      .select("*")
      .eq("user_id", user.id)
      .eq("period_start", periodStart)
      .single()

    const limit = profile.plan === "free" ? 10 : 300

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        onboarded: profile.onboarded,
        plan: profile.plan,
        subscription_status: profile.subscription_status,
        created_at: profile.created_at
      },
      ruleset: ruleset ? {
        id: ruleset.id,
        name: ruleset.name,
        rules_text: ruleset.rules_text,
        updated_at: ruleset.updated_at
      } : null,
      usage: {
        used: usage?.used_count || 0,
        limit: limit,
        period_start: periodStart
      }
    }, {
      headers: getCorsHeaders(origin)
    })

  } catch (error) {
    console.error("API /me error:", error)
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
