import type { SupabaseClient, User } from "@supabase/supabase-js"

// Admin = plan "admin" in profiles AND email listed in ADMIN_EMAILS.
// With ADMIN_EMAILS unset nobody is an admin.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(email => email.trim().toLowerCase())
  .filter(Boolean)

export function isAdminEmail(email?: string | null) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}

export async function getAdminUser(supabase: SupabaseClient, authHeader: string | null): Promise<User | null> {
  if (!authHeader?.startsWith("Bearer ")) return null
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.substring(7))
  if (error || !user || !isAdminEmail(user.email)) return null

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single()
  return profile?.plan === "admin" ? user : null
}
