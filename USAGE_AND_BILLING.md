# Usage Tracking & Overage Billing

## Current Usage Implementation

### What Counts Against Usage?

**✅ Chart Analyses** (Limited per plan):
- Every request to `/api/analyze` endpoint
- Triggered when user clicks "Analyze Chart" in extension
- Includes full AI analysis with vision + rule checking

**✅ Chat Messages** (Currently UNLIMITED):
- Requests to `/api/chat` endpoint
- Follow-up questions about charts
- Trading psychology coaching
- **NO usage tracking implemented yet**

### Usage Limits by Plan
- **Free**: 10 chart analyses/month, unlimited chat
- **Pro**: 300 chart analyses/month, unlimited chat
- **Unlimited**: No limits on anything

---

## How Usage is Tracked

**Per Analysis Request** (`/api/analyze` endpoint):
```typescript
// 1. Check current usage for the month
const { data: usage } = await supabase
  .from("usage")
  .select("*")
  .eq("user_id", user.id)
  .eq("period_start", periodStart) // First day of current month
  .single()

// 2. Get plan limit
const limit = profile.plan === "free" ? 10 : 300

// 3. Block if over limit
if (usage && usage.used_count >= limit) {
  return NextResponse.json(
    { error: "Usage quota exceeded" },
    { status: 429 }
  )
}

// 4. Increment usage atomically
await supabase.rpc("increment_usage", {
  p_user_id: user.id,
  p_period_start: periodStart,
  p_limit: limit
})
```

**Database Function** (`supabase-schema.sql`):
```sql
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_period_start DATE,
  p_limit INTEGER
) RETURNS VOID AS $$
BEGIN
  INSERT INTO usage (user_id, period_start, used_count, limit_count)
  VALUES (p_user_id, p_period_start, 1, p_limit)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET used_count = usage.used_count + 1;
END;
$$ LANGUAGE plpgsql;
```

### Current Behavior
- ✅ **Hard limit**: Users cannot exceed their monthly quota
- ✅ **Monthly reset**: Usage resets on the 1st of each month
- ✅ **Real-time tracking**: Each chart analysis increments the counter
- ❌ **No overage allowed**: Requests are blocked when limit is reached

---

## Overage Billing Options

Stripe supports 3 main approaches for usage-based billing:

### Option 1: Metered Billing (Recommended for Overages)

**How it works:**
- Charge users for actual usage beyond their plan limit
- Report usage to Stripe throughout the month
- Stripe automatically invoices at end of billing period

**Example pricing:**
- Free: 10 analyses/month (hard limit)
- Pro: 300 analyses/month included, then $0.10 per additional analysis
- Unlimited: True unlimited (no extra charges)

**Implementation:**
```typescript
// After successful analysis
if (usage.used_count > limit) {
  // Report overage to Stripe
  await stripe.subscriptionItems.createUsageRecord(
    'si_...', // Subscription item ID for metered component
    {
      quantity: 1,
      timestamp: Math.floor(Date.now() / 1000),
      action: 'increment'
    }
  )
}
```

**Stripe Product Setup:**
1. Create Pro subscription with 2 components:
   - Base fee: $19/month (includes 300 analyses)
   - Metered component: $0.10 per analysis over 300
2. Stripe automatically invoices overages at cycle end

**Pros:**
- ✅ Automatically handles billing
- ✅ Users see exact usage on invoice
- ✅ No manual intervention needed

**Cons:**
- ❌ Users might not notice overage until billed
- ❌ Potential surprise charges

---

### Option 2: Soft Limits with Warnings

**How it works:**
- Allow some overage (e.g., 10% buffer)
- Show warnings when approaching/exceeding limit
- Require upgrade before hard cutoff

**Implementation:**
```typescript
const limit = profile.plan === "free" ? 10 : 300
const softLimit = limit
const hardLimit = Math.floor(limit * 1.1) // 10% buffer

if (usage.used_count >= hardLimit) {
  return NextResponse.json(
    { 
      error: "Hard limit reached. Please upgrade your plan or wait until next month.",
      usageWarning: true
    },
    { status: 429 }
  )
}

if (usage.used_count >= softLimit) {
  // Allow request but include warning in response
  return NextResponse.json({
    ...analysisResult,
    warning: `You've used ${usage.used_count}/${limit} analyses. Upgrade to continue after ${hardLimit}.`
  })
}
```

**Pros:**
- ✅ No surprise charges
- ✅ Encourages upgrades at natural moment
- ✅ Small grace period for good UX

**Cons:**
- ❌ No automatic revenue from overages
- ❌ Requires upgrade prompts in UI

---

### Option 3: Pay-As-You-Go Top-Ups

**How it works:**
- Hard limit like current implementation
- Offer one-time "analysis packs" for purchase
- Add credits to account immediately

**Example:**
- Free: 10 analyses/month (hard limit)
- Pro: 300 analyses/month (hard limit)
- **Top-up**: Buy 50 extra analyses for $5 (one-time charge)

**Implementation:**
```typescript
// Add credits field to profiles table
ALTER TABLE profiles ADD COLUMN bonus_credits INTEGER DEFAULT 0;

// Check usage with bonus credits
const effectiveLimit = limit + profile.bonus_credits

if (usage.used_count >= effectiveLimit) {
  return NextResponse.json({
    error: "Limit reached",
    canBuyMore: true,
    topUpOptions: [
      { analyses: 50, price: 500 }, // $5.00 in cents
      { analyses: 100, price: 900 } // $9.00 in cents
    ]
  }, { status: 429 })
}

// After top-up purchase (via Stripe one-time payment)
await supabase
  .from("profiles")
  .update({ bonus_credits: profile.bonus_credits + 50 })
  .eq("id", user.id)
```

**Stripe Setup:**
- Create one-time payment links for top-up packs
- Use webhook to credit user's account on successful payment

**Pros:**
- ✅ User controls spending
- ✅ Immediate access to more analyses
- ✅ Can be offered alongside subscriptions

**Cons:**
- ❌ Requires separate checkout flow
- ❌ Credits management adds complexity

---

## Recommended Approach

**For Trading Buddy, I recommend Option 2 (Soft Limits) because:**

1. **Predictable pricing** - Users know exactly what they pay
2. **Natural upgrade prompts** - Hit limit → see value → upgrade
3. **No surprise bills** - Users never charged unexpectedly
4. **Simple implementation** - No metered billing complexity

**Implementation Plan:**
```typescript
// Updated limits with grace period
const limits = {
  free: { soft: 10, hard: 12, grace: "2 extra analyses" },
  pro: { soft: 300, hard: 330, grace: "30 extra analyses" }
}

// Show warning at 90% of soft limit
if (usage.used_count >= softLimit * 0.9) {
  showWarning: `You've used ${usage.used_count}/${softLimit} analyses this month.`
}

// Block at hard limit with upgrade prompt
if (usage.used_count >= hardLimit) {
  return {
    error: "Monthly limit reached",
    upgrade: {
      message: "Upgrade to Pro for 300 analyses/month",
      ctaUrl: "/dashboard/account",
      ctaText: "Upgrade Now"
    }
  }
}
```

---

## Alternative: Metered Billing for Pro Users

If you want to **monetize overages for Pro users only**:

**Hybrid approach:**
- Free: 10 analyses/month (hard limit, must upgrade)
- Pro: 300 analyses/month, then $0.10/each additional
- Unlimited: True unlimited

This gives pro users flexibility without cutting them off, while encouraging free users to upgrade.

Let me know which approach you prefer and I can implement it!

---

## Chat Usage: Should It Be Limited?

### Current State
Chat messages to `/api/chat` are **completely unlimited** - no tracking or enforcement exists.

### Arguments FOR Limiting Chat

**Pros:**
- ✅ Prevents abuse (endless automated conversations)
- ✅ OpenAI charges per token - unlimited chat = unbounded costs
- ✅ Encourages upgrades if users love the coaching feature
- ✅ Fairer resource distribution across users

**Cons:**
- ❌ Chat is the engagement hook - limiting it might reduce retention
- ❌ Harder to measure value (one chart analysis >> multiple chat messages)
- ❌ Users expect chat to be "free" in most apps

### Arguments AGAINST Limiting Chat

**Pros:**
- ✅ Higher engagement = more likely to upgrade for chart analyses
- ✅ Simpler mental model: "Analyses are limited, chat is free"
- ✅ Chat builds habit/stickiness before hitting paywall
- ✅ Most coaching apps don't limit text conversations

**Cons:**
- ❌ Risk of OpenAI cost explosion if abused
- ❌ No natural upgrade trigger for chat-only users

### Recommended Approach: Soft Chat Limits

**Free Plan:**
- 10 chart analyses/month (hard limit)
- 50 chat messages/month (soft limit with grace period)
- Shows warning at 40 messages: "10 more free messages this month"

**Pro Plan:**
- 300 chart analyses/month
- Unlimited chat

**Unlimited Plan:**
- Everything unlimited

**Why this works:**
- Prevents abuse on free tier
- Protects against OpenAI cost spikes
- Pro plan becomes more attractive ("unlimited coaching")
- Most users won't hit 50 chat messages anyway

### Alternative: Ignore Chat Usage Entirely

If OpenAI costs are manageable (~$0.002 per message), you could:
- Keep chat completely unlimited for all plans
- Use it as a lead magnet / engagement tool
- Only monetize chart analyses (the "premium" feature)
- Monitor costs and add limits only if abuse occurs

**This is the simplest approach and I'd recommend starting here.**

---

## Implementation Status

### ✅ Completed
- Chart analysis usage tracking
- Monthly usage limits (10 free, 300 pro)
- Hard limit enforcement
- Usage display in dashboard

### 🔄 In Progress
- UsageMeter component for extension chat widget
- Visual progress bars in popover
- Real-time usage display

### ⏳ Not Yet Implemented
- Chat message usage tracking
- Soft limits with grace periods
- Warning notifications
- Metered billing for overages

Let me know which direction you want to go with chat usage!
