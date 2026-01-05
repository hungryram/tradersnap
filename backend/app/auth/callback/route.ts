import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  
  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/auth/login?error=invalid-link", request.url), 303)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Handle cookies() in Server Component
          }
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

  return NextResponse.redirect(new URL("/auth/success", request.url), 303)
}
