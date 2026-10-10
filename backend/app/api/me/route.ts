import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { creditStateFromProfile, getLimits, usagePayload } from "@/lib/usage"
import { isAdminEmail } from "@/lib/admin"

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
    const planLimits = getLimits(profile.plan)
    const limits = {
      maxMessages: planLimits.maxMessages,
      maxScreenshots: planLimits.maxScreenshots,
      maxFavorites: planLimits.maxFavoritesInContext
    }

    // Credits for today (null until 20261016_credits.sql has run)
    const credits = creditStateFromProfile(profile, planLimits)
    const today = new Date().toISOString().slice(0, 10)
    const sameDay = profile.usage_reset_date === today
    const legacyUsage = usagePayload(credits, { messages: sameDay ? profile.message_count || 0 : 0, screenshots: sameDay ? profile.screenshot_count || 0 : 0 }, planLimits)

    // Count actual favorited messages
    const { count: favoritesCount } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_favorited', true)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        onboarded: profile.onboarded,
        trading_profile: profile.trading_profile ?? null,
        trading_limits: profile.trading_limits ?? null,
        plan: profile.plan,
        is_admin: profile.plan === "admin" && isAdminEmail(user.email),
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
        // Old message/screenshot fields stay for extension builds before 1.1, expressed in today's credits
        messages: {
          used: legacyUsage.messages,
          limit: legacyUsage.limits.maxMessages
        },
        screenshots: {
          used: legacyUsage.screenshots,
          limit: legacyUsage.limits.maxScreenshots
        },
        credits: credits ?? undefined,
        canBuyMore: !!process.env.STRIPE_PRICE_ID_TOPUP,
        favorites: {
          used: favoritesCount || 0,
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

const hhmm = z.string().regex(/^\d{2}:\d{2}$/)
const profilePatchSchema = z.object({
  onboarded: z.boolean().optional(),
  first_name: z.string().max(80).optional(),
  trading_profile: z.object({
    markets: z.array(z.enum(["futures", "stocks", "options", "forex", "crypto"])).max(5),
    platforms: z.array(z.enum(["tradingview", "tradovate", "topstepx", "ninjatrader", "other"])).max(5),
    prop_firm: z.boolean(),
    experience: z.enum(["new", "1-3", "3+"]).optional()
  }).optional(),
  trading_limits: z.object({
    max_trades_per_day: z.number().int().min(1).max(100).nullable(),
    max_daily_loss: z.number().positive().max(1_000_000).nullable(),
    stop_after_losses: z.number().int().min(1).max(20).nullable(),
    session_start: hhmm.nullable(),
    session_end: hhmm.nullable(),
    timezone: z.string().max(60).nullable()
  }).optional()
})

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

    const parsed = profilePatchSchema.safeParse(await request.json())
    if (!parsed.success) {
      const response = NextResponse.json({ error: "Invalid profile update" }, { status: 400 })
      return addCorsHeaders(response, origin)
    }
    // Only the fields that were sent
    const updates = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined))
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true }, { headers: getCorsHeaders(origin) })
    }

    // Update profile
    let { error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)

    // Until 20261011_onboarding.sql has run, the trading_* columns don't exist; don't block onboarding on them
    if (updateError && /trading_(profile|limits)/.test(updateError.message ?? "")) {
      console.warn("[API /me] trading_* columns missing; run 20261011_onboarding.sql")
      const { trading_profile, trading_limits, ...rest } = updates as Record<string, unknown>
      updateError = Object.keys(rest).length
        ? (await supabase.from("profiles").update(rest).eq("id", user.id)).error
        : null
    }

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
