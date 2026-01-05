import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Trading Buddy</h1>
          <p className="text-slate-400">AI Trading Psychology Assistant</p>
        </div>

        <div className="bg-slate-800 rounded-lg p-8 space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Sign In</h2>
          
          <form action="/auth/magic-link" method="POST" className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                id="email"
                required
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium transition"
            >
              Send Magic Link
            </button>
          </form>

          <p className="text-sm text-slate-400 text-center">
            We'll email you a magic link for a password-free sign in.
          </p>
        </div>
      </div>
    </div>
  )
}
