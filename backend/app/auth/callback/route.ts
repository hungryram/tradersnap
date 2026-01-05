import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  
  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/auth/login?error=invalid-link", request.url), 303)
  }

  const response = NextResponse.redirect(new URL("/auth/success", request.url), 303)
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as any,
  })

  if (error) {
    console.error("OTP verification error:", error)
    return NextResponse.redirect(new URL("/auth/login?error=invalid-link", request.url), 303)
  }

  return response
}
