# Chrome Web Store: permissions and data (Pip 1.1.0)

Paste-ready answers for the Privacy practices tab. Keep in sync with `package.json` (manifest) and the privacy policy at https://tradewithpip.ai/privacy.

## Single purpose

Pip is an AI trading-discipline coach that sits on the trader's chart: it checks a chart against the trader's own written rules when they ask, tracks their trades from the trading panel, and reminds them of their own limits (losing streaks, max trades, daily loss). It does not give trading signals or place trades.

## Permissions

**activeTab**
Used when the trader opens Pip with the keyboard shortcut or the toolbar button, so Pip can capture the chart in the tab they're on when they ask for a chart check.

**tabs**
`chrome.tabs.captureVisibleTab` takes the chart screenshot when the trader clicks "Analyze this chart" or sends a message with their chart. Also used to open the dashboard (sign in, rules, account) in a new tab and to send an open dashboard tab to its sign-out page. Screenshots are never taken automatically.

**storage**
Keeps the sign-in session, recent chat, settings (theme, check-in preference, widget position) and today's check-in state in the browser.

**alarms**
Refreshes the sign-in session in the background (about once a minute while it's close to expiring) so the trader isn't signed out mid-session.

**Host permission (`<all_urls>`)**
`chrome.tabs.captureVisibleTab` requires the `<all_urls>` host permission (or activeTab from a toolbar click); traders start chart checks from the widget on the page, so activeTab alone doesn't cover it. The content script itself only runs on the listed trading and charting sites (TradingView, Tradovate, TopstepX, brokers and exchanges) and on our dashboard; Pip doesn't read or change other websites.

**externally_connectable** (admin.tradewithpip.ai, admin.snapchartapp.com)
Lets the Pip dashboard hand the trader's sign-in to the extension after they log in on the website, and sign it out.

**Remote code:** none. All code ships in the package; the extension only calls our API (admin.tradewithpip.ai) for data.

## Data usage (what to tick)

- **Personally identifiable information:** email address, optional first name (account).
- **Authentication information:** sign-in session tokens.
- **Personal communications:** messages the trader sends to Pip and Pip's replies.
- **Financial and payment information:** trade history detected from the trading panel (symbol, size, prices, profit or loss). Payments are handled by Stripe on the website, not the extension.
- **User activity:** feature usage events (chart checks, messages, check-ins shown).
- **Website content:** chart screenshots, only when the trader asks for a chart check.

Not collected: health, location, web browsing history.

Certify:
- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to the extension's single purpose.
- Data is not used or transferred to determine creditworthiness or for lending.
