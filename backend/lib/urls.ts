// Public addresses. Set NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL per environment to override.
// Only the origin is used, so a value pasted with a path (like a sign-in callback) can't break checkout and billing return links
const originOf = (value: string | undefined, fallback: string) => {
  try { return value ? new URL(value).origin : fallback } catch { return fallback }
}
export const APP_URL = originOf(process.env.NEXT_PUBLIC_APP_URL, "https://admin.tradewithpip.ai")
export const SITE_URL = originOf(process.env.NEXT_PUBLIC_SITE_URL, "https://tradewithpip.ai")
export const SUPPORT_EMAIL = "hello@tradewithpip.ai"

// The marketing site, which hosts the feedback form
export const SITE_ORIGINS = [SITE_URL, "https://tradewithpip.ai", "https://www.tradewithpip.ai"]

// Dashboard origins that may call the API while the old domain still points here
export const APP_ORIGINS = [APP_URL, "https://admin.tradewithpip.ai", "https://admin.snapchartapp.com"]
