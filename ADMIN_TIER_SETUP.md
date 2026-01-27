# Admin Tier Setup Guide

## Overview
The admin tier is a special internal tier that provides buy/sell signals based on high win-rate strategies. This tier is restricted to authorized users only.

## Features

### Unlimited Usage
- **Messages**: 999,999 per day (effectively unlimited)
- **Screenshots**: 999,999 per day (effectively unlimited)
- **Favorites**: 100 messages (vs 20 for Pro, 3 for Free)
- **Rulesets**: 999 rulesets with 10,000 character limit each
- **Model**: GPT-5.1 (best available)
- **Tokens**: 4,000 max tokens (vs 3,000 for Pro, 2,000 for Free)
- **Image Detail**: High resolution chart analysis
- **Conversation History**: 50 messages (vs 20 for Pro, 10 for Free)

### Buy/Sell Signal Capabilities
Unlike the coaching mode for Free/Pro users, admin tier provides:
- ✅ Direct buy/sell signals with specific entry points
- ✅ Stop loss and take profit levels
- ✅ Position sizing recommendations
- ✅ Risk-reward analysis with exact numbers
- ✅ Direct trade validation and authorization

### Signal Strategy
The AI uses a multi-confluence approach:

1. **Trend Confirmation**
   - Higher timeframe alignment (4H/Daily)
   - Moving average structure (20/50/200 EMA)
   - Clear market structure (HH/HL or LH/LL)

2. **Supply & Demand Zones**
   - Unfilled zones on higher timeframes
   - Fresh zones with price approaching
   - Imbalance/inefficiency detection

3. **Liquidity & Order Flow**
   - Stop hunts before reversals
   - Volume spikes at key levels
   - Rejection wicks showing institutional interest

4. **Risk-Reward Criteria**
   - Minimum 1:2 risk-reward ratio
   - Stops beyond structure (not arbitrary)
   - Targets at next major levels

5. **Confluence Requirements**
   - Minimum 3 factors must align
   - Higher confluence = higher confidence
   - Low confluence = wait for better setup

## Setup Instructions

### Step 1: Run Database Migration
Execute the admin tier migration to add necessary database columns:

```bash
# Connect to your Supabase database and run:
psql -h your-db-host -U postgres -d postgres -f backend/add-admin-tier.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor in Supabase Dashboard
2. Copy contents of `backend/add-admin-tier.sql`
3. Execute the migration

### Step 2: Set Your Email as Admin
Update the `backend/set-admin-user.sql` file with your email:

```sql
-- Replace 'your-email@example.com' with your actual email
UPDATE profiles 
SET plan = 'admin', 
    is_admin = true,
    subscription_status = 'active'
WHERE email = 'your@email.com';
```

Then execute it:
```bash
psql -h your-db-host -U postgres -d postgres -f backend/set-admin-user.sql
```

### Step 3: Verify Admin Access
Run the verification query:
```sql
SELECT id, email, plan, is_admin, subscription_status
FROM profiles
WHERE email = 'your@email.com';
```

You should see:
- `plan`: 'admin'
- `is_admin`: true
- `subscription_status`: 'active'

### Step 4: Deploy Changes
Redeploy your backend application with the updated code:
```bash
cd backend
npm run build  # or your build command
# Deploy to your hosting platform (Vercel, etc.)
```

## Usage

Once set up, when you log in with your admin email:

1. **Chat Interface**: The AI will operate in admin mode automatically
2. **Signal Format**: You'll receive structured signals like:
   ```
   🟢 BUY SIGNAL
   ━━━━━━━━━━━━━━━━━━━━
   ASSET: ES (S&P 500 Futures)
   TIMEFRAME: 15 Min
   CONFIDENCE: High
   
   ENTRY: 5,850
   STOP LOSS: 5,835
   TAKE PROFIT 1: 5,880 (1:2)
   TAKE PROFIT 2: 5,910 (1:4)
   
   POSITION SIZE: 2% of account
   ━━━━━━━━━━━━━━━━━━━━
   
   REASONING:
   - Daily trend aligned upward
   - Price at unfilled demand zone
   - Liquidity sweep below 5,840
   - Volume spike + bullish rejection
   
   WIN RATE ESTIMATE: 68%
   ━━━━━━━━━━━━━━━━━━━━
   ```

3. **Chart Analysis**: Upload charts and ask for signal analysis
4. **Direct Questions**: Ask specific entry/exit questions and get direct answers

## Security Notes

- ⚠️ **NEVER share admin credentials**
- ⚠️ Only assign admin status to trusted users
- ⚠️ Admin tier bypasses safety mechanisms that prevent signal-giving
- ⚠️ This is for internal use only - do not expose to regular users

## Troubleshooting

### Admin Mode Not Activating
1. Check database: `SELECT plan FROM profiles WHERE email = 'your@email.com'`
2. Ensure it returns 'admin' (not 'Admin' or 'ADMIN' - lowercase)
3. Clear browser cache and cookies
4. Log out and log back in

### Still Getting Coaching Responses
1. Verify backend deployment completed successfully
2. Check server logs for any errors in `buildAdminPrompt`
3. Ensure `plan === 'admin'` check is working (check console logs)

### Usage Limits Still Showing
1. Clear cache in dashboard
2. Check that `/api/me` route was updated with admin limits
3. Verify by calling the API directly

## Files Modified

- `backend/app/api/chat/route.ts` - Added admin prompt and tier logic
- `backend/app/api/me/route.ts` - Updated usage limits
- `backend/app/api/rulesets/route.ts` - Updated ruleset limits
- `backend/app/api/rulesets/[id]/route.ts` - Updated ruleset limits
- `backend/add-admin-tier.sql` - Database migration
- `backend/set-admin-user.sql` - Admin user setup script

## Removing Admin Access

To remove admin access from a user:

```sql
UPDATE profiles 
SET plan = 'free',
    is_admin = false
WHERE email = 'user@email.com';
```

## Support

If you encounter issues:
1. Check server logs for errors
2. Verify database migrations ran successfully
3. Ensure all code changes were deployed
4. Test with a fresh browser session
