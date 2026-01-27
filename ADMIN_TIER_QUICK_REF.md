# Admin Tier Quick Reference

## 🎯 What Admin Tier Does

**Coaching Mode (Free/Pro)**: "What do YOU see here?" - Makes you think  
**Admin Mode**: "BUY at 5,850, STOP at 5,835" - Tells you what to do

## 📊 Signal Output Example

```
🟢 BUY SIGNAL
━━━━━━━━━━━━━━━━━━━━
ASSET: ES (S&P 500)
TIMEFRAME: 15 Min
CONFIDENCE: High

ENTRY: 5,850
STOP LOSS: 5,835
TAKE PROFIT 1: 5,880 (1:2)
TAKE PROFIT 2: 5,910 (1:4)

POSITION SIZE: 2% of account
━━━━━━━━━━━━━━━━━━━━

REASONING:
- Daily uptrend aligned
- Unfilled demand zone
- Liquidity sweep at 5,840
- Volume spike + rejection

WIN RATE ESTIMATE: 68%
━━━━━━━━━━━━━━━━━━━━
```

## 🔑 Key Differences

| Feature | Free | Pro | Admin |
|---------|------|-----|-------|
| **Messages/Day** | 15 | 200 | Unlimited |
| **Screenshots/Day** | 5 | 50 | Unlimited |
| **Model** | GPT-5-mini | GPT-5.1 | GPT-5.1 |
| **Max Tokens** | 2,000 | 3,000 | 4,000 |
| **Gives Signals** | ❌ | ❌ | ✅ |
| **Entry/Exit Prices** | ❌ | ❌ | ✅ |
| **Position Sizing** | ❌ | ❌ | ✅ |
| **Trade Validation** | ❌ | ❌ | ✅ |

## 🎓 How to Use Admin Mode

### 1. Upload Chart
Just like normal, but you'll get signals instead of questions

### 2. Ask Direct Questions
- "Should I buy here?"
- "Where's my stop loss?"
- "What's my target?"
- "Give me a signal on this setup"

### 3. Get Position Sizing
- "How much should I risk on this?"
- "What position size for 2% risk?"

### 4. Request Analysis
- "Analyze this for a buy signal"
- "Is this a high-probability short?"

## 📈 Signal Strategy (What the AI Looks For)

1. **Trend Confirmation** ← Must align with higher timeframes
2. **Supply/Demand Zones** ← Fresh, untested zones
3. **Liquidity Sweeps** ← Stop hunts before reversal
4. **Volume Confirmation** ← Institutional interest
5. **Risk:Reward** ← Minimum 1:2, prefer 1:3+

**Minimum 3 factors must align for a signal**

## ⚙️ Setup Steps

1. **Run Migration**
   ```bash
   # In Supabase SQL Editor:
   # Run: backend/add-admin-tier.sql
   ```

2. **Set Your Email**
   ```sql
   UPDATE profiles 
   SET plan = 'admin', is_admin = true
   WHERE email = 'YOUR_EMAIL_HERE';
   ```

3. **Verify**
   ```sql
   SELECT email, plan, is_admin FROM profiles 
   WHERE email = 'YOUR_EMAIL_HERE';
   ```

4. **Deploy Backend**
   ```bash
   cd backend && npm run build
   # Then deploy to your host
   ```

5. **Log Out & Back In**
   Clear cache, then log back in to activate

## ⚠️ Important Notes

- Admin tier is **for internal use only**
- Does NOT teach - it TELLS
- Bypasses all safety mechanisms
- Not suitable for learning traders
- Should never be sold/given to users
- You are responsible for all trades taken

## 🔍 Verification

After setup, send a message like: "Give me a buy signal on SPY"

**Free/Pro Response**: "What price action are you seeing that suggests a buy?"  
**Admin Response**: Actual buy signal with entry, stop, and targets

## 📞 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Still getting questions | Check plan in DB, should be 'admin' (lowercase) |
| Usage limits showing | Redeploy backend, clear cache |
| Signals too vague | Say "I need specific entry and stop" |
| No signals given | Check if admin prompt is loaded (check logs) |

---

**Remember**: With great signals comes great responsibility. Admin mode gives you the tools - you own the execution.
