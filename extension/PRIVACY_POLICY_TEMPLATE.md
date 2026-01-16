# Privacy Policy for Snapchart Chrome Extension

**Last Updated:** January 11, 2026

## Overview

Snapchart ("we", "our", or "us") provides an AI-powered trading psychology coaching extension for Google Chrome. This privacy policy explains how we collect, use, and protect your information when you use our extension.

## Information We Collect

### 1. Account Information
- **Email address**: Used for account creation and authentication
- **Authentication tokens**: Standard OAuth tokens from Supabase for secure login
- **User preferences**: Theme settings, chat widget position, text size

### 2. Trading Chart Screenshots
- **What**: Images of your trading charts captured when you click "Analyze Chart"
- **When**: Only when you explicitly click the "Analyze Chart" button in our extension
- **How Used**: Sent to our API for AI analysis, then deleted after analysis is complete
- **Storage**: Not permanently stored; used only for immediate AI processing

### 3. Chat Messages
- **What**: Messages you type in the chat interface
- **When**: Only messages you intentionally send
- **How Used**: Sent to our AI API to provide coaching responses
- **Storage**: Stored in your account to maintain conversation history

### 4. Usage Data
- **What**: Number of analyses performed, messages sent (for billing/limits)
- **When**: Tracked when you use the extension's features
- **How Used**: To enforce usage limits and manage subscriptions

## Information We Do NOT Collect

We explicitly DO NOT collect:
- ❌ Your trading account credentials or login information
- ❌ Trading account balances or positions
- ❌ Browsing history from non-trading websites
- ❌ Cookies from other websites
- ❌ Personal information beyond email address
- ❌ Trading execution data or order history
- ❌ Credit card information (handled by Stripe)

## How We Use Your Information

### AI Analysis
- Chart screenshots are analyzed by AI to provide trading psychology feedback
- Your custom trading rules (defined by you) are used to personalize analysis
- Messages are processed to provide relevant coaching responses

### Service Improvement
- Usage patterns help us improve AI responses
- Aggregated, anonymized data may be used to improve features

### Account Management
- Email is used for account notifications (login, password reset)
- Usage data is used to manage subscription limits

## Data Storage & Security

### Storage Locations
- **Local Storage**: Theme preferences, widget position, cached messages (stored in your browser)
- **Cloud Storage**: Account data, chat history, trading rules (stored securely on Supabase)
- **Temporary Processing**: Chart screenshots (processed by AI, then deleted)

### Security Measures
- Industry-standard encryption (HTTPS/TLS)
- Secure authentication via Supabase OAuth
- No permanent storage of chart screenshots
- Regular security audits

## Third-Party Services

We use the following third-party services:

### Supabase (Authentication & Database)
- **Purpose**: User authentication and data storage
- **Data Shared**: Email, chat messages, trading rules
- **Privacy Policy**: https://supabase.com/privacy

### OpenAI / Anthropic (AI Analysis)
- **Purpose**: AI-powered chart analysis and coaching
- **Data Shared**: Chart screenshots (temporarily), chat messages
- **Privacy Policy**: [OpenAI](https://openai.com/privacy) / [Anthropic](https://anthropic.com/privacy)

### Stripe (Payment Processing)
- **Purpose**: Subscription billing
- **Data Shared**: Payment information (we never see your credit card details)
- **Privacy Policy**: https://stripe.com/privacy

## Your Rights

### Access Your Data
You can view all your data by logging into your dashboard at https://admin.snapchartapp.com

### Delete Your Data
You can request complete data deletion by:
1. Logging into your account
2. Going to Account Settings
3. Clicking "Delete Account"
4. Or emailing support@snapchartapp.com

### Export Your Data
Request a data export by emailing support@snapchartapp.com

### Opt-Out
You can uninstall the extension at any time to stop all data collection

## Chrome Extension Permissions

### Why We Need Permissions

#### `<all_urls>` (Host Permissions)
- **Purpose**: Required by Chrome's API to capture screenshots from content scripts
- **What We Do**: Inject chat widget on trading platforms, capture screenshots when you click "Analyze Chart"
- **What We Don't Do**: We do not track browsing history, read cookies from other sites, or access credentials

#### `tabs`
- **Purpose**: Required for `chrome.tabs.captureVisibleTab()` API
- **What We Do**: Capture chart screenshots when you click the button
- **What We Don't Do**: We do not automatically track or capture tabs

#### `storage`
- **Purpose**: Store preferences and chat history locally
- **What We Do**: Save theme, widget position, cached messages
- **What We Don't Do**: Data stays local; we don't sync with external services

#### `scripting`
- **Purpose**: Inject chat widget on trading websites
- **What We Do**: Add our chat interface overlay to trading platforms
- **What We Don't Do**: We do not modify page content, execute trades, or automate actions

### Navigation to Our Domain
The extension opens our website (admin.snapchartapp.com) when you:
- Click "Sign In" button
- Click "Open Dashboard" button
- Click "Sign Out" button

**This is standard functionality** for extensions that integrate with web applications. We do NOT modify your browser's default homepage, search engine, or new tab page.

## Children's Privacy

Our service is not directed to children under 13. We do not knowingly collect information from children under 13.

## International Users

Our services are hosted in [Your Server Location]. By using our extension, you consent to the transfer of your data to [Location].

## Changes to This Policy

We may update this privacy policy periodically. We will notify users of significant changes via:
- Email notification
- Notice in the extension
- Updated "Last Updated" date at the top of this policy

## Contact Us

If you have questions or concerns about this privacy policy:

**Email**: support@snapchartapp.com  
**Website**: https://admin.snapchartapp.com  
**Address**: [Your Business Address]

## Legal Basis for Processing (GDPR)

If you are in the European Economic Area (EEA):

- **Consent**: You provide consent when you create an account and use the extension
- **Contract**: Processing is necessary to provide our service
- **Legitimate Interest**: We have legitimate interest in improving our service

## Data Retention

- **Chart Screenshots**: Deleted immediately after analysis (within seconds)
- **Chat Messages**: Retained for the life of your account or until you delete them
- **Account Data**: Retained until you delete your account
- **Usage Logs**: Retained for 90 days for security purposes

## California Privacy Rights (CCPA)

California residents have additional rights:
- Right to know what personal data we collect
- Right to delete personal data
- Right to opt-out of data sale (Note: We do NOT sell your data)
- Right to non-discrimination for exercising privacy rights

To exercise these rights, email support@snapchartapp.com

## Compliance

We comply with:
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)
- Chrome Web Store Developer Program Policies

---

**By using Snapchart, you agree to this privacy policy.**

Last Updated: January 11, 2026
