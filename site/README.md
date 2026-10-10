# Snapchart marketing site

The public site at www.snapchartapp.com: landing page, pricing, FAQ, guide, contact, privacy and terms.

```
pnpm dev:site     # http://localhost:3003
pnpm build:site
```

## Deploy (Vercel)

Its own Vercel project from this repo with **Root Directory = `site`**. It only rebuilds when files in `site/` change.

Optional environment variables (defaults are the production values):

- `NEXT_PUBLIC_CHROME_STORE_URL`
- `NEXT_PUBLIC_APP_URL` (the dashboard, admin.snapchartapp.com)
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_GA_ID` (Google Analytics)

## Keep in sync

Plan limits and prices in `app/components/Pricing.tsx` and `app/components/Faq.tsx` mirror `backend/lib/usage.ts` and the dashboard's account page.
