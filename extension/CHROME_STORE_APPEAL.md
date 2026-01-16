# Chrome Web Store Appeal Response

## Response to Notification: Yellow Nickel (Spam & Placement Policy)

### Extension Uniqueness

**Snapchart (Trading Psychology AI Coach)** provides a **unique, specialized service** that does not duplicate any existing Chrome extension:

**Unique Value Proposition:**
- AI-powered trading psychology coaching overlays on live trading charts
- Personalized feedback based on user's own custom trading rulesets
- Real-time chart analysis against user-defined psychology rules
- Educational tool to build disciplined trading habits

**No duplicate submissions:**
- This is our **only extension** under this developer account
- We have **not submitted** multiple versions or duplicate functionality
- No affiliated developer accounts exist

### No Review/Rating Manipulation

- We have **never** attempted to manipulate reviews, ratings, or install counts
- All metrics are organic from legitimate users
- No incentivized downloads or fake reviews
- We follow all Google Webmaster Quality Guidelines

### No Notification Abuse

Our extension **does not send notifications**. Specifically:
- ❌ No browser notifications API used
- ❌ No spam, ads, or promotions sent
- ❌ No phishing attempts or unwanted messages
- ✅ All interactions are user-initiated within our chat widget interface
- ✅ Users must explicitly click buttons to trigger any action

### No Message Spam

**We do not send messages on behalf of users.** Our functionality:
- Users type their own messages in a private chat interface
- Messages are sent only to **our own backend API** for AI analysis
- No messages sent to third parties, other websites, or other users
- No email, SMS, or social media posting on user's behalf
- Complete user control over all communications

---

## Response to Notification: Blue Nickel & Blue Potassium (Circumvents Overrides API)

### We Do NOT Modify New Tab Page or Omnibox Search

Our extension **does not** and **has never** modified:
- ❌ Chrome New Tab Page
- ❌ Omnibox (address bar search)
- ❌ Default search engine
- ❌ Browser start page
- ❌ Any browser navigation behavior

### Explanation of `chrome.tabs.create()` Usage

Our extension uses the standard `chrome.tabs.create()` API for **legitimate, user-initiated navigation only**:

**Usage #1: User clicks "Open Dashboard" button in extension popup**
```typescript
// Location: popup.tsx, line ~177
chrome.tabs.create({ 
  url: "https://admin.snapchartapp.com/dashboard/rules" 
})
```
- Opens our web application dashboard
- User explicitly clicks "Open Dashboard" button
- Standard practice for web-app-integrated extensions

**Usage #2: User clicks "Sign In" button**
```typescript
// Location: popup.tsx, line ~206
chrome.tabs.create({ 
  url: "https://admin.snapchartapp.com" 
})
```
- Opens authentication page when user wants to log in
- Explicit user action required
- Standard OAuth flow for extensions

**Usage #3: Background sign-out (user-initiated)**
```typescript
// Location: popup.tsx, line ~144
await chrome.tabs.create({ 
  url: "https://admin.snapchartapp.com/?signout=true",
  active: false 
})
```
- Only triggered when user clicks "Sign Out" button
- Opens our domain briefly to clear session storage
- Immediately closes, invisible to user
- Standard practice for clearing cross-domain authentication

### Why This is NOT Circumventing Overrides

1. **User-initiated actions only** - All `chrome.tabs.create()` calls occur in response to explicit button clicks
2. **Our own domain** - We only navigate to `admin.snapchartapp.com` (our application)
3. **No automatic/background navigation** - Extension never opens tabs without user interaction
4. **No search/homepage modification** - We do not interfere with browser defaults
5. **Standard extension pattern** - This is how extensions integrate with web applications

### How We Could Remove This (If Required)

If the review team requires removal of `chrome.tabs.create()`:
- We can redirect to authentication flow within the extension popup (worse UX)
- We can use `window.open()` from content scripts instead (functionally identical)
- However, this would significantly degrade user experience without improving security

---

## Extension Architecture Overview

**What our extension actually does:**

1. **Injects a chat widget** on trading chart websites (TradingView, etc.)
2. **User clicks "Analyze Chart"** → Extension captures screenshot of visible tab
3. **Screenshot sent to our API** → AI analyzes chart against user's trading rules
4. **AI response displayed** in chat widget
5. **User can open dashboard** → Extension opens our web app in new tab (user clicks button)

**Key Points:**
- All actions are user-initiated
- Widget is additive (doesn't modify page content)
- Screenshots only captured when user clicks button
- Only communicates with our own backend API
- No third-party data access or manipulation

---

## Permissions Justification Summary

### Why we need `<all_urls>`:
Chrome's `chrome.tabs.captureVisibleTab()` API requires `<all_urls>` when called from content script contexts. This is a Chrome API limitation, not our choice.

**What we actually do with this permission:**
- ✅ Capture screenshots when user clicks "Analyze Chart"
- ✅ Inject chat widget on pages user visits
- ✅ Read our own auth session from `admin.snapchartapp.com`

**What we DO NOT do:**
- ❌ Read cookies, passwords, or credentials from other sites
- ❌ Modify page content (except additive chat widget)
- ❌ Automate any trading actions
- ❌ Track browsing history
- ❌ Modify browser defaults (homepage, search, newtab)

### Why we need `tabs` permission:
Required for `chrome.tabs.captureVisibleTab()` - our core functionality of analyzing trading charts.

---

## Compliance Statement

We certify that:

1. ✅ This is our only extension submission (no duplicates)
2. ✅ All reviews and ratings are organic
3. ✅ No spam notifications are sent
4. ✅ No messages sent on behalf of users
5. ✅ We do NOT modify New Tab Page
6. ✅ We do NOT modify Omnibox search
7. ✅ We do NOT circumvent any override APIs
8. ✅ `chrome.tabs.create()` is used only for user-initiated navigation to our own domain
9. ✅ All Chrome Web Store policies are followed
10. ✅ All Google Webmaster Quality Guidelines are followed

---

## Additional Information

**Extension Name:** Snapchart  
**Developer:** Snapchart  
**Support Email:** [your-support-email]  
**Privacy Policy:** [your-privacy-policy-url]  
**Website:** https://admin.snapchartapp.com  

**Source Code:** Available upon request for review team inspection

We are committed to maintaining a high-quality, policy-compliant extension. If any specific concerns remain, we are happy to provide:
- Screen recordings demonstrating functionality
- Access to source code for review
- Further technical documentation
- Any other information requested by the review team

Thank you for your consideration.
