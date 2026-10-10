import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { verifyUninstallToken } from "@/lib/uninstall-token"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Called by /goodbye as soon as it opens (Chrome opens it after the extension is removed)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const userId = verifyUninstallToken(typeof body?.t === "string" ? body.t : null)
  if (!userId) return NextResponse.json({ recorded: false })

  const { error } = await supabase.from("profiles").update({ uninstalled_at: new Date().toISOString() }).eq("id", userId)
  if (error) console.error("[Uninstall] Update failed:", error)
  return NextResponse.json({ recorded: !error })
}
