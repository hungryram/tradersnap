'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { finishLogin } from '@/lib/after-login'
import AuthShell from '../../components/AuthShell'

// Landing page for Google sign-in and email links
export default function AuthSuccessPage() {
  const router = useRouter()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    handleAuthSuccess()
  }, [])

  async function handleAuthSuccess() {
    const supabase = createClient()
    try {
      let { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        const params = new URLSearchParams(window.location.search)
        const hash = new URLSearchParams(window.location.hash.substring(1))
        const code = params.get('code')
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')

        if (code) {
          // Google sign-in (PKCE)
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (!error) session = data.session
        } else if (accessToken && refreshToken) {
          // Older email links put the tokens in the URL hash
          const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (!error) session = data.session
        }
      }

      if (!session) {
        setFailed(true)
        return
      }
      router.replace(await finishLogin(session))
    } catch (error) {
      console.error('[Auth Success] Error:', error)
      setFailed(true)
    }
  }

  return (
    <AuthShell>
      <div className="text-center">
        {failed ? (
          <>
            <h1 className="text-2xl font-semibold mb-2">That sign-in link didn't work</h1>
            <p className="text-sm text-ink-text mb-6">It may have expired or already been used. Try signing in again.</p>
            <a href="/" className="inline-block rounded-lg bg-brand-500 hover:bg-brand-400 text-ink-bg font-medium px-6 py-3 transition-colors">Back to sign in</a>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-ink-border border-t-brand-500" />
            <p className="text-ink-text">Signing you in...</p>
          </>
        )}
      </div>
    </AuthShell>
  )
}
