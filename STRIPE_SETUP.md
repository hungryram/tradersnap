# Stripe Setup Guide

## 1. Add Environment Variables

Add these to your `.env` file in the `backend` folder:

```env
# Stripe Keys (from Stripe Dashboard)
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Stripe Price IDs (create these in Stripe Dashboard)
NEXT_PUBLIC_STRIPE_PRICE_ID_PRO=price_your_pro_price_id_here
NEXT_PUBLIC_STRIPE_PRICE_ID_UNLIMITED=price_your_unlimited_price_id_here
```

**Also add to Vercel Environment Variables** (for production):
- Go to your Vercel project → Settings → Environment Variables
- Add all the above variables (including the `NEXT_PUBLIC_` ones)

## 2. Create Products in Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/products)
2. Click **"+ Add Product"**

### Product 1: Pro Plan
- **Name**: Trading Buddy Pro
- **Description**: 20 rulesets, 300 analyses per month
- **Pricing**: 
  - Model: **Recurring**
  - Price: `$19/month` (or your preferred amount)
  - Billing period: Monthly
  - **Payment link**: Enable
- After creating, copy the **Price ID** (starts with `price_`)
- Paste it in `.env` as `NEXT_PUBLIC_STRIPE_PRICE_ID_PRO=price_...`

### Product 2: Unlimited Plan
- **Name**: Trading Buddy Unlimited
- **Description**: Unlimited rulesets, unlimited analyses
- **Pricing**: 
  - Model: **Recurring**
  - Price: `$49/month` (or your preferred amount)
  - Billing period: Monthly
  - **Payment link**: Enable
- After creating, copy the **Price ID** (starts with `price_`)
- Paste it in `.env` as `NEXT_PUBLIC_STRIPE_PRICE_ID_UNLIMITED=price_...`

## 3. Set Up Webhook

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click **"+ Add endpoint"**
3. Enter endpoint URL:
   - **Local testing**: Use [Stripe CLI](https://stripe.com/docs/stripe-cli) with `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   - **Production**: `https://admin.tradersnap.com/api/webhooks/stripe`
4. Select events to listen for:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Paste it in `.env` as `STRIPE_WEBHOOK_SECRET=whsec_...`

## 4. Test the Flow

### Local Testing:
```bash
# Terminal 1: Run your backend
cd backend
pnpm dev

# Terminal 2: Forward Stripe webhooks (get webhook secret from output)
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Test Steps:
1. Sign in to your app at `http://localhost:3000`
2. Go to Dashboard → Account
3. Click **"Upgrade to Pro"**
4. You'll be redirected to Stripe Checkout (test mode)
5. Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits
6. Complete checkout
7. Webhook fires → Profile updates to `plan: "pro"`
8. You're redirected back to Account page
9. Try creating more than 3 rulesets - should now allow up to 20!

## 5. Production Deployment

After testing locally:

1. **Add Vercel environment variables**:
   - Go to Vercel project settings
   - Add all `STRIPE_` and `NEXT_PUBLIC_STRIPE_` variables
   - Redeploy

2. **Update Stripe webhook**:
   - Create production webhook endpoint
   - URL: `https://admin.tradersnap.com/api/webhooks/stripe`
   - Copy production webhook secret to Vercel env vars

3. **Switch to live mode**:
   - In Stripe Dashboard, toggle from Test to Live mode
   - Create the same products in Live mode
   - Update Vercel env vars with live keys (`sk_live_...` and `price_...` from live mode)

## Troubleshooting

### Webhook not firing?
- Check Stripe CLI is running (`stripe listen`)
- Check webhook secret matches in `.env`
- Check endpoint URL is correct
- View webhook logs in Stripe Dashboard

### Plan not updating after checkout?
- Check webhook received `checkout.session.completed` event
- Check Supabase logs for any errors
- Verify `stripe_customer_id` was saved to profile
- Check session metadata includes `supabase_user_id` and `plan`

### Still showing "Upgrade" after subscribing?
- Hard refresh the page (Ctrl+Shift+R)
- Check profile in Supabase - should have `plan: "pro"` and `subscription_status: "active"`
- Check browser console for API errors

## Current Implementation

✅ **Backend**:
- `/api/checkout` - Creates Stripe Checkout session
- `/api/webhooks/stripe` - Handles subscription events
- `/api/billing/portal` - Opens customer portal for managing subscriptions
- `/api/rulesets` - Enforces plan limits (3 for free, 20 for pro)

✅ **Frontend**:
- Dashboard shows ruleset count (X/3 or X/20)
- Account page shows "Upgrade to Pro" button for free users
- Rules page shows upgrade banner when at limit
- All upgrade flows redirect to Stripe Checkout

✅ **Features**:
- Free plan: 3 rulesets, 10 analyses/month (enforced)
- Pro plan: 20 rulesets, 300 analyses/month
- Unlimited plan: No limits (coming soon)
