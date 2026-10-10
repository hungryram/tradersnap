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
    .select("plan, stripe_customer_id")
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
    } catch (error) {
      console.error("[Account delete] Stripe cancel failed:", error)
      return NextResponse.json({ error: "Couldn't cancel your subscription, so nothing was deleted. Please try again or contact support." }, { status: 502 })
    }
  }

  // 2. Uninstall answers keep no link to a deleted user (the column would be nulled anyway)
  await supabase.from("uninstall_feedback").delete().eq("user_id", user.id)

  // 3. Deleting the auth user cascades to profiles and every table keyed to the user:
  //    rulesets, usage, analyses, usage_events, chat_messages, trades, analysis_ratings
  const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error("[Account delete] deleteUser failed:", deleteError)
    return NextResponse.json({ error: "Couldn't delete your account. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
