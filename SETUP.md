# Trading Buddy Setup Guide

## Prerequisites
- Node.js 20+ 
- pnpm (`npm install -g pnpm`)
- Supabase account
- OpenAI API key
- Stripe account

## 1. Install Dependencies

```bash
pnpm install
```

## 2. Supabase Setup

1. Create a new project at https://supabase.com
2. Run the SQL schema in `supabase-schema.sql` in the SQL Editor
3. Copy your project URL and keys

## 3. Environment Setup

### Backend (`backend/.env`)
```bash
cd backend
cp .env.example .env
```

Fill in:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`

### Extension (`extension/.env`)
```bash
cd extension
cp .env.example .env
```

Fill in:
- `PLASMO_PUBLIC_SUPABASE_URL` and `PLASMO_PUBLIC_SUPABASE_ANON_KEY`
- `PLASMO_PUBLIC_API_URL` (http://localhost:3000 for dev)

## 4. Run Development Servers

From root:
```bash
pnpm dev
```

Or individually:
```bash
# Backend
pnpm dev:backend

# Extension
pnpm dev:extension
```

## 5. Load Extension in Chrome

1. Build the extension: `pnpm build:extension`
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `extension/build/chrome-mv3-dev`

## 6. Stripe Setup

1. Create products in Stripe Dashboard
2. Set up webhook endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Add webhook secret to backend `.env`

## 7. Test Flow

1. Open any webpage in Chrome
2. Click extension icon or use `Cmd/Ctrl + Shift + A`
3. Click "Analyze Chart"
4. Check console for logs

## Next Steps

- [ ] Set up Supabase Auth UI for login
- [ ] Create ruleset management UI
- [ ] Deploy backend to Vercel
- [ ] Submit extension to Chrome Web Store
