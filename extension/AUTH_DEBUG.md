# Extension Auth Debug Guide

## Problem: Extension doesn't detect web app sign-in

### Quick Debug Steps

**1. Reload extension and refresh admin.tradersnap.com:**
```
1. Go to chrome://extensions
2. Find Trading Buddy → click reload button
3. Go to https://admin.tradersnap.com/dashboard
4. Refresh the page (F5)
5. Wait 5 seconds
```

**2. Check console logs:**
```
1. Open DevTools on admin.tradersnap.com (F12)
2. Go to Console tab
3. Look for these messages:
   ✅ "[Content] Starting localStorage polling on admin domain"
   ✅ "[Content] Found session in localStorage, updating..."
   
   ❌ If you see: "[Content] No session in localStorage"
      → Session not being saved by web app
```

**3. Check localStorage manually:**
```
1. With DevTools open on admin.tradersnap.com
2. Go to Application tab → Storage → Local Storage → admin.tradersnap.com
3. Look for key: "trading_buddy_session"
4. Should see: {"access_token": "...", "user": {...}}
   
   ❌ If missing: Web app isn't saving session to localStorage
```

**4. Check chrome.storage:**
```
1. With DevTools open on admin.tradersnap.com
2. In Console tab, run:
   chrome.storage.local.get('supabase_session', (r) => console.log(r))
3. Should see: {supabase_session: {...}}
   
   ❌ If empty: Extension isn't saving to chrome.storage
```

**5. Check popup state:**
```
1. Click extension icon
2. Right-click popup → Inspect
3. In Console, run:
   chrome.storage.local.get('supabase_session', (r) => console.log(r))
4. Should see session data
   
   ✅ If session exists but popup shows "Sign In":
      → Popup not reading from storage correctly
```

---

## Common Issues & Fixes

### Issue 1: localStorage is empty
**Symptom:** No "trading_buddy_session" in localStorage

**Root cause:** Web app success page isn't saving session

**Fix:** Check backend/app/auth/success/page.tsx saves to localStorage:
```typescript
localStorage.setItem('trading_buddy_session', JSON.stringify({
  access_token: accessToken,
  refresh_token: refreshToken,
  user: session.user
}))
```

### Issue 2: Extension can't read localStorage
**Symptom:** Console shows "[Content] No session in localStorage" repeatedly

**Root cause:** Content script not running or CSP blocking

**Check:**
1. Extension has permission for admin.tradersnap.com
2. Content script is injecting (check chrome://extensions → Details → check console)
3. No CSP errors in console

### Issue 3: Popup doesn't update
**Symptom:** chrome.storage has session, but popup shows "Sign In"

**Root cause:** Popup polling not detecting storage changes

**Fix:** Increase popup poll frequency or add manual refresh button

### Issue 4: Session expires immediately
**Symptom:** Session appears then disappears

**Root cause:** Access token expired

**Check:** Token expiry time:
```javascript
// In console on admin.tradersnap.com
const session = JSON.parse(localStorage.getItem('trading_buddy_session'))
console.log('Expires:', new Date(session.expires_at * 1000))
```

---

## Manual Sync Workaround

If automatic sync isn't working, you can manually trigger it:

**1. On admin.tradersnap.com, open console and run:**
```javascript
const session = JSON.parse(localStorage.getItem('trading_buddy_session'))
chrome.storage.local.set({ supabase_session: session }, () => {
  console.log('✅ Manually synced session to extension')
})
```

**2. Then open extension popup:**
- Should now show as signed in

---

## Current Implementation Flow

```
User signs in on web app
    ↓
Success page saves to localStorage
    ↓
Content script polls localStorage (every 1 second)
    ↓
Content script finds session
    ↓
Content script saves to chrome.storage.local
    ↓
Popup polls chrome.storage (every 2 seconds)
    ↓
Popup detects session and shows "signed in"
```

**Bottlenecks:**
- ⏱️ Polling intervals (1-2 second delay)
- 🔄 Page refresh might clear content script
- 🚫 CSP might block some operations

---

## Alternative: Force Refresh

If nothing works, add a "Refresh" button in popup:

```typescript
async function forceRefreshSession() {
  // Try to get session from Supabase directly
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await chrome.storage.local.set({ supabase_session: session })
    setIsLoggedIn(true)
    setUser(session.user)
  }
}
```

Then show button: "Not seeing your login? Click here to refresh"

---

## Next Steps

1. **Try the debug steps above** to identify where the sync is failing
2. **Check console logs** on both admin.tradersnap.com and extension popup
3. **Report findings:** 
   - Does localStorage have the session?
   - Does chrome.storage have the session?
   - Does popup detect it?

This will help pinpoint the exact failure point!
