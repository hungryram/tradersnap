import type { Session } from "@supabase/supabase-js"
import { sendSessionToExtension } from "./extension-bridge"

// Where a user goes right after signing in: onboarding the first time, the dashboard after that
export async function finishLogin(session: Session): Promise<string> {
  await sendSessionToExtension(session)

  try {
    const response = await fetch("/api/me", { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (response.ok) {
      const { user, ruleset } = await response.json()
      // Onboarding was switched off for a while, so existing users with rules count as onboarded
      if (!user?.onboarded && !ruleset) return "/onboarding"
    }
  } catch {
    // If the profile can't be loaded, the dashboard still works
  }
  return "/dashboard/rules"
}
