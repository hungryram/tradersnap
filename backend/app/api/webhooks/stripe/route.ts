import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia"
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
      const subscription = event.data.object as Stripe.Subscription
      
      await supabase
        .from("profiles")
        .update({
          subscription_status: subscription.status,
          plan: subscription.items.data[0].price.lookup_key || "pro"
        })
        .eq("stripe_customer_id", subscription.customer)
      
      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription
      
      await supabase
        .from("profiles")
        .update({
          subscription_status: "canceled",
          plan: "free"
        })
        .eq("stripe_customer_id", subscription.customer)
      
      break
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      
      // Update profile with plan from metadata
      if (session.metadata?.supabase_user_id && session.customer) {
        const updates: any = {
          stripe_customer_id: session.customer as string
        }
        
        // Set plan if provided in metadata
        if (session.metadata.plan) {
          updates.plan = session.metadata.plan
          updates.subscription_status = "active"
        }
        
        await supabase
          .from("profiles")
          .update(updates)
          .eq("id", session.metadata.supabase_user_id)
      }
      
      break
    }
  }

  return NextResponse.json({ received: true })
}
