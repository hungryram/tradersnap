import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  // For magic links, Supabase sends tokens in the URL hash (fragment)
  // which can only be read client-side. Just redirect to success page
  // which will handle the hash tokens.
  return NextResponse.redirect(new URL("/auth/success", request.url), 303)
}
