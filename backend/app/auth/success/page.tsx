'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function AuthSuccessPage() {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  
  useEffect(() => {
    handleAuthSuccess()
  }, [])
  
  async function handleAuthSuccess() {
    try {
      const supabase = createClient()
      
      console.log('[Auth Success] Full URL:', window.location.href)
      console.log('[Auth Success] Hash:', window.location.hash)
      console.log('[Auth Success] Search:', window.location.search)
      
      // Check URL for tokens - Supabase can send them in hash OR query params
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const searchParams = new URLSearchParams(window.location.search)
      
      // Try hash first (OAuth), then search params (magic link)
      let accessToken = hashParams.get('access_token') || searchParams.get('access_token')
      let refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token')
      
      // Magic links might also use 'token_hash' and 'type' params
      const tokenHash = searchParams.get('token_hash')
      const token = searchParams.get('token')
      const type = searchParams.get('type')
      
      console.log('[Auth Success] URL params:', { 
        hasAccessToken: !!accessToken, 
        hasRefreshToken: !!refreshToken,
        hasToken: !!token,
        hasTokenHash: !!tokenHash,
        type: type,
        allSearchParams: Object.fromEntries(searchParams),
        allHashParams: Object.fromEntries(hashParams)
      })
      
      // If we have a magic link token, verify it
      if (token && type === 'magiclink') {
        console.log('[Auth Success] Verifying magic link token...')
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'magiclink'
        })
        
        if (error) {
          console.error('[Auth Success] Failed to verify magic link:', error)
          window.location.href = '/?error=invalid_link'
          return
        }
        
        console.log('[Auth Success] Magic link verified successfully')
      } else if (accessToken && refreshToken) {
        // If we have tokens directly, set the session
        console.log('[Auth Success] Found tokens in URL, setting session...')
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        
        if (error) {
          console.error('[Auth Success] Failed to set session:', error)
          window.location.href = '/'
          return
        }
        
        console.log('[Auth Success] Session set successfully')
      }
      
      // Now get the session
      const { data: { session }, error } = await supabase.auth.getSession()
      
      console.log('[Auth Success] Session:', session ? 'Found' : 'None', error)
      
      if (error) {
        console.error('[Auth Success] Session error:', error)
        router.push('/')
        return
      }

      if (!session) {
        console.log('[Auth Success] No session found, redirecting to home')
        router.push('/')
        return
      }
      
      // Store session in localStorage for extension to access
      localStorage.setItem('trading_buddy_session', JSON.stringify(session))
      console.log('[Auth Success] Stored session in localStorage')
      
      // Check onboarding status
      console.log('[Auth Success] Checking onboarding status...')
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('[Auth Success] User data:', data.user)
        
        if (data.user.onboarded) {
          console.log('[Auth Success] User already onboarded, redirecting to dashboard')
          window.location.href = '/dashboard/rules'
        } else {
          console.log('[Auth Success] User not onboarded, redirecting to onboarding')
          window.location.href = '/onboarding'
        }
      } else {
        console.log('[Auth Success] Failed to fetch user data, redirecting to onboarding')
        window.location.href = '/onboarding'
      }
      
    } catch (error) {
      console.error('[Auth Success] Error:', error)
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl mb-4">🔐</div>
        <h1 className="text-3xl font-bold">Signing you in...</h1>
        <p className="text-slate-400">
          Redirecting to your dashboard...
        </p>
      </div>
    </div>
  )
}
