import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover"
})

// Deletes the signed-in user's account and everything linked to it, immediately.
// Order matters: stop billing first, so a failure never leaves a deleted user
// with a live subscription.
// Same-origin only (no CORS headers): only the website can call it.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7))
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  // The owner account runs the admin page; delete it from Supabase directly if ever needed
  if (profile?.plan === "admin") {
    return NextResponse.json({ error: "Admin accounts can't be deleted here." }, { status: 403 })
  }

  // 1. Cancel every subscription that could still charge them
  if (profile?.stripe_customer_id) {
    try {
      const subscriptions = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: "all", limit: 100 })
      for (const subscription of subscriptions.data) {
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
          await stripe.subscriptions.cancel(subscription.id)
        }
      }
    } catch (error: any) {
      // A customer Stripe can't find (deleted, or created in the other test/live mode)
      // has nothing to cancel, unless our records say they're paying right now
      const payingNow = profile.plan === "pro" && ["active", "trialing", "past_due"].includes(profile.subscription_status)
      if (error?.code === "resource_missing" && !payingNow) {
        console.warn("[Account delete] Stripe customer not found; no active plan, continuing")
      } else {
        console.error("[Account delete] Stripe cancel failed:", error)
        return NextResponse.json({ error: "Couldn't cancel your subscription, so nothing was deleted. Please try again or contact support." }, { status: 502 })
      }
    }
  }

  // 2. Keep an anonymous record for churn stats: no email, name or id, just how they used it
  await recordDeletion(user.id, profile, body)

  // 3. Uninstall answers keep no link to a deleted user (the column would be nulled anyway)
  await supabase.from("uninstall_feedback").delete().eq("user_id", user.id)

  // 4. Deleting the auth user cascades to profiles and every table keyed to the user:
  //    rulesets, usage, analyses, usage_events, chat_messages, trades, analysis_ratings
  const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error("[Account delete] deleteUser failed:", deleteError)
    return NextResponse.json({ error: "Couldn't delete your account. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

const REASONS = ["not_useful", "confusing", "too_expensive", "bugs", "privacy", "wrong_platform", "other"]

async function recordDeletion(userId: string, profile: any, body: any) {
  try {
    const [checks, events, trades] = await Promise.all([
      supabase.from("usage_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("event_type", "analysis_finished"),
      supabase.from("usage_events").select("created_at").eq("user_id", userId).limit(10000),
      supabase.from("trades").select("id", { count: "exact", head: true }).eq("user_id", userId)
    ])
    const activeDays = new Set((events.data ?? []).map((e: { created_at: string }) => e.created_at.slice(0, 10))).size
    const tradingProfile = profile?.trading_profile ?? null

    await supabase.from("deleted_accounts").insert({
      signed_up_month: profile?.created_at ? `${profile.created_at.slice(0, 7)}-01` : null,
      plan: profile?.plan ?? "free",
      checks: checks.count ?? 0,
      active_days: activeDays,
      trades: trades.count ?? 0,
      platforms: tradingProfile?.platforms ?? null,
      prop_firm: tradingProfile?.prop_firm ?? null,
      experience: tradingProfile?.experience ?? null,
      reason: REASONS.includes(body?.reason) ? body.reason : null,
      details: typeof body?.details === "string" && body.details.trim() ? body.details.trim().slice(0, 500) : null
    })
  } catch (error) {
    // Stats are nice to have; never block a deletion on them
    console.error("[Account delete] Couldn't record anonymous stats:", error)
  }
}
