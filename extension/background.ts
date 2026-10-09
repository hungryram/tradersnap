export {}

const API_URL = process.env.PLASMO_PUBLIC_API_URL!
const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!

// ---------------------------------------------------------------------------
// First install: open the welcome page. Uninstall: ask why.
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: `${API_URL}/welcome` })
  }
  scheduleSessionRefresh()
})

chrome.runtime.setUninstallURL(`${API_URL}/goodbye?v=${chrome.runtime.getManifest().version}`)

chrome.runtime.onStartup.addListener(scheduleSessionRefresh)

// ---------------------------------------------------------------------------
// Messages from our website (only origins in manifest externally_connectable
// can send these; we also require the exact API origin, so the localhost entry
// there only works in dev builds that point at localhost)
// ---------------------------------------------------------------------------
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!sender.origin || sender.origin !== new URL(API_URL).origin) return

  if (message?.type === "SNAPCHART_PING") {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version })
    return
  }

  if (message?.type === "SNAPCHART_LOGIN" && typeof message.token_hash === "string") {
    signInWithTokenHash(message.token_hash)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message ?? error) }))
    return true // async response
  }

  if (message?.type === "SNAPCHART_SIGN_OUT") {
    signOut().finally(() => sendResponse({ ok: true }))
    return true
  }
})

// ---------------------------------------------------------------------------
// The extension's own Supabase session (separate from the website's, so the
// two never fight over the single-use refresh token)
// ---------------------------------------------------------------------------
async function authRequest(path: string, body: unknown, accessToken?: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.msg || data?.error_description || data?.error || `Auth error ${response.status}`)
  return data
}

function withExpiry(session: any) {
  return {
    ...session,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600)
  }
}

async function signInWithTokenHash(tokenHash: string) {
  const session = await authRequest("verify", { type: "magiclink", token_hash: tokenHash })
  if (!session?.access_token) throw new Error("No session returned")
  await chrome.storage.local.set({ supabase_session: withExpiry(session) })
}

async function signOut() {
  const { supabase_session } = await chrome.storage.local.get("supabase_session")
  await chrome.storage.local.remove(["supabase_session", "timeout_end"])
  if (supabase_session?.access_token) {
    await authRequest("logout?scope=local", {}, supabase_session.access_token).catch(() => {})
  }
}

// Renew a few minutes before the 1-hour access token expires
const REFRESH_ALARM = "refresh-session"
const REFRESH_MARGIN_SECONDS = 10 * 60
let refreshing: Promise<void> | null = null

function scheduleSessionRefresh() {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 1 })
  refreshSessionIfNeeded()
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === REFRESH_ALARM) refreshSessionIfNeeded()
})

function refreshSessionIfNeeded(force = false): Promise<void> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const { supabase_session: session } = await chrome.storage.local.get("supabase_session")
    if (!session?.refresh_token) return
    const secondsLeft = (session.expires_at ?? 0) - Date.now() / 1000
    if (!force && secondsLeft > REFRESH_MARGIN_SECONDS) return

    try {
      const fresh = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
      await chrome.storage.local.set({ supabase_session: withExpiry(fresh) })
    } catch (error) {
      // A refresh token that's been revoked or reused can't recover: sign out so the UI shows "Sign in"
      const message = String((error as Error)?.message ?? "")
      if (/invalid|revoked|not found|already used/i.test(message)) {
        await chrome.storage.local.remove("supabase_session")
      }
      console.warn("[Background] Session refresh failed:", message)
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

// ---------------------------------------------------------------------------
// Messages from our own content script / popup
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURE_SCREENSHOT") {
    captureScreenshot().then(sendResponse)
    return true // Async response
  }
  if (message.type === "ENSURE_SESSION") {
    refreshSessionIfNeeded().then(() => sendResponse({ ok: true }))
    return true
  }
  if (message.type === "REFRESH_SESSION") {
    // A request just came back 401: renew now and let the caller retry
    refreshSessionIfNeeded(true).then(async () => {
      const { supabase_session } = await chrome.storage.local.get("supabase_session")
      sendResponse({ session: supabase_session ?? null })
    })
    return true
  }
})

async function captureScreenshot() {
  try {
    // Make sure we're capturing from the active window
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const activeTab = tabs[0]

    if (!activeTab) {
      throw new Error('No active tab found')
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
      format: "png"
    })

    return { success: true, dataUrl }
  } catch (error) {
    console.error("[Background] Screenshot capture failed:", error)
    return { success: false, error: (error as Error).message }
  }
}
