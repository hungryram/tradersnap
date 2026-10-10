import type { Metadata } from "next"
import Legal from "../components/Legal"
import { APP_URL, SITE_URL, SUPPORT_EMAIL } from "../links"

export const metadata: Metadata = { title: "Terms of Service" }

// Keep this in step with the product: update it (and the date) when plans, payments,
// features or how Pip can be used change.
export default function Page() {
  const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
  return (
    <Legal title="Terms of Service" updated="October 10, 2026">
      <h2>1. Acceptance of these terms</h2>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of Pip, formerly called Snapchart: the Pip Chrome extension, the dashboard at{" "}
        <a href={APP_URL}>{APP_URL.replace("https://", "")}</a> and the website at <a href={SITE_URL}>{SITE_URL.replace("https://", "")}</a> (together,
        the &quot;Service&quot;), provided by Pip (&quot;Pip,&quot; &quot;we,&quot; &quot;our&quot; or &quot;us&quot;). By creating an account, installing the
        extension or using the Service, you agree to these Terms and to our <a href="/privacy">Privacy Policy</a>. If you don&apos;t agree, don&apos;t use
        the Service.
      </p>

      <h2>2. Not financial advice: read this carefully</h2>
      <ul>
        <li><strong>Pip is not a financial advisor.</strong> We are not registered as a broker-dealer, investment adviser, commodity trading advisor or financial institution. The Service is an educational and discipline tool only.</li>
        <li><strong>Pip does not tell you what to trade.</strong> It compares what you show it against rules you wrote yourself. Nothing in the Service (whether AI-generated or otherwise) is a recommendation or solicitation to buy, sell or hold any security, future, option, currency or other instrument, and nothing is a signal, prediction or entry, exit, stop or target.</li>
        <li><strong>AI is unreliable.</strong> AI-generated content may be inaccurate, incomplete, misleading, outdated or simply wrong, including how it reads your chart and whether a setup matches your rules. Verify everything yourself.</li>
        <li><strong>You are solely responsible</strong> for every trading decision you make and its results, whether or not you used the Service, followed or ignored its feedback, or relied on its trade tracking.</li>
        <li><strong>No guarantees.</strong> We make no promise that using Pip will improve your discipline, results or profitability.</li>
        <li><strong>Trading involves substantial risk.</strong> You can lose more than you invest. Leverage, margin and derivatives can magnify losses. Only trade with money you can afford to lose. Past performance does not indicate future results.</li>
        <li><strong>Consult licensed professionals</strong> before making investment decisions.</li>
      </ul>

      <h2>3. Eligibility</h2>
      <p>You must be at least 18, able to form a binding contract, and not barred from using the Service under applicable law. You are responsible for complying with the laws that apply to you, including those about trading.</p>

      <h2>4. Your account</h2>
      <ul>
        <li>Give accurate information and keep your sign-in secure. Sign-in links and codes are for you only.</li>
        <li>One person per account. Don&apos;t share your account.</li>
        <li>You&apos;re responsible for activity under your account. Tell us promptly at {mail} if you think someone else has accessed it.</li>
      </ul>

      <h2>5. What the Service does, and its limits</h2>
      <ul>
        <li><strong>Chart checks and chat.</strong> When you ask, Pip captures your chart and gives AI-generated feedback based on your rules.</li>
        <li><strong>Trade tracking.</strong> Where supported, the extension reads trades from the trading panel shown in your browser. Detection depends on what the platform displays and may be incomplete, delayed or wrong. Don&apos;t rely on it as your official record of trades, profits, losses or taxes; your broker&apos;s statements are the record.</li>
        <li><strong>Check-ins, limits and cooldowns.</strong> Pip&apos;s check-ins, daily-limit warnings and cooldown timers are reminders. They don&apos;t block, place, change or close orders, and you remain in full control of your trading.</li>
        <li><strong>Third-party platforms.</strong> The Service works alongside sites such as TradingView, Tradovate and Topstep. We aren&apos;t affiliated with or endorsed by them, their names and marks belong to their owners, and they can change their sites in ways that stop features from working. Your use of those platforms is governed by their own terms.</li>
        <li><strong>Changes and availability.</strong> We may add, change or remove features, and we don&apos;t guarantee the Service will always be available or error-free.</li>
      </ul>

      <h2>6. Plans, usage and payments</h2>
      <ul>
        <li><strong>Free and Pro.</strong> The Free plan and the Pro subscription each include a daily usage allowance, which resets at midnight UTC. Allowances are approximate (a chart check uses more than a message) and we may adjust them.</li>
        <li><strong>Subscriptions.</strong> Pro renews automatically each billing period until you cancel. Cancel any time in your account&apos;s billing settings; you keep Pro until the end of the period you&apos;ve paid for. You authorize us, through Stripe, to charge your payment method for each renewal.</li>
        <li><strong>Extra usage.</strong> You can buy extra usage as a one-time purchase. It is used after your daily allowance, doesn&apos;t expire while your account is open, has no cash value, can&apos;t be transferred, and ends when your account is deleted or terminated.</li>
        <li><strong>Prices.</strong> We may change prices. For existing subscriptions we&apos;ll give at least 30 days&apos; notice before a change applies to you. Introductory or launch prices may end at any time for new purchases.</li>
        <li><strong>Refunds.</strong> Payments are non-refundable except where the law requires otherwise. We don&apos;t give refunds for trading losses or for how you used the Service&apos;s feedback.</li>
        <li><strong>Taxes and failed payments.</strong> Prices may not include taxes. If a payment fails, we may downgrade or suspend paid features.</li>
      </ul>

      <h2>7. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for anything illegal, or to give financial advice or signals to others.</li>
        <li>Resell, sublicense or redistribute the Service or its output as a product or service.</li>
        <li>Reverse engineer, decompile or copy the extension or Service, except where the law allows despite this restriction.</li>
        <li>Get around usage limits, security or access controls, or use bots or automation to access the Service.</li>
        <li>Interfere with or overload the Service, or upload malicious code.</li>
        <li>Impersonate anyone or give false information.</li>
      </ul>

      <h2>8. Your content</h2>
      <p>
        You own what you put into the Service: your rules, messages, chart images and trade data (&quot;Your Content&quot;). You give us a worldwide,
        non-exclusive, royalty-free license to host, process and display Your Content only as needed to run, secure and improve the Service, including
        sending it to our service providers as described in the Privacy Policy. You confirm you have the right to share Your Content with us. This license
        ends when you delete Your Content or your account, except for the anonymous statistics described in the Privacy Policy.
      </p>

      <h2>9. Our property</h2>
      <p>
        The Service, including the Pip name and character, software, design and content, belongs to us and is protected by intellectual property laws. We
        give you a personal, non-transferable, revocable license to use the Service under these Terms. Don&apos;t use our name, character or logos without
        written permission. If you send us feedback or ideas, we may use them without obligation to you.
      </p>

      <h2>10. Ending your use</h2>
      <p>
        You can stop using Pip at any time and delete your account from the Account page in your dashboard, which also cancels any subscription. We may
        suspend or end your access if you break these Terms, if required by law, or to protect the Service or other users. Sections that by their nature
        should survive (including 2, 8, 11 to 14) survive termination.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND,
        WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY AND NON-INFRINGEMENT. We don&apos;t warrant that
        AI output, chart readings, trade detection, check-ins or usage counts will be accurate, complete, timely or uninterrupted.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW:</p>
      <ul>
        <li><strong>We are not liable</strong> for any trading losses, missed opportunities or lost profits, however caused, including any reliance on AI output, chart checks, trade tracking, check-ins, limits or any other part of the Service.</li>
        <li><strong>We are not liable</strong> for AI errors, bugs, downtime, data loss, or changes made by third-party platforms.</li>
        <li><strong>We are not liable</strong> for indirect, incidental, consequential, special, exemplary or punitive damages, even if told they were possible.</li>
        <li><strong>Our total liability</strong> for all claims relating to the Service shall not exceed the lesser of (a) $100 USD or (b) the amount you paid us in the 12 months before the claim.</li>
        <li><strong>California residents:</strong> you waive California Civil Code Section 1542, which says: &quot;A general release does not extend to claims that the creditor or releasing party does not know or suspect to exist in his or her favor at the time of executing the release and that, if known by him or her, would have materially affected his or her settlement with the debtor or released party.&quot;</li>
      </ul>
      <p>Some places don&apos;t allow certain limits on liability, so some of these may not apply to you.</p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to defend, indemnify and hold harmless Pip and its owners, employees and agents from claims, losses and expenses (including reasonable
        legal fees) arising from your use of the Service, your trading, Your Content, or your breach of these Terms or anyone else&apos;s rights.
      </p>

      <h2>14. Disputes</h2>
      <h3>14.1 Governing law</h3>
      <p>These Terms are governed by the laws of the State of California, without regard to conflict-of-law rules.</p>
      <h3>14.2 Binding arbitration</h3>
      <p>
        Any dispute relating to these Terms or the Service will be resolved by binding individual arbitration administered by the American Arbitration
        Association under its Consumer Arbitration Rules, held in California or remotely. Either of us may instead bring a qualifying claim in small claims
        court.
      </p>
      <p>
        <strong>Class action waiver:</strong> you and we may bring claims only individually, not as a plaintiff or class member in any class, collective or
        representative action.
      </p>
      <h3>14.3 Costs</h3>
      <p>Each party bears its own costs and attorneys&apos; fees, unless the arbitrator or the law provides otherwise.</p>

      <h2>15. California consumer notice</h2>
      <p>
        California residents may contact the Complaint Assistance Unit of the Division of Consumer Services of the California Department of Consumer
        Affairs in writing at 1625 North Market Blvd., Suite N 112, Sacramento, CA 95834, or by telephone at (916) 445-1254 or (800) 952-5210.
      </p>

      <h2>16. Other terms</h2>
      <ul>
        <li><strong>Where Pip is available:</strong> the Service may not be appropriate or available everywhere, and you&apos;re responsible for following local laws.</li>
        <li><strong>Regulatory status:</strong> we don&apos;t hold, manage or have access to your funds or brokerage accounts.</li>
        <li><strong>Events outside our control:</strong> we aren&apos;t responsible for failures caused by events beyond our reasonable control, such as outages of internet, hosting or AI providers, natural disasters or government action.</li>
        <li><strong>Severability:</strong> if part of these Terms is unenforceable, the rest stays in effect.</li>
        <li><strong>No waiver:</strong> not enforcing a term isn&apos;t a waiver of it.</li>
        <li><strong>Assignment:</strong> you can&apos;t transfer these Terms; we may as part of a merger, acquisition or sale of assets.</li>
        <li><strong>Entire agreement:</strong> these Terms and the Privacy Policy are the whole agreement between you and us about the Service.</li>
      </ul>

      <h2>17. Changes to these Terms</h2>
      <p>
        We may update these Terms as the Service changes, and we&apos;ll change the date at the top. For material changes we&apos;ll tell you by email or in
        the product before they take effect. Continuing to use the Service after that means you accept the updated Terms.
      </p>

      <h2>18. Contact</h2>
      <p>Questions about these Terms: {mail}</p>
    </Legal>
  )
}
