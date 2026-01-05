# Copilot Development Instructions — AI Trading Psychology Overlay (Chrome Extension MVP)

You are GitHub Copilot assisting in the development of a **paid Chrome extension** that overlays a floating AI widget on trading charts and other screens.  
The AI analyzes chart screenshots **in context of the user’s rules and psychology** and returns **non-actionable guidance**, including **levels to watch**, rule alignment, and behavioral coaching.

This product **must never give buy/sell instructions**.  
It exists to **prevent bad trades, reinforce discipline, and surface context** — not to predict markets.

---

## PRODUCT NORTH STAR

> **“An AI that stops traders from breaking their rules and helps them focus on the right areas of the chart.”**

Success is measured by:
- Reduced impulsive behavior
- Fewer rule violations
- Increased patience and consistency
- User trust (not prediction accuracy)

---

## NON-NEGOTIABLE AI RULES

### The AI MAY:
- Evaluate screenshots against the user’s rules
- Identify **levels to watch** (support/resistance, structure, zones)
- Flag rule violations or missing confirmations
- Provide calm, neutral behavioral coaching
- Encourage waiting, risk awareness, and discipline
- Return a structured verdict: `pass | warn | fail`

### The AI MUST NOT:
- Say “buy”, “sell”, “long”, “short”
- Provide entry, exit, stop-loss, or target prices
- Predict direction, probability, or expected profit
- Give personalized financial advice
- Use authoritative or overconfident language
- Shame, guilt, or pressure the user

**If uncertain, default to `warn` and request more confirmation.**

---

## “LEVELS TO WATCH” — ALLOWED FEATURE

### What “Levels to Watch” Means
The AI may highlight **areas of interest**, not actions.

Allowed examples:
- Prior swing high / swing low
- Range high / range low
- Support / resistance zones
- EMA zone (e.g., “9/20 EMA area”)
- VWAP area (only if visible)
- Gap fill area
- Session high / low (if visible)
- Invalidation area (e.g., “below pullback low”)

### Language Rules
✅ Allowed phrasing:
- “Key level above: prior swing high (possible resistance).”
- “Watch for reaction near the EMA cluster.”
- “This area may act as support/resistance.”
- “Invalidation would occur below the pullback low.”

❌ Forbidden phrasing:
- “Buy at 18642.”
- “Enter on the break.”
- “Sell at resistance.”
- “Target ___.”

**The AI may say where attention should be, never what action to take.**

### MVP Rule
- Prefer **zones and relative descriptions**
- Avoid exact numeric prices
- Numeric prices may be added later only with uncertainty disclaimers

---

## HIGH-LEVEL ARCHITECTURE

### Components
1. **Chrome Extension**
   - Built with Plasmo + React + TypeScript
   - Injects a floating widget overlay on allowed pages
   - Captures visible tab screenshots
   - Sends data to backend
   - Displays structured AI responses

2. **Backend API**
   - Next.js 15 (App Router) on Vercel
   - Validates auth + subscription
   - Enforces usage limits
   - Calls OpenAI Vision
   - Returns strict JSON

3. **Supabase**
   - Auth (email magic link for MVP)
   - Postgres database
   - Usage + ruleset storage

4. **Stripe**
   - Subscription billing
   - Webhooks update user status

---

## EXTENSION UX REQUIREMENTS

### Floating Widget
- Always visible on allowed pages
- Expand/collapse chat-style panel
- Never blocks chart interaction
- Clear “Analyze” button

### Triggers
- Click “Analyze”
- Keyboard shortcut: `Cmd/Ctrl + Shift + A`

### Capture
- Use `chrome.tabs.captureVisibleTab`
- Full visible tab screenshot for MVP
- No continuous monitoring

---

## AUTH FLOW (EXTENSION)

- User logs in via hosted web page
- Supabase Auth issues session
- Extension retrieves JWT securely
- JWT sent with every API request

**Do not embed auth secrets in the extension.**

---

## PAYMENTS & USAGE CONTROL

### Subscription Enforcement
On every `/api/analyze` request:
1. Validate Supabase JWT
2. Check `subscription_status` (`active` or `trialing`)
3. Check usage quota
4. Atomically increment usage
5. Call OpenAI
6. Return response

Reject requests with:
- `401` unauthenticated
- `402` inactive subscription
- `429` quota exceeded

### Usage Model (example)
- Free: 5–10 analyses/month
- Pro: 200–300 analyses/month

Quota enforcement must be **server-side and atomic**.

---

## DATABASE TABLES (SUPABASE)

### `profiles`
- `id` (uuid, matches auth user)
- `email`
- `stripe_customer_id`
- `plan`
- `subscription_status`
- `created_at`

### `rulesets`
- `id`
- `user_id`
- `name`
- `rules_text` (human readable)
- `rules_json` (structured checklist)
- `created_at`

### `usage`
- `user_id`
- `period_start`
- `used_count`
- `limit_count`
- unique `(user_id, period_start)`

### `analyses` (optional MVP)
- `id`
- `user_id`
- `ruleset_id`
- `verdict`
- `payload`
- `created_at`

**Do not persist screenshots long-term in MVP.**

---

## BACKEND API CONTRACT

### `POST /api/analyze`

Request:
```json
{
  "rulesetId": "uuid",
  "context": {
    "symbol": "MNQ",
    "timeframe": "2m",
    "notes": "EMA pullback attempt"
  },
  "image": "data:image/png;base64,..."
}

{
  "verdict": "pass | warn | fail",
  "summary": "Short neutral title",
  "bullets": ["Key observation", "Another observation"],
  "levels_to_watch": [
    {
      "label": "Prior swing high",
      "type": "resistance",
      "relative_location": "above current price",
      "why_it_matters": "Area of potential reaction; aligns with your rule to wait for confirmation.",
      "confidence": "medium"
    }
  ],
  "rule_violations": [],
  "missing_confirmations": [],
  "behavioral_nudge": "One calm, non-judgmental sentence.",
  "follow_up_question": "Optional clarification question"
}

## AI Prompting Guidelines

### System Intent
- Act as a **rule-based evaluator** and **behavioral mirror**
- Prioritize **discipline** over **opportunity**
- Be **conservative** and **uncertainty-aware**
- **Never** suggest trades or outcomes (no predictions, no buy/sell)

### Input Context
- User ruleset (`rules_text` + `rules_json`)
- Screenshot of chart
- User-provided context (symbol, timeframe, notes)
- Optional: recent behavior summary (later)

### Output Enforcement
- Use **JSON schema validation** on every model response
- If output violates rules:
  1. **Retry once** with stricter instructions
  2. Fallback to `verdict: "warn"` with minimal, safe content

---

## Security Requirements
- OpenAI API key: **server-side only**
- Validate **Supabase JWT** on backend (never trust client `user_id`)
- Enforce **quotas server-side** (atomic increment/check)
- Limit image size and **compress** before sending
- Apply **strict CORS** (web + extension origins only)
- **No raw image logging** (store metadata only)

---

## MVP Scope (Keep It Tight)

### Included
- Paid auth (Supabase)
- Subscription gating (Stripe)
- Usage quotas (server-side, atomic)
- Floating overlay widget
- Screenshot → AI analysis
- Levels to watch (**zones only**, relative descriptions)

### Excluded (V2+)
- Buy/sell signals
- Exact price levels
- Broker integrations
- Continuous chart monitoring
- Full trade journaling
- Desktop overlays (Thinkorswim native)

---

## Definition of Done (MVP)
A paying user can:
1. Create an account  
2. Subscribe  
3. Define a ruleset  
4. Open a chart anywhere in Chrome  
5. Click **Analyze** (or use hotkey)  
6. Receive a structured verdict + levels to watch  
7. Be blocked when quota is hit or subscription expires  

**No predictions. No trade instructions. Costs controlled. Trust preserved.**


