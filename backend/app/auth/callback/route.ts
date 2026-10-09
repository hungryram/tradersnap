import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  // For magic links, Supabase sends tokens in the URL hash (fragment)
  // which can only be read client-side. Just redirect to success page
  // which will handle the hash tokens.
  // Keep the query string: Google sign-in (PKCE) sends ?code= here
  const target = new URL("/auth/success", request.url)
  target.search = request.nextUrl.search
  return NextResponse.redirect(target, 303)
}
