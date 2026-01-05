'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function AuthSuccessPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Checking authentication...')
  
  useEffect(() => {
    handleAuthSuccess()
  }, [])
  
  async function handleAuthSuccess() {
    try {
      const supabase = createClient()
      
      // Check if we have tokens in the URL hash (magic link flow)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      
      if (accessToken && refreshToken) {
        console.log('[Auth Success] Found tokens in hash, setting session...')
        setStatus('Setting up your session...')
        
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        
        if (error) {
          console.error('[Auth Success] Failed to set session:', error)
          setStatus('Authentication failed. Redirecting...')
          setTimeout(() => router.push('/auth/login'), 1500)
          return
        }
      }
      
      // Get the session
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error || !session) {
        console.error('[Auth Success] No session found:', error)
        setStatus('Authentication failed. Redirecting...')
        setTimeout(() => router.push('/auth/login'), 1500)
        return
      }
      
      console.log('[Auth Success] Session found, checking onboarding status...')
      setStatus('Loading your profile...')
      
      // Check onboarding status
      const origin = window.location.origin
      const response = await fetch(`${origin}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        
        if (data.user.onboarded) {
          setStatus('Redirecting to dashboard...')
          router.push('/dashboard/rules')
        } else {
          setStatus('Redirecting to onboarding...')
          router.push('/onboarding')
        }
      } else {
        setStatus('Redirecting to onboarding...')
        router.push('/onboarding')
      }
      
    } catch (error) {
      console.error('[Auth Success] Error:', error)
      setStatus('Something went wrong. Redirecting...')
      setTimeout(() => router.push('/auth/login'), 1500)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl mb-4">🔐</div>
        <h1 className="text-3xl font-bold">Success!</h1>
        <p className="text-slate-400">
          {status}
        </p>
      </div>
    </div>
  )
}
