import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type")

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any
    })

    if (error) {
      return NextResponse.redirect(new URL("/auth/login?error=invalid-link", request.url))
    }
  }

  // Redirect to success page with instructions to return to extension
  return NextResponse.redirect(new URL("/auth/success", request.url))
}
