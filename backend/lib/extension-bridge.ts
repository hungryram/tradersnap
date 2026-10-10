// Hands the signed-in session to the Pip extension.
//
// Preferred: chrome.runtime.sendMessage to the extension's ID (the extension
// lists this site in externally_connectable, so only we can reach it). The
// extension receives a one-time token and signs in with its own session.
// Fallback for older extension builds: localStorage + window.postMessage,
// which the extension's content script on this domain picks up.

import type { Session } from "@supabase/supabase-js"

const EXTENSION_IDS = (process.env.NEXT_PUBLIC_EXTENSION_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean)

type ChromeRuntime = {
  sendMessage: (id: string, message: unknown, callback: (response: any) => void) => void
  lastError?: { message?: string }
}

function runtime(): ChromeRuntime | null {
  // @ts-ignore chrome is only defined in Chromium browsers
  const rt = typeof chrome !== "undefined" ? chrome.runtime : undefined
  return rt?.sendMessage ? rt : null
}

function send(id: string, message: unknown, timeoutMs = 1500): Promise<any> {
  const rt = runtime()
  if (!rt) return Promise.resolve(null)
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    try {
      rt.sendMessage(id, message, response => {
        clearTimeout(timer)
        // Reading lastError keeps Chrome from logging "Could not establish connection"
        resolve(rt.lastError ? null : response ?? null)
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

// Returns the installed extension's version, or null if it isn't installed / reachable
export async function detectExtension(): Promise<string | null> {
  for (const id of EXTENSION_IDS) {
    const response = await send(id, { type: "SNAPCHART_PING" })
    if (response?.installed) return response.version ?? "unknown"
  }
  return null
}

export async function sendSessionToExtension(session: Session): Promise<boolean> {
  // Fallback for extension builds before 1.1 (content script on this domain reads it)
  try {
    localStorage.setItem("trading_buddy_session", JSON.stringify(session))
    window.postMessage({ type: "TRADING_BUDDY_LOGIN", session }, window.location.origin)
  } catch {
    // storage blocked: the direct path below still works
  }

  if (!runtime() || EXTENSION_IDS.length === 0) return false

  // Current builds get their own login (see /api/extension-session)
  const response = await fetch("/api/extension-session", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` }
  }).catch(() => null)
  if (!response?.ok) return false
  const { token_hash } = await response.json()

  for (const id of EXTENSION_IDS) {
    const reply = await send(id, { type: "SNAPCHART_LOGIN", token_hash }, 8000)
    if (reply?.ok) return true
  }
  return false
}

export async function signOutExtension(): Promise<void> {
  try {
    localStorage.removeItem("trading_buddy_session")
  } catch {}
  for (const id of EXTENSION_IDS) await send(id, { type: "SNAPCHART_SIGN_OUT" })
}
