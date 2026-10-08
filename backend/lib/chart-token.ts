import { createHash, createHmac, timingSafeEqual } from "crypto"

// A chart token proves the server already counted a screenshot for this user,
// so the same image can be re-sent as follow-up context without counting again.
const secret = process.env.CHART_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!

export function signChartToken(userId: string, image: string): string {
  const imageHash = createHash("sha256").update(image).digest("hex")
  return createHmac("sha256", secret).update(`${userId}:${imageHash}`).digest("base64url")
}

export function verifyChartToken(userId: string, image: string, token?: string | null): boolean {
  if (!token) return false
  const expected = Buffer.from(signChartToken(userId, image))
  const received = Buffer.from(token)
  return expected.length === received.length && timingSafeEqual(expected, received)
}
