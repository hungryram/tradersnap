import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { verifyUninstallToken } from "@/lib/uninstall-token"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const feedbackSchema = z.object({
  reason: z.enum(["not_useful", "confusing", "too_expensive", "bugs", "privacy", "wrong_platform", "other"]),
  details: z.string().max(1000).optional(),
  version: z.string().max(20).optional(),
  t: z.string().max(200).optional()
})

// Answer from the page Chrome opens after uninstalling. No login exists there; the signed
// code in the uninstall link (when present) says whose extension it was.
export async function POST(request: NextRequest) {
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 })
  }

  const row = {
    reason: parsed.data.reason,
    details: parsed.data.details?.trim() || null,
    extension_version: parsed.data.version ?? null
  }
  const userId = verifyUninstallToken(parsed.data.t)
  // user_id only exists once 20261014_uninstalls.sql has run
  let { error } = await supabase.from("uninstall_feedback").insert(userId ? { ...row, user_id: userId } : row)
  if (error && userId) ({ error } = await supabase.from("uninstall_feedback").insert(row))
  if (error) {
    console.error("[Feedback] Insert error:", error)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
