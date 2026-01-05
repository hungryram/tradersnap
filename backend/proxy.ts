import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Dashboard and onboarding routes require auth
  const protectedPaths = ['/dashboard', '/onboarding']
  const isProtectedPath = protectedPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath) {
    // Check for any Supabase auth cookies (the name includes the project ID)
    const allCookies = request.cookies.getAll()
    const supabaseAuthToken = allCookies.find(cookie => 
      cookie.name.includes('auth-token') || 
      cookie.name === 'sb-access-token' ||
      cookie.name === 'supabase-auth-token'
    )
    
    console.log('[Middleware] Protected path:', request.nextUrl.pathname)
    console.log('[Middleware] All cookies:', allCookies.map(c => c.name))
    console.log('[Middleware] Has auth token:', !!supabaseAuthToken)
    
    if (!supabaseAuthToken) {
      console.log('[Middleware] No auth token, redirecting to home')
      // Redirect to home page if not authenticated
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding']
}
