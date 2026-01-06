// Inject this script into the web app pages to notify extension of auth changes
// This bridges the gap between web app auth and extension auth

console.log('[Auth Bridge] Script loaded')

// Function to notify extension of session
function notifyExtension(session: any) {
  if (session) {
    console.log('[Auth Bridge] Notifying extension of session')
    window.postMessage({
      type: 'TRADING_BUDDY_SESSION',
      session: session
    }, '*')
  }
}

// Check for existing session in localStorage
const storedSession = localStorage.getItem('trading_buddy_session')
if (storedSession) {
  try {
    const session = JSON.parse(storedSession)
    notifyExtension(session)
  } catch (e) {
    console.error('[Auth Bridge] Failed to parse stored session:', e)
  }
}

// Watch for localStorage changes (from other tabs or async auth flows)
window.addEventListener('storage', (e) => {
  if (e.key === 'trading_buddy_session' && e.newValue) {
    try {
      const session = JSON.parse(e.newValue)
      notifyExtension(session)
    } catch (err) {
      console.error('[Auth Bridge] Failed to parse session from storage event:', err)
    }
  }
})

// Poll for session updates every 2 seconds
setInterval(() => {
  const storedSession = localStorage.getItem('trading_buddy_session')
  if (storedSession) {
    try {
      const session = JSON.parse(storedSession)
      notifyExtension(session)
    } catch (e) {
      console.error('[Auth Bridge] Failed to parse session during poll:', e)
    }
  }
}, 2000)

console.log('[Auth Bridge] Monitoring for auth changes')
