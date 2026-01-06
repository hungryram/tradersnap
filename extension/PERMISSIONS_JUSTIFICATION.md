# Chrome Extension Permissions Justification

## Extension Purpose
Trading Buddy is an AI-powered trading psychology coach that helps traders analyze their chart setups against their own trading rules. It provides real-time feedback and coaching to build disciplined trading habits.

## Required Permissions & Justification

### 1. `activeTab`
**Purpose:** Access to the currently active tab when user interacts with the extension

**How it's used:**
- Provides context about which tab user is on
- Enables screenshot capture workflow
- Only active when user clicks extension elements

**Why necessary:** 
- Required for user-initiated actions
- Provides minimal access (only current tab, only when user interacts)

### 2. `tabs`
**Purpose:** Capture screenshots of trading charts using `chrome.tabs.captureVisibleTab()`

**How it's used:**
- User opens extension widget on a trading chart page (e.g., TradingView)
- User clicks "Analyze Chart" button in the widget
- Extension calls `chrome.tabs.captureVisibleTab()` to screenshot current tab
- Screenshot is sent to our backend API for AI analysis
- User receives feedback based on their personal trading rules

**Why necessary:** 
- **Core functionality** - analyzing chart images is the primary purpose
- `activeTab` alone is insufficient for programmatic screenshot capture
- Only captures when user explicitly clicks "Analyze Chart" or "Send with chart"
- No background or automatic screenshots
- Screenshots are temporary (sent to API, not permanently stored)

**Important:** Without this permission, the extension cannot capture charts and loses its core value proposition.

### 3. `storage`
**Purpose:** Store user preferences and chat history locally

**What we store:**
- User's theme preference (light/dark mode)
- Chat message history (stored locally, not uploaded)
- Supabase session token (for authentication)
- Usage consent flags

**Data handling:**
- All data stored locally in chrome.storage.local
- Session tokens only used to authenticate with OUR backend (admin.tradersnap.com)
- No third-party data collected or stored
- Users can clear data anytime via extension menu

### 4. `scripting`
**Purpose:** Inject chat widget overlay onto trading chart pages

**How it's used:**
- Injects content script (chat widget UI) onto pages user visits
- Widget is a floating chat interface for AI coaching
- Does NOT modify page content or automate any actions
- Purely additive UI element that can be closed/minimized

**Why necessary:**
- Provides the coaching interface users interact with
- Non-intrusive overlay that doesn't affect page functionality

### 5. Host Permissions: `<all_urls>`

**Why this broad permission is necessary:**

Chrome's `chrome.tabs.captureVisibleTab()` API has a strict requirement:
- When called from content script actions (user clicking button in widget), it requires `<all_urls>` permission
- `activeTab` alone is insufficient because it only works for popup/icon interactions, not content script buttons
- This is a Chrome API limitation, not our choice

**What we actually do with this access:**
- **Screenshot capture ONLY** - When user clicks "Analyze Chart" in the widget
- Widget injection on pages user visits (provides the chat interface)
- Read session from admin.tradersnap.com localStorage (our own domain for auth sync)

**What we DO NOT do:**
- ❌ Read any cookies, passwords, or credentials from any site
- ❌ Access TradingView account data or trading history
- ❌ Modify page content or automate any actions
- ❌ Track browsing history
- ❌ Collect data from non-trading pages
- ❌ Run in background when widget is closed

**Real-world usage:**
- Extension is primarily used on TradingView and our admin site
- Users explicitly open the widget when they want coaching
- Widget can be closed/minimized anytime
- Zero impact on pages where user doesn't use the extension

**Similar extensions with this permission:**
- Loom (screen recording)
- Awesome Screenshot
- Nimbus Screenshot
- Any extension that captures screenshots from content scripts

**Alternative we considered:**
We tried using specific domain permissions (`https://*.tradingview.com/*`) but Chrome's API requires `<all_urls>` for programmatic screenshot capture from content scripts. This is not a security oversight—it's how the Chrome API is designed.

## Data Privacy

### What data leaves the user's device:
1. **Chart screenshots** - Sent to our backend API (admin.tradersnap.com/api/analyze) for AI analysis
   - User explicitly requests each analysis
   - Screenshots not permanently stored
   - Used only for immediate AI processing

2. **Chat messages** - Sent to our backend API for AI coaching responses
   - User types each message intentionally
   - Conversation context used to provide relevant coaching

3. **Authentication tokens** - Standard OAuth tokens from Supabase
   - Industry-standard auth (same as millions of web apps)
   - Only authenticates with OUR backend, never third parties

### What data NEVER leaves the device:
- User's trading rules (stored locally)
- Chat history (stored in chrome.storage)
- User preferences (theme, position, size)
- Browser cookies from other sites

## No Malicious Behavior

**We DO NOT:**
- ❌ Automate actions on any website
- ❌ Modify page content beyond our widget
- ❌ Access or exfiltrate third-party credentials
- ❌ Track browsing history
- ❌ Inject ads or affiliate links
- ❌ Mine cryptocurrency or use computing resources
- ❌ Redirect users or change default search engines

**We DO:**
- ✅ Provide legitimate AI coaching service
- ✅ Only act on explicit user requests
- ✅ Maintain transparent data practices
- ✅ Follow Chrome Web Store policies
- ✅ Respect user privacy

## Open Source & Transparency

- Source code available at: https://github.com/hungryram/tradersnap
- Built with Plasmo framework (standard React-based extension framework)
- No obfuscation or hidden functionality
- Minified code is normal React production build output

## Contact

For questions about permissions or data handling:
- Email: support@tradersnap.com
- Privacy Policy: https://admin.tradersnap.com/privacy
- Website: https://admin.tradersnap.com
