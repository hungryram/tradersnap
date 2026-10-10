import { createHmac, timingSafeEqual } from "crypto"

// The extension puts this in its uninstall link (chrome.runtime.setUninstallURL)
// so /goodbye can tell whose extension was removed. Signed so nobody can mark
// someone else's account as uninstalled.
const secret = process.env.CHART_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sign(userId: string) {
  return createHmac("sha256", secret).update(`uninstall:${userId}`).digest("base64url").slice(0, 22)
}

export function signUninstallToken(userId: string): string {
  return `${userId}.${sign(userId)}`
}

// Returns the user id, or null if the token is missing or forged
export function verifyUninstallToken(token?: string | null): string | null {
  if (!token) return null
  const [userId, signature] = token.split(".")
  if (!userId || !signature || !UUID.test(userId)) return null
  const expected = Buffer.from(sign(userId))
  const received = Buffer.from(signature)
  return expected.length === received.length && timingSafeEqual(expected, received) ? userId : null
}
