"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"

export default function Home() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const [useMagicLink, setUseMagicLink] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check if already signed in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkOnboardingStatus(session.access_token)
      }
    })
  }, [])

  async function checkOnboardingStatus(token: string) {
    const origin = window.location.origin
    const response = await fetch(`${origin}/api/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.user.onboarded) {
        router.push("/dashboard/rules")
      } else {
        router.push("/onboarding")
      }
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      if (useMagicLink) {
        // Magic link flow
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/success`
          }
        })

        if (error) throw error
        setSuccess(true)
      } else {
        // Email/password flow
        if (isSignUp) {
          // Sign up new user
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/success`
            }
          })

          if (error) throw error
          
          if (data.session) {
            // Signed up and logged in
            await checkOnboardingStatus(data.session.access_token)
          } else {
            // Email confirmation required
            setSuccess(true)
          }
        } else {
          // Sign in existing user
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          })

          if (error) throw error
          
          if (data.session) {
            await checkOnboardingStatus(data.session.access_token)
          }
        }
      }
    } catch (err) {
      console.error("Sign in error:", err)
      setError(err instanceof Error ? err.message : "Authentication failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🤖</div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Trading Buddy</h1>
            <p className="text-slate-600">AI Trading Psychology Coach</p>
          </div>

          {success ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <div className="text-4xl mb-3">📧</div>
              <h3 className="font-bold text-green-900 mb-2">Check Your Email!</h3>
              <p className="text-sm text-green-800">
                {useMagicLink 
                  ? "We've sent you a magic link to sign in. Click the link in your email to continue."
                  : "We've sent you a confirmation email. Click the link to verify your account."
                }
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                    required
                  />
                </div>

                {!useMagicLink && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                      required
                      minLength={6}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Minimum 6 characters
                    </p>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  {isLoading 
                    ? "Loading..." 
                    : useMagicLink 
                      ? "Send Magic Link" 
                      : isSignUp 
                        ? "Create Account" 
                        : "Sign In"
                  }
                </button>
              </form>

              {!useMagicLink && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
                  </button>
                </div>
              )}

              <div className="mt-6 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setUseMagicLink(!useMagicLink)
                  setError(null)
                }}
                className="mt-4 w-full text-sm text-slate-600 hover:text-slate-900 font-medium py-2"
              >
                {useMagicLink ? "← Back to password sign in" : "Sign in with magic link →"}
              </button>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="text-center space-y-2 text-sm text-slate-600">
              <p>✓ Fast, secure authentication</p>
              <p>✓ Analyze charts against your trading rules</p>
              <p>✓ Stay disciplined with AI coaching</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

