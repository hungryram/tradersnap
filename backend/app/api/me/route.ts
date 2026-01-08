import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CORS headers helper
function getCorsHeaders(origin: string | null) {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || 'https://admin.snapchartapp.com',
    'chrome-extension://',
    // Trading platforms
    'tradingview.com',
    'tradovate.com',
    'thinkorswim.com',
    'tdameritrade.com',
    'ninjatrader.com',
    'tradestation.com',
    'interactivebrokers.com',
    'etrade.com',
    'schwab.com',
    'fidelity.com',
    'robinhood.com',
    'webull.com',
    'tastytrade.com',
    'tastyworks.com',
    'metatrader4.com',
    'metatrader5.com',
    'ctrader.com',
    'tradier.com',
    'lightspeed.com',
    'speedtrader.com',
    'topstepx.com',
    'rithmic.com',
    // Crypto exchanges
    'binance.com',
    'coinbase.com',
    'kraken.com',
    'bybit.com'
  ]
  
  const isAllowed = origin && allowedOrigins.some(allowed => 
    origin.includes(allowed) || origin.startsWith('chrome-extension://')
  )
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : process.env.NEXT_PUBLIC_APP_URL || 'https://admin.snapchartapp.com',
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
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      const response = NextResponse.json({ error: "Invalid token" }, { status: 401 })
      return addCorsHeaders(response, origin)
    }

    // Fetch user profile
    let { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    // If profile doesn't exist, create it (new user)
    if (!profile) {
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
        const response = NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
        return addCorsHeaders(response, origin)
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

    // Get current usage from profile (new daily tracking system)
    const limits = {
      maxMessages: profile.plan === 'pro' ? 200 : 50,
      maxScreenshots: profile.plan === 'pro' ? 50 : 5,
      maxFavorites: profile.plan === 'pro' ? 20 : 3
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
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
        messages: {
          used: profile.message_count || 0,
          limit: limits.maxMessages
        },
        screenshots: {
          used: profile.screenshot_count || 0,
          limit: limits.maxScreenshots
        },
        favorites: {
          used: profile.favorite_limit || 0,
          limit: limits.maxFavorites
        },
        resetDate: profile.usage_reset_date
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

export async function PATCH(request: NextRequest) {
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

    const body = await request.json()
    const { onboarded } = body

    // Update profile
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ onboarded })
      .eq("id", user.id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true }, {
      headers: getCorsHeaders(origin)
    })

  } catch (error) {
    console.error("API /me PATCH error:", error)
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
    return addCorsHeaders(response, origin)
  }
}
