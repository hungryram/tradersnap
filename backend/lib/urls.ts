// Public addresses. Set NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL per environment to override.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.tradewithpip.ai"
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tradewithpip.ai"
export const SUPPORT_EMAIL = "help@snapchartapp.com"

// Dashboard origins that may call the API while the old domain still points here
export const APP_ORIGINS = [APP_URL, "https://app.tradewithpip.ai", "https://admin.snapchartapp.com"]
