import type { Metadata } from "next"
import Legal from "../components/Legal"

export const metadata: Metadata = { title: "Privacy Policy" }

// Wording from the previous site (January 25, 2026), renamed from Snapchart to Pip on October 10, 2026
export default function Page() {
  return (
    <Legal title="Privacy Policy" updated="October 10, 2026">
<h2>1. Introduction</h2>
<p>Pip (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the Pip Chrome extension and website (collectively, the &quot;Service&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.</p>
<h2>2. Information We Collect</h2>
<p>We collect information to provide AI-powered chart analysis, remember your trading preferences, and continuously improve the Service. The data we collect includes:</p>
<h3>2.1 Information You Provide</h3>
<ul>
<li>Account information (email, password)</li>
<li>Trading rules and preferences you configure</li>
<li>Chat messages and questions you submit to the AI</li>
<li>Saved messages and favorites</li>
</ul>
<h3>2.2 Automatically Collected Information</h3>
<ul>
<li>Device information (browser type, operating system)</li>
<li>Usage data (features used, interaction patterns)</li>
<li>Log data (IP address, timestamps, error logs)</li>
<li>Cookies and similar tracking technologies</li>
</ul>
<h3>2.3 Information We Do NOT Collect</h3>
<ul>
<li>Brokerage account credentials or API keys</li>
<li>Personal financial information</li>
<li>Social security numbers or tax IDs</li>
</ul>
<h2>3. How We Use Your Information</h2>
<ul>
<li>Provide and maintain the Service</li>
<li>Process AI analysis requests</li>
<li>Remember your trading rules and preferences</li>
<li>Improve and personalize your experience</li>
<li>Send service-related communications</li>
<li>Detect and prevent fraud or abuse</li>
<li>Comply with legal obligations</li>
</ul>
<h2>4. Data Sharing and Disclosure</h2>
<h3>4.1 Third-Party Services</h3>
<p>We use the following third-party services that may access your data:</p>
<ul>
<li>
<strong>OpenAI/Anthropic:</strong> For AI-powered chart analysis and chat functionality</li>
<li>
<strong>Supabase:</strong> For authentication and database storage</li>
<li>
<strong>Google Analytics:</strong> For usage analytics and performance monitoring</li>
</ul>
<h3>4.2 We Do NOT Sell Your Data</h3>
<p>We do not sell, rent, or trade your personal information to third parties for marketing purposes.</p>
<h3>4.3 Legal Requirements</h3>
<p>We may disclose your information if required by law, court order, or government request, or to protect our rights and safety.</p>
<h2>5. Data Security</h2>
<p>We implement industry-standard security measures including:</p>
<ul>
<li>End-to-end encryption for data transmission</li>
<li>Secure authentication with hashed passwords</li>
<li>Regular security audits and updates</li>
<li>Access controls and monitoring</li>
</ul>
<p>However, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security of your data.</p>
<h2>6. Data Retention</h2>
<p>We retain your information for as long as your account is active or as needed to provide services. You may request deletion of your data at any time by contacting us at <a href="mailto:help@snapchartapp.com">help@snapchartapp.com</a>.</p>
<h2>7. Your Rights</h2>
<p>You have the right to:</p>
<ul>
<li>Access your personal information</li>
<li>Correct inaccurate data</li>
<li>Request deletion of your data</li>
<li>Export your data</li>
<li>Opt-out of marketing communications</li>
<li>Withdraw consent for data processing</li>
</ul>
<h2>8. Cookies and Tracking</h2>
<p>We use cookies and similar technologies to enhance your experience. You can control cookie preferences through your browser settings. Disabling cookies may limit some functionality.</p>
<h2>9. International Data Transfers</h2>
<p>Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place for international transfers.</p>
<h2>10. Children&#x27;s Privacy</h2>
<p>Our Service is not intended for users under 18 years of age. We do not knowingly collect information from children under 18.</p>
<h2>11. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated &quot;Last Updated&quot; date. Continued use of the Service after changes constitutes acceptance.</p>
<h2>12. Contact Us</h2>
<p>For questions about this Privacy Policy or your data, contact us at:</p>
<p>Email: <a href="mailto:help@snapchartapp.com">help@snapchartapp.com</a>
</p>
    </Legal>
  )
}
