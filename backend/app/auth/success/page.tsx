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
      
      // Get the session (should already be set by callback)
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
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
