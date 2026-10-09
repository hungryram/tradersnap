import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Gives the extension its own login. The website (signed in) asks for a
// one-time sign-in token for the same user and hands it to the extension,
// which exchanges it for a separate session. Separate sessions matter because
// Supabase refresh tokens are single-use: if the site and the extension shared
// one, whichever refreshed second would be signed out.
//
// Same-origin only: no CORS headers, so other sites can't call it from a browser.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7))
  if (authError || !user?.email) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  // generateLink creates the token without sending an email
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email: user.email })
  if (error || !data.properties?.hashed_token) {
    console.error("[Extension session] generateLink failed:", error)
    return NextResponse.json({ error: "Could not create extension login" }, { status: 500 })
  }

  return NextResponse.json(
    { token_hash: data.properties.hashed_token },
    { headers: { "Cache-Control": "no-store" } }
  )
}
