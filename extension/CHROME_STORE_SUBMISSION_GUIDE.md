# Chrome Web Store Submission Guide

## Step-by-Step Response to Rejection

### 1. Appeal the Rejection

In your Chrome Web Store Developer Dashboard:

1. Go to your rejected extension listing
2. Click "Appeal" or "Request Review"
3. **Copy and paste the content from `CHROME_STORE_APPEAL.md`** into the appeal form
4. Be polite but firm about your compliance

### 2. Update Your Extension Listing (Before Resubmitting)

Make these changes to your public-facing listing:

#### Extension Name
```
Snapchart - Trading Psychology AI Coach
```
*(More specific, less generic)*

#### Short Description (132 characters max)
```
AI trading psychology coach. Analyze charts against your custom rules. Build disciplined trading habits with real-time feedback.
```

#### Detailed Description
```
Snapchart is an AI-powered trading psychology coach designed to help traders build disciplined, rule-based trading habits.

🎯 WHAT IT DOES:
• Analyzes your trading chart setups using AI
• Provides real-time feedback based on YOUR custom trading rules
• Helps you stick to your trading plan and avoid emotional decisions
• Works on TradingView and major trading platforms

📊 HOW IT WORKS:
1. Open your trading chart (TradingView, TD Ameritrade, etc.)
2. Click the Snapchart widget that appears on your chart
3. Click "Analyze Chart" to get AI feedback
4. Receive personalized coaching based on your ruleset
5. Build better trading psychology over time

✨ KEY FEATURES:
• Custom Trading Rulesets - Define your own rules for entries, exits, and psychology
• Real-Time Chart Analysis - AI analyzes your chart setup on demand
• Trading Psychology Coaching - Get feedback to avoid emotional trading mistakes
• Chat Interface - Ask questions about your setup and get instant answers
• Works Across Platforms - Compatible with TradingView, Tradovate, TD Ameritrade, and more

🔒 PRIVACY & SECURITY:
• Your trading data stays private
• We only analyze chart images you explicitly request
• No automatic tracking or data collection
• No access to your brokerage accounts
• Industry-standard authentication

👥 WHO IT'S FOR:
• Day traders and swing traders
• Anyone struggling with trading discipline
• Traders who want to follow a rules-based approach
• Those looking to improve their trading psychology

📈 SUPPORTED PLATFORMS:
TradingView, Tradovate, TD Ameritrade, Interactive Brokers, NinjaTrader, TradeStation, Binance, Coinbase, Webull, Tastyworks, and more.

🆓 FREE TRIAL:
Try it free with limited analyses. Upgrade for unlimited access.

---

PRIVACY & PERMISSIONS:
This extension requires permissions to capture screenshots of your charts (core functionality) and inject a chat widget on trading websites. We do NOT:
• Access your trading accounts or execute trades
• Modify your browser settings (homepage, search, new tab)
• Track your browsing history
• Collect data from non-trading websites
• Send spam or notifications

Full permissions justification available in our documentation.
```

#### Category
```
Productivity
```

#### Screenshots
Make sure you have at least 3-5 screenshots showing:
1. The chat widget on a trading chart
2. An analysis in progress
3. AI feedback displayed
4. The extension popup
5. Custom rules dashboard (optional)

**Add captions to each screenshot** explaining what's happening:
- "AI-powered chat widget overlays on your trading charts"
- "Click 'Analyze Chart' for instant AI feedback"
- "Get coaching based on your custom trading rules"
- "Manage your extension and open your dashboard"

#### Privacy Policy
**CRITICAL:** You MUST have a privacy policy URL. Create one at your domain that covers:
- What data you collect (screenshots, chat messages)
- How you use it (AI analysis only)
- What you don't collect (trading account access, browsing history)
- User rights (data deletion, account closure)
- Contact information

Example URL: `https://admin.snapchartapp.com/privacy`

#### Support Email
Provide a working support email: `support@snapchartapp.com` (or similar)

---

## 3. Respond to Specific Policy Violations

### For "Spam & Placement" (Yellow Nickel)

**In the "Privacy practices" section**, add:

```
DATA COLLECTION & USE:
• Chart screenshots - Only when you click "Analyze Chart"
• Chat messages - Only messages you type
• Authentication tokens - Standard OAuth (Supabase)
• User preferences - Theme, position (stored locally)

DATA NOT COLLECTED:
• Browsing history
• Trading account credentials
• Cookies from other websites
• Personal information beyond email (for account)

NO SPAM OR ABUSE:
• Zero browser notifications sent
• No messages sent on your behalf
• All actions are user-initiated
• No ads, promotions, or unwanted content
```

### For "Circumvents Override API" (Blue Nickel/Potassium)

**In the "Permissions" justification field**, add:

```
HOST PERMISSIONS (<all_urls>):
Required by Chrome's captureVisibleTab() API for screenshot capture from content scripts. This is our core functionality - analyzing trading charts.

TABS PERMISSION:
Enables chrome.tabs.captureVisibleTab() for screenshot capture when user clicks "Analyze Chart" button.

WHAT WE DON'T DO:
• We do NOT modify the Chrome New Tab Page
• We do NOT modify Omnibox search
• We do NOT change browser defaults
• We do NOT automatically navigate or redirect users

chrome.tabs.create() USAGE:
Only used when user explicitly clicks buttons in our popup:
1. "Sign In" button → Opens our auth page
2. "Open Dashboard" button → Opens our web app
3. "Sign Out" → Clears session on our domain

This is standard practice for web-app-integrated extensions and does NOT circumvent override APIs.
```

---

## 4. Make Code More Defensive (Optional)

If you want to reduce risk further, consider these changes:

### Option A: Remove Inactive Tab Creation
Only create active tabs (users see what's happening):

```typescript
// Instead of:
chrome.tabs.create({ url: "...", active: false })

// Use:
chrome.tabs.create({ url: "..." }) // active by default
```

### Option B: Use chrome.tabs.update Instead
Navigate existing tabs instead of creating new ones:

```typescript
chrome.tabs.query({ url: "https://admin.snapchartapp.com/*" }, (tabs) => {
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { active: true, url: newUrl })
  } else {
    chrome.tabs.create({ url: newUrl })
  }
})
```

### Option C: Add Explicit User Confirmation
Before navigating, show a confirmation (overkill, but safest):

```typescript
const confirmOpen = confirm("Open Snapchart dashboard in new tab?")
if (confirmOpen) {
  chrome.tabs.create({ url: "..." })
}
```

**Recommendation:** Start with Option A (remove `active: false` parameter). This makes all navigation visible to users.

---

## 5. Build and Resubmit

After making changes:

```bash
cd extension
pnpm build
# or
npm run build
```

This will create a new production build in `build/chrome-mv3-prod/`.

**Zip the build folder** and upload to Chrome Web Store.

---

## 6. If Still Rejected

### Request a Manual Review Call
In your appeal, add:

```
We respectfully request a manual review or phone call with the review team to 
clarify any misunderstandings about our extension's functionality. We can provide:
• Screen recording demonstrations
• Source code access for inspection
• Technical architecture documentation
• Any additional information needed

Our extension provides legitimate value to traders and fully complies with all 
Chrome Web Store policies. We are committed to resolving any concerns.
```

### Provide Video Demonstration
Record a Loom video (https://loom.com) showing:
1. Installing the extension
2. Opening TradingView
3. Clicking the widget
4. Clicking "Analyze Chart"
5. Receiving AI feedback
6. Clicking "Open Dashboard" to show tab creation
7. Signing out

**Include video URL in your appeal**

---

## 7. Alternative: Reduce Scope Temporarily

If all else fails, you can temporarily reduce permissions to get approved:

### Minimal Permissions Version
1. Remove `<all_urls>` → Use specific domains only
   ```json
   "host_permissions": [
     "https://*.tradingview.com/*",
     "https://admin.snapchartapp.com/*"
   ]
   ```
2. This limits where extension works but may appease reviewers
3. Once approved with good reviews, you can request additional permissions

---

## 8. Contact Information

If reviewers need more info, provide:

**Developer Contact:**
- Email: [your-email]
- Website: https://admin.snapchartapp.com
- Support: [support-email]
- Documentation: https://github.com/[your-repo] (if public)

**Business Registration:**
If you have an LLC or business entity, mention it:
- Company: Snapchart LLC
- Location: [City, State]
- Tax ID: [if comfortable sharing]

This adds legitimacy.

---

## Summary Checklist

Before resubmitting:

- [ ] Updated extension name to be more descriptive
- [ ] Updated description to emphasize educational/coaching value
- [ ] Added comprehensive privacy policy
- [ ] Prepared detailed appeal using CHROME_STORE_APPEAL.md
- [ ] Added 3-5+ screenshots with captions
- [ ] Filled out all privacy practices fields
- [ ] Justified all permissions clearly
- [ ] Removed `active: false` from chrome.tabs.create() (optional)
- [ ] Rebuilt extension: `pnpm build`
- [ ] Tested production build manually
- [ ] Created video demonstration (optional but helpful)
- [ ] Prepared to respond quickly to reviewer questions

---

## Expected Timeline

- **Appeal review:** 1-3 business days
- **Re-review after resubmission:** 1-5 business days
- **If escalated:** Can take 1-2 weeks

**Be patient but persistent.** Many legitimate extensions get wrongly flagged initially.

---

## Need Help?

If still stuck after this:
1. Post in Chrome Extensions Google Group: https://groups.google.com/a/chromium.org/g/chromium-extensions
2. Reach out to @ChromiumDev on Twitter
3. File a bug report if you believe it's a false positive

Good luck! 🚀
