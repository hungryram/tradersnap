# Snapchart Roadmap

Working list from the October 2026 app review. Check items off as they ship.
Status: `[x]` done · `[~]` in progress / needs deploy step · `[ ]` not started

## Next up

1. **Deploy steps waiting on you:** run `20261009_trades.sql` + `20261010_trades_fills.sql` in Supabase; publish the extension update to the Chrome Web Store (everything extension-side since 2026-10-08 is dev-only).
2. **Section 0, Phase 1** (signups): welcome page on install → Google sign-in → instant login handoff → 3-step onboarding → guided first analysis.
3. **Guardrails** (stop-for-the-day) — the payoff of trade tracking.
4. **Section 0, Phase 2** (retention): Today/Journal dashboard, end-of-day recap, weekly email.

## 0. Signups & retention (customer journey)

Goal: "Add to Chrome" → first analysis of their own chart in under 3 minutes, then a reason to return every trading day.
Today: nothing happens after install, sign-in is the default form, email confirmation loses people, onboarding is switched off, users land on an empty rules box, and nothing points them to TradingView.

**Phase 1: signups**
- [ ] Open a welcome page on install (`chrome.runtime.onInstalled`) with "pin the extension" animation + sign-up; `setUninstallURL` → one-question "why are you leaving?" page.
- [ ] Google sign-in (Supabase provider) as the main button; email one-time code as fallback; drop passwords + magic-link toggle. *You:* create Google OAuth client, add it in Supabase → Auth → Providers.
- [ ] Supabase redirect URLs: only `admin.snapchartapp.com` (+ localhost for dev), no wildcards.
- [ ] Instant login handoff: website → extension via `externally_connectable` (`chrome.runtime.sendMessage`), replacing localStorage polling; delete dead `auth-bridge.ts`.
- [ ] Refresh Supabase tokens in the extension (no more "session expired" after ~1h). *(moved from section 3)*
- [ ] Turn onboarding back on as 3 screens: (1) what you trade + platform (TradingView / Tradovate / TopstepX) + prop firm? (2) rules from a template card + **limits as numbers** (max trades/day, max daily loss, stop after N losses, trading hours) (3) "Open TradingView →".
- [ ] First-run tour in the chat widget: Analyze this chart → turn on auto-detect trades → ask the coach. Consent becomes one line in the tour instead of a blocking modal.
- [ ] Bugs: `/auth/success` failure redirects to `/auth/login` (404); hard-coded `admin.snapchartapp.com` links in `content.tsx` (no-ruleset message, etc.) → `PLASMO_PUBLIC_API_URL`.
- [ ] Funnel events in `usage_events`: installed, welcome_viewed, signed_up, onboarding_done, opened_tradingview, first_analysis, autodetect_on, returned_day2, returned_week1.
- [ ] Chrome Web Store listing: screenshots + short video of the verdict card and Today strip. *(you)*
- [ ] Question for you: where does the marketing site / "Add to Chrome" button live (separate repo?).

**Phase 2: retention**
- [ ] Dashboard redesign: dark warm theme matching the extension; sidebar Today · Journal · Rules · Saved · Account; home = Today (trades, rule adherence) instead of the rules text box.
- [ ] Journal page from `trades` (filter by day/symbol, per-trade detail).
- [ ] Guardrails using the onboarding limits (see section 3 trade tracking).
- [ ] End-of-day recap in the chat (trades, rules broken, one lesson).
- [ ] Weekly email report (biggest leak, best/worst time of day, rules broken). Needs an email provider (e.g. Resend).

**Phase 3: revenue**
- [ ] Upgrade prompts at the moment of value (limit hit right after a useful analysis) instead of a generic $19 button.
- [ ] Referral ("give a week of Pro, get a week").

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
- [ ] CORS uses `origin.includes(domain)` (e.g. `evil-tradingview.com.attacker.io` passes) and `/api/events` + `/api/trades` echo any origin. Use exact host matching; restrict `chrome-extension://` to your extension ID.

## 2. AI quality ("it seems dumb")

Plan: ship section 1 → provider layer → prompt rewrite + symbol/timeframe → eval → switch to Claude → market data.

- [x] **Provider layer** (`backend/lib/llm.ts`): routes call `analyzeChart()` / `chat()`; `AI_PROVIDER=openai|anthropic` switches. OpenAI path keeps current behavior.
- [~] **Claude path** (`claude-opus-5-5`, effort `medium` for analysis and chat (`ANTHROPIC_ANALYZE_EFFORT` to tune), structured outputs via zod, prompt caching, refusal fallbacks, screenshots downscaled to ≤2576px).
  Smoke-tested live 2026-10-08 on a synthetic 4K MNQ chart: prices/times/VWAP read correctly, rules evaluated individually, chase behavior called out. Next: test on a Vercel preview (`AI_PROVIDER=anthropic`, Preview scope only).
- [~] **Analysis latency**: 37s → 16–20s (new prompt + effort `medium`; `high` was 24s with no visible quality gain). Next: stream responses, try `low` on the eval set.
- [ ] Verify prompt-cache hits in production (`cachedTokens` > 0 on repeat chats). Smoke test prompt was below the cache minimum, so this wasn't verified.
- [ ] Decide free-tier chat model (`ANTHROPIC_MODEL_FREE`, defaults to Opus 5.5; Sonnet 5.5 is cheaper).
- [ ] Eval set: ~50 real screenshots with expected readings/rule checks; score OpenAI vs Claude before flipping production.
- [ ] Turn on reasoning for chart analysis (gpt-5.1 defaults to reasoning `none`); drop `temperature: 0.7`.
- [ ] Fix free-tier `gpt-5-mini` empty replies (reasoning tokens exhaust `max_completion_tokens: 2000`).
- [ ] Send symbol + timeframe (parse from TradingView URL/DOM) — analyze currently always gets "(not provided)".
- [ ] Feed real market data: OHLCV + computed VWAP, EMAs, ATR, prior day H/L/C, opening range as text alongside the screenshot.
- [x] **Analysis prompt rewrite** (`lib/analysis-prompt.ts`): verdict-first card (headline, wait_for, ≤3 levels), chart rules vs. self-check rules, Trade Quality % removed, current time (ET + local) sent from the extension.
- [ ] Chat prompt rewrite: remove contradictions ("max 5 lines" etc.), cut the feature list from the system prompt, move the admin buy/sell prompt out.
- [ ] Keep the full structured analysis in follow-up context instead of summary + bullets.
- [ ] Use `rules_json` (structured checklist) instead of re-interpreting free text each time.
- [ ] Either ask for `drawings` in the prompt or remove the dead overlay code.
- [ ] Provider abstraction (`llm.analyze()` / `llm.chat()`) + eval set of ~50 real screenshots; compare GPT-5.1 (reasoning on) vs Claude Opus 5.5 / Sonnet 5.5.
- [ ] Use native structured outputs instead of `json_object` + zod.

## 3. Day-trader UX

- [~] **Analysis card redesign** (extension): verdict → summary → wait for → levels → rule tally with collapsible Details. Claude.ai-style warm palette, larger text. Ships with next Chrome Web Store release.
- [ ] Self-check rules as tickable checkboxes (later: auto-fill from broker/trade log).

- [ ] ~~Refresh Supabase tokens~~ → moved to section 0, Phase 1.
- [ ] ~~Sign-in UX / hard-coded links~~ → moved to section 0, Phase 1.
- [ ] Stream responses (replace fake typing animation).
- [ ] Downscale + JPEG-compress screenshots before upload (Vercel 4.5 MB body limit; chrome.storage quota).
- [ ] Reset daily limits in user timezone or at the 6pm ET futures session, not midnight UTC.
- [ ] Trade loop: "Did you take it? Outcome?" → end-of-day review → weekly rule-break report.
- [~] Auto-detect trades from the page (no broker API). Opt-in menu toggle "Auto-detect trades".
  - [x] TradingView: rebuilds trades from the panel's **Order history** (exact fills, order IDs, scale in/out, reversals, stop/target fills, commission). The extension opens that tab once per panel load (it only populates after a first open, then updates in the background). Columns found by header code names, so any language / column order works. Watchlist fallback removed (wrong sizes, symbol often not listed).
  - [x] Chat coach sees today's trades (count, W/L, net, losing streak, each trade) via `lib/trades-context.ts`.
  - [x] Status dot in the Today strip: green tracking / amber loading history / red "open TradingView's trading panel".
  - [ ] Run `20261009_trades.sql` and `20261010_trades_fills.sql` in Supabase.
  - [ ] Confirm with a real broker connected through TradingView (table names, commission column).
  - [ ] SL/TP changes from the Activity log ("Modify position ... with TP ...") -> behavior flags (widened stop, no stop, added to loser, sized up after loss).
  - [ ] "Send tracking diagnostics" button + reader-failure events.
  - [ ] Tradovate adapter (needs DOM samples).
  - [ ] TopstepX adapter (needs DOM samples).
  - [ ] Guardrails: stop-for-the-day pause when ruleset max trades / max losses / daily loss is hit.
  - [ ] Weekly report from `trades` + analyses.
  - Limits: TradingView in Chrome only (not the desktop app); panel must be open (can be small); trades made while it's closed are picked up from history when it reopens (last 100 orders).
- [ ] Tilt detection (repeated analyses of same chart, rapid-fire messages) → suggest timeout.
- [ ] Prop-firm integration (Tradovate / TopstepX / Rithmic): import trades, enforce daily loss / max trades, hard lockouts.
- [ ] Structured rule builder (checkable rules: "above VWAP", "max 3 trades", "no trades 11:30–1:30 ET"). Numeric limits start in onboarding (section 0).

## 4. Business & code health

- [ ] Pricing page "$49 → $19" anchor — keep only if $49 was a real price (FTC).
- [ ] Split `extension/content.tsx` (2,363 lines) into hooks/components.
- [ ] Dedupe CORS helpers across routes into `lib/`.
- [ ] Fix pre-existing extension type errors (`content.tsx` implicit `any`).
