"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import DashboardNav from "../components/DashboardNav"

export default function FAQPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/')
      return
    }
    setIsLoading(false)
  }

  const faqSections = [
    {
      title: "Getting Started",
      questions: [
        {
          q: "How do I install the Snapchart extension?",
          a: (
            <>
              <a 
                href="https://chromewebstore.google.com/detail/bppbpeodpbepcmjifjjihejcnofdnibe?utm_source=item-share-cb"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline font-medium"
              >
                Install the extension from the Chrome Web Store
              </a>
              . After installation, click the extension icon in your browser toolbar, sign in with your account, and you're ready to analyze charts!
            </>
          )
        },
        {
          q: "Why does the extension need certain permissions?",
          a: "Snapchart needs permission to capture chart screenshots from trading platforms (like TradingView) and to communicate with our servers to provide AI-powered analysis. We only access content when you explicitly click 'Analyze Chart'."
        },
        {
          q: "What trading platforms are supported?",
          a: "Snapchart works with TradingView and most web-based trading platforms that display charts in your browser."
        }
      ]
    },
    {
      title: "Usage & Billing",
      questions: [
        {
          q: "What counts against my usage?",
          a: "Each time you click 'Analyze Chart' in the extension, it counts as one chart analysis and a message."
        },
        {
          q: "When does my usage reset?",
          a: "Your usage resets daily at midnight UTC, regardless of when you subscribed."
        },
        {
          q: "What happens if I reach my daily limit?",
          a: "On the Free plan (15 messages/day and 5 analyses/day), you'll be blocked from further analyses until the next day. On the Pro plan (200 messages/day and 50 analyses/day), you can either wait until the next day for a reset."
        },
        {
          q: "Can I upgrade or downgrade my plan?",
          a: "Yes! Go to My Account and click 'Manage Billing' to change your plan anytime. Upgrades take effect immediately, and downgrades apply at the end of your current billing period."
        },
        {
          q: "How do I cancel my subscription?",
          a: "Visit My Account → 'Manage Billing' → 'Cancel Plan'. You'll retain access until the end of your billing period."
        }
      ]
    },
    {
      title: "Trading Rules",
      questions: [
        {
          q: "What are rulesets and how do they work?",
          a: "Rulesets are custom trading rules you define (like 'only trade when RSI is below 30' or 'never risk more than 2% per trade'). When you analyze a chart, our AI checks if your setup follows your active rules and provides specific feedback."
        },
        {
          q: "Can I have multiple rulesets?",
          a: "Yes! You can create multiple rulesets for different strategies (scalping, swing trading, etc.) but only one can be active at a time. Switch between them in the Rules page."
        },
        {
          q: "Do I need to create rules to use Snapchart?",
          a: "No, rules are optional. You'll still get comprehensive chart analysis without them. However, rules make the analysis more personalized and help enforce your trading discipline."
        },
        {
          q: "How many rules can I add to a ruleset?",
          a: "3 rulesets for free and 20 rulesets on Pro."
        }
      ]
    },
    {
      title: "Chart Analysis",
      questions: [
        {
          q: "How does the AI analyze my charts?",
          a: "Our AI uses computer vision to examine your chart screenshot, identifying patterns, support/resistance levels, indicators, and market structure. It then provides analysis based on your active ruleset (if any) and general technical analysis principles."
        },
        {
          q: "What if the AI doesn't recognize my indicator?",
          a: "You can describe your indicator in your ruleset rules so the AI knows what to look for (color of moving averages and their periods). If the AI still misses it, it may be due to common color usage among indicators. Try using more common indicators or reach out via 'Report Issue' so we can improve recognition."
        },
        {
          q: "Can I save good analysis for later?",
          a: "Yes! Click the star icon on any analysis or chat message to save it to your Favorites. Access them anytime from the Favorites page in your dashboard. AI will always reference your saved messages when responding."
        },
        {
          q: "How long are my analyses stored?",
          a: "Your chat history and analyses are stored for 30 days. Favorited messages are kept permanently (or until you delete them)."
        }
      ]
    },
    {
      title: "Technical Issues",
      questions: [
        {
          q: "The extension isn't capturing my chart. What should I do?",
          a: (
            <>
              Make sure you've granted the extension permission to access the trading platform website. Try refreshing the page or{" "}
              <a 
                href="https://chromewebstore.google.com/detail/bppbpeodpbepcmjifjjihejcnofdnibe?utm_source=item-share-cb"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline"
              >
                reinstalling the extension
              </a>
              . If issues persist, report it via the 'Report Issue' link.
            </>
          )
        },
        {
          q: "I'm not receiving magic link emails. Help!",
          a: "Check your spam folder. If still not there, make sure you entered the correct email address and try again. Some email providers may delay delivery by a few minutes."
        },
        {
          q: "My analyses are taking a long time. Is this normal?",
          a: "AI analysis typically takes 5-10 seconds. If it's taking longer, check your internet connection. During high traffic times, there may be slight delays."
        },
        {
          q: "Can I use Snapchart on mobile?",
          a: "Currently, Snapchart is a desktop Chrome extension. Mobile support is on our roadmap—request this feature on our Feature Requests page!"
        }
      ]
    },
    {
      title: "Account & Privacy",
      questions: [
        {
          q: "How do I update my account information?",
          a: "Go to My Account to update your name and email. Use the 'Edit Profile' button to make changes. Including your name will help us personalize your experience."
        },
        {
          q: "Is my screenshot private?",
          a: "Yes! We do not save your screenshots in our database. They are only stored in your local browser storage for your chat history and analyses. This ensures any sensitive data in your screenshots remains private and secure."
        },
        {
          q: "Can I delete my account?",
          a: "Yes, contact us via the 'Report Issue' link and we'll delete your account and all associated data within 30 days."
        },
        {
          q: "Do you offer refunds?",
          a: "We offer a 14-day money-back guarantee for pro plans. Contact support within 14 days of purchase if you're not satisfied."
        }
      ]
    }
  ]

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-gray-900 text-xl">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h1>
          <p className="text-gray-600">
            Find answers to common questions about Snapchart. Can't find what you're looking for?{" "}
            <a 
              href="https://snapchart.canny.io/bugs-and-issues" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Contact support
            </a>
          </p>
        </div>

        <div className="space-y-8">
          {faqSections.map((section, sectionIdx) => (
            <div key={sectionIdx} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{section.title}</h2>
              <div className="space-y-4">
                {section.questions.map((item, itemIdx) => (
                  <div key={itemIdx} className="border-b border-gray-200 last:border-b-0 pb-4 last:pb-0">
                    <h3 className="text-base font-medium text-blue-600 mb-2">{item.q}</h3>
                    <div className="text-gray-700 text-sm leading-relaxed">{item.a}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Still have questions?</h2>
          <p className="text-gray-700 mb-4">
            We're here to help! Reach out through any of these channels:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a 
              href="mailto:help@snapchartapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Report an Issue
            </a>
            <a 
              href="mailto:help@snapchartapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg transition-colors border border-gray-300"
            >
              Request a Feature
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
