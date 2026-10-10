import type { Metadata } from "next"
import Legal from "../components/Legal"
import { APP_URL, SITE_URL, SUPPORT_EMAIL } from "../links"

export const metadata: Metadata = { title: "Privacy Policy" }

// Keep this in step with the product: whenever a feature collects, stores or shares
// new data (or a new service provider is added), update the matching section and the date.
export default function Page() {
  const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
  return (
    <Legal title="Privacy Policy" updated="October 10, 2026">
      <h2>The short version</h2>
      <ul>
        <li>Pip never asks for your broker login and can&apos;t place, change or close trades.</li>
        <li>The extension only works on the trading sites it supports. It doesn&apos;t read the rest of your browsing.</li>
        <li>Chart screenshots are taken only when you click Analyze or send a chart.</li>
        <li>We don&apos;t sell your data or use it for advertising.</li>
        <li>You can delete your account and your data yourself, instantly, from your account page.</li>
      </ul>

      <h2>1. Who we are</h2>
      <p>
        Pip (&quot;Pip,&quot; &quot;we,&quot; &quot;our&quot; or &quot;us&quot;), formerly called Snapchart, provides the Pip Chrome extension, the
        dashboard at <a href={APP_URL}>{APP_URL.replace("https://", "")}</a> and the website at <a href={SITE_URL}>{SITE_URL.replace("https://", "")}</a> (together,
        the &quot;Service&quot;). This policy explains what information we collect, how we use it and the choices you have.
      </p>

      <h2>2. Information you give us</h2>
      <ul>
        <li><strong>Account details:</strong> your email address and, if you choose, your name. If you sign in with a password, it is stored by our authentication provider in hashed form; we never see it. If you sign in with Google, we receive your name and email from Google.</li>
        <li><strong>Setup answers:</strong> the markets and platforms you trade, whether you trade with a prop firm, and your experience level.</li>
        <li><strong>Your rules and limits:</strong> your rulesets and daily limits (such as max trades, max daily loss, losses in a row and trading hours).</li>
        <li><strong>Conversations:</strong> the messages you send Pip and Pip&apos;s replies, messages you save, and your ratings of Pip&apos;s answers.</li>
        <li><strong>Feedback:</strong> anything you tell us when you uninstall the extension or delete your account, and messages you send to support.</li>
      </ul>

      <h2>3. Information the extension collects while you trade</h2>
      <h3>3.1 Chart screenshots</h3>
      <p>
        When you click <strong>Analyze</strong> or send a message with your chart, the extension captures the visible browser tab and sends the image to our
        servers and our AI provider to produce Pip&apos;s answer. We don&apos;t store chart images on our servers. The extension keeps them in your
        browser&apos;s local storage with your chat history, and they are removed when you clear the chat, sign out or uninstall.
      </p>
      <h3>3.2 Your trades</h3>
      <p>
        When <strong>Auto-detect trades</strong> is on, the extension reads the order history and open positions shown in TradingView&apos;s trading panel,
        inside your browser. From that it records each trade: the symbol, side, quantity, entry and exit prices, fill times, order IDs, commissions, the
        calculated profit or loss, and the account name or number exactly as the panel displays it. This is sent to our servers so Pip can coach you
        and show your journal. We don&apos;t connect to your broker, never see your broker credentials, and can&apos;t place or change orders. You can turn
        Auto-detect trades off in the extension menu at any time.
      </p>
      <h3>3.3 Where the extension runs</h3>
      <p>
        The extension only runs on the trading and charting sites listed in its Chrome Web Store permissions, and on our own dashboard (to receive your
        sign-in). It does not collect your browsing history or read other websites.
      </p>
      <h3>3.4 Stored in your browser</h3>
      <p>
        The extension keeps your sign-in session, recent chat, settings (such as theme and check-in preferences) and the widget&apos;s position in your
        browser&apos;s local extension storage.
      </p>

      <h2>4. Information collected automatically</h2>
      <ul>
        <li><strong>Product usage:</strong> events such as analyses run, messages sent, check-ins shown and setup steps completed, with basic technical details, so we can count your daily allowance and improve Pip.</li>
        <li><strong>Usage counters:</strong> how much of your daily allowance you&apos;ve used and any extra usage you&apos;ve bought.</li>
        <li><strong>Logs:</strong> our hosting provider records technical data such as IP address, browser type and request times for security and reliability.</li>
        <li><strong>Website analytics:</strong> our marketing website uses Google Analytics, which sets cookies to measure visits. The dashboard and extension don&apos;t use advertising cookies.</li>
      </ul>

      <h2>5. Payments</h2>
      <p>
        Payments are handled by Stripe. We receive your Stripe customer ID, subscription status and a record of purchases (such as extra usage). We never
        receive or store your full card number.
      </p>

      <h2>6. How we use your information</h2>
      <ul>
        <li>To run the Service: answer your messages, check your charts against your rules, detect your trades, send check-ins and show your journal.</li>
        <li>To manage your account, plan, daily allowance and payments.</li>
        <li>To give support and send service messages (such as sign-in links and billing receipts).</li>
        <li>To understand how Pip is used, mostly in aggregate, so we can improve it.</li>
        <li>To keep the Service secure and prevent abuse.</li>
        <li>To meet legal obligations.</li>
      </ul>
      <p>We don&apos;t sell your personal information, share it for targeted advertising, or use it to make decisions about you beyond running the Service.</p>

      <h2>7. AI processing</h2>
      <p>
        To produce Pip&apos;s replies, we send the relevant parts of your request to our AI providers (Anthropic and OpenAI): your message, the chart image
        if you sent one, your active rules and limits, and a summary of today&apos;s trades. These providers process the data on our behalf under their
        business API terms, which don&apos;t allow them to use it to train their models by default. Pip&apos;s answers are generated by AI and can be wrong.
      </p>

      <h2>8. Who we share information with</h2>
      <p>We share information only with service providers that help us run Pip, and only what they need:</p>
      <ul>
        <li><strong>Supabase:</strong> database and sign-in</li>
        <li><strong>Vercel:</strong> website and server hosting</li>
        <li><strong>Anthropic and OpenAI:</strong> AI responses</li>
        <li><strong>Stripe:</strong> payments</li>
        <li><strong>Google:</strong> website analytics, and Google sign-in if you use it</li>
      </ul>
      <p>
        We may also disclose information if the law requires it, to protect our rights or users&apos; safety, or as part of a merger or sale of the
        business (in which case this policy continues to apply).
      </p>

      <h2>9. Chrome Web Store Limited Use</h2>
      <p>
        Pip&apos;s use of information collected by the Chrome extension complies with the Chrome Web Store User Data Policy, including its Limited Use
        requirements. We use that information only to provide and improve Pip&apos;s features described above, never to sell it, never for advertising,
        and never to determine creditworthiness or for lending.
      </p>

      <h2>10. How long we keep information, and deleting it</h2>
      <p>
        We keep your information while your account is open. You can delete your account at any time from the Account page in your dashboard. Deletion
        happens immediately and removes your account, profile, rules and limits, conversations, saved messages, detected trades, analyses, usage history
        and ratings, and cancels any subscription.
      </p>
      <p>After deletion we keep:</p>
      <ul>
        <li>An anonymous record for our own statistics: the month you signed up, your plan, how many checks, active days and trades you had, your setup answers (platforms, prop firm, experience) and the reason you gave for leaving, if any. It contains no name, email or account ID.</li>
        <li>Payment records that Stripe and we must keep for tax and accounting.</li>
        <li>Copies in encrypted backups, which are overwritten on a rolling basis.</li>
      </ul>
      <p>Signing out of the extension clears the chat stored in your browser, and uninstalling it removes all of its local data.</p>

      <h2>11. Security</h2>
      <p>
        Data is encrypted in transit, access to our systems is restricted, and server-side keys never ship in the extension. No method of transmission or
        storage is completely secure, so we can&apos;t guarantee absolute security.
      </p>

      <h2>12. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export or delete your personal information, or to object to or restrict
        how we use it. You can delete your account yourself; for anything else, email {mail} and we&apos;ll respond within 30 days. California residents:
        we do not sell or share personal information as those terms are defined in the CCPA, and we won&apos;t treat you differently for exercising your
        rights.
      </p>

      <h2>13. International transfers</h2>
      <p>Pip is run from the United States, and our providers may process data in the US and other countries. By using Pip, your information may be transferred there.</p>

      <h2>14. Children</h2>
      <p>Pip is for people 18 and older. We don&apos;t knowingly collect information from anyone under 18; if you believe we have, contact us and we&apos;ll delete it.</p>

      <h2>15. Changes to this policy</h2>
      <p>
        We&apos;ll update this page when the Service changes how it handles data, and change the date at the top. For material changes we&apos;ll also tell
        you by email or in the product.
      </p>

      <h2>16. Contact</h2>
      <p>Questions about privacy or your data: {mail}</p>
    </Legal>
  )
}
