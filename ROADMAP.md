# Snapchart Roadmap

Working list from the October 2026 app review. Check items off as they ship.
Status: `[x]` done · `[~]` in progress / needs deploy step · `[ ]` not started

## 1. Security & billing (do first)

- [~] **Plan escalation via checkout** — client chose `plan`/`priceId`; anyone could buy "admin" for $19.
  Checkout now uses server-side price; webhook maps price → plan and ignores metadata; Stripe never changes admin accounts.
- [~] **Screenshot quota bypass via `isContextImage`** — context images now need a server-signed `chartToken`
  (from `/api/analyze`); without one the image is dropped from the request, not charged.
- [~] **"Unreadable chart" refund gaming** — replaced phrase matching with a structured `chart_readable` field (analyze only); chat no longer refunds.
- [~] **Non-atomic usage counters** — now `consume_usage` / `refund_usage` SQL functions (reserve before AI call, refund on failure).
  **Deploy step:** run `backend/supabase/migrations/20261008_atomic_usage.sql` in Supabase *before* deploying the backend.
- [x] **Admin endpoint default secret** — no fallback; unset `ADMIN_SECRET` disables it; constant-time compare.
- [x] **Unbounded request sizes** — max lengths on message, history (50 × 8k chars), image (~8 MB), context fields.
- [ ] Analyze `notes` can prompt-inject `chart_readable: false` to get free analyses (extension doesn't send notes; API callers can). Cap refunds per day or drop the refund.
- [ ] Chat history is client-supplied (can include fake assistant turns). Load history server-side from `chat_messages`.
- [ ] Move the admin buy/sell "thesis" prompt out of the production chat route (or gate on a hard-coded user ID).
- [ ] Plan gating ignores `subscription_status` (`past_due` keeps Pro until Stripe deletes the subscription). Decide on grace policy.
- [ ] CORS uses `origin.includes(domain)` (e.g. `evil-tradingview.com.attacker.io` passes). Use exact host matching; restrict `chrome-extension://` to your extension ID.

## 2. AI quality ("it seems dumb")

Plan: ship section 1 → provider layer → prompt rewrite + symbol/timeframe → eval → switch to Claude → market data.

- [x] **Provider layer** (`backend/lib/llm.ts`): routes call `analyzeChart()` / `chat()`; `AI_PROVIDER=openai|anthropic` switches. OpenAI path keeps current behavior.
- [~] **Claude path** (`claude-opus-5-5`, effort `high` for analysis / `medium` for chat, structured outputs via zod, prompt caching, refusal fallbacks, screenshots downscaled to ≤2576px).
  Smoke-tested live 2026-10-08 on a synthetic 4K MNQ chart: prices/times/VWAP read correctly, rules evaluated individually, chase behavior called out. Next: test on a Vercel preview (`AI_PROVIDER=anthropic`, Preview scope only).
- [ ] **Analysis latency: ~37s at effort `high`** (chat 9–16s). Too slow for day trading — try effort `medium`/`low` on the eval set, and stream responses.
- [ ] Verify prompt-cache hits in production (`cachedTokens` > 0 on repeat chats). Smoke test prompt was below the cache minimum, so this wasn't verified.
- [ ] Decide free-tier chat model (`ANTHROPIC_MODEL_FREE`, defaults to Opus 5.5; Sonnet 5.5 is cheaper).
- [ ] Eval set: ~50 real screenshots with expected readings/rule checks; score OpenAI vs Claude before flipping production.
- [ ] Turn on reasoning for chart analysis (gpt-5.1 defaults to reasoning `none`); drop `temperature: 0.7`.
- [ ] Fix free-tier `gpt-5-mini` empty replies (reasoning tokens exhaust `max_completion_tokens: 2000`).
- [ ] Send symbol + timeframe (parse from TradingView URL/DOM) — analyze currently always gets "(not provided)".
- [ ] Feed real market data: OHLCV + computed VWAP, EMAs, ATR, prior day H/L/C, opening range as text alongside the screenshot.
- [ ] Rewrite prompts: remove contradictions (no-probabilities vs `validity_estimate` %, "max 5 lines" vs 3–8 rule checks), cut the feature list from the system prompt.
- [ ] Keep the full structured analysis in follow-up context instead of summary + bullets.
- [ ] Use `rules_json` (structured checklist) instead of re-interpreting free text each time.
- [ ] Either ask for `drawings` in the prompt or remove the dead overlay code.
- [ ] Provider abstraction (`llm.analyze()` / `llm.chat()`) + eval set of ~50 real screenshots; compare GPT-5.1 (reasoning on) vs Claude Opus 5.5 / Sonnet 5.5.
- [ ] Use native structured outputs instead of `json_object` + zod.

## 3. Day-trader UX

- [ ] Refresh Supabase tokens in the extension (sessions currently die after ~1h mid-session).
- [ ] Stream responses (replace fake typing animation).
- [ ] Downscale + JPEG-compress screenshots before upload (Vercel 4.5 MB body limit; chrome.storage quota).
- [ ] Reset daily limits in user timezone or at the 6pm ET futures session, not midnight UTC.
- [ ] Trade loop: "Did you take it? Outcome?" → end-of-day review → weekly rule-break report.
- [ ] Tilt detection (repeated analyses of same chart, rapid-fire messages) → suggest timeout.
- [ ] Prop-firm integration (Tradovate / TopstepX / Rithmic): import trades, enforce daily loss / max trades, hard lockouts.
- [ ] Structured rule builder (checkable rules: "above VWAP", "max 3 trades", "no trades 11:30–1:30 ET").

## 4. Business & code health

- [ ] Pricing page "$49 → $19" anchor — keep only if $49 was a real price (FTC).
- [ ] Split `extension/content.tsx` (2,363 lines) into hooks/components.
- [ ] Dedupe CORS helpers across routes into `lib/`.
- [ ] Fix pre-existing extension type errors (`content.tsx` implicit `any`).
