import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { signUninstallToken } from "@/lib/uninstall-token"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The extension asks for this right after signing in and puts it in its uninstall link
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.substring(7))
  if (error || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  // Signing in from the extension again means it's installed (again)
  await supabase.from("profiles").update({ uninstalled_at: null }).eq("id", user.id).not("uninstalled_at", "is", null)

  return NextResponse.json({ token: signUninstallToken(user.id) }, { headers: { "Cache-Control": "no-store" } })
}
