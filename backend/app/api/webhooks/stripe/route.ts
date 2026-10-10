import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { TOPUP_UNITS } from "@/lib/usage"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover"
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Map a Stripe price to a plan using server-side config only.
// Returns null for unknown prices so we never grant a plan we didn't sell.
function planForPrice(price: Stripe.Price): string | null {
  const proPriceIds = [process.env.STRIPE_PRICE_ID_PRO, process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO].filter(Boolean)
  if (proPriceIds.includes(price.id) || price.lookup_key === "pro") return "pro"
  return null
}

// Plan changes from Stripe never touch admin accounts (admin is set manually in SQL)
const NOT_ADMIN = "plan.is.null,plan.neq.admin"

async function syncSubscription(subscription: Stripe.Subscription) {
  const updates: Record<string, string> = {
    subscription_status: subscription.status
  }

  // Keep pro plan active even if cancel_at_period_end is true
  // Only downgrade when subscription.deleted fires at period end
  if (subscription.status === "active" || subscription.status === "trialing") {
    const price = subscription.items.data[0]?.price
    const plan = price ? planForPrice(price) : null
    if (plan) {
      updates.plan = plan
    } else {
      console.warn("[Stripe webhook] Unknown price on subscription:", subscription.id, price?.id)
    }
  }

  await supabase
    .from("profiles")
    .update(updates)
    .eq("stripe_customer_id", subscription.customer as string)
    .or(NOT_ADMIN)
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Handle subscription events
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncSubscription(event.data.object as Stripe.Subscription)
      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription

      // Only now (at period end) do we downgrade to free
      await supabase
        .from("profiles")
        .update({
          subscription_status: "canceled",
          plan: "free"
        })
        .eq("stripe_customer_id", subscription.customer as string)
        .or(NOT_ADMIN)

      break
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session

      // Top-up: add the bought units once per checkout session (retries are ignored)
      if (session.mode === "payment" && session.metadata?.kind === "topup" && session.metadata.supabase_user_id) {
        if (session.payment_status !== "paid") break
        const units = Number(session.metadata.units) || TOPUP_UNITS
        const { error } = await supabase.rpc("add_bonus_credits", {
          p_user_id: session.metadata.supabase_user_id,
          p_units: units,
          p_session_id: session.id,
          p_amount_cents: session.amount_total ?? null
        })
        if (error) {
          console.error("[Stripe webhook] add_bonus_credits failed:", error)
          // Non-2xx makes Stripe retry later
          return NextResponse.json({ error: "Could not add credits" }, { status: 500 })
        }
        break
      }

      if (session.metadata?.supabase_user_id && session.customer) {
        // Link the customer first so the subscription sync below can find the profile
        await supabase
          .from("profiles")
          .update({ stripe_customer_id: session.customer as string })
          .eq("id", session.metadata.supabase_user_id)

        // Plan comes from the subscription's actual price, never from session metadata
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
          await syncSubscription(subscription)
        }
      }

      break
    }
  }

  return NextResponse.json({ received: true })
}
