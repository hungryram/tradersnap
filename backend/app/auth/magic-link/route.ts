import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = formData.get("email") as string

  if (!email) {
    return NextResponse.redirect(new URL("/?error=missing-email", request.url))
  }

  // Use the request URL to construct the redirect URL
  const redirectUrl = new URL("/auth/callback", request.url).toString()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl
    }
  })

  if (error) {
    console.error("Magic link error:", error)
    return NextResponse.redirect(new URL("/?error=failed", request.url), 303)
  }

  return NextResponse.redirect(new URL("/auth/check-email", request.url), 303)
}
