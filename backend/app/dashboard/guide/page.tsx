"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"

export default function GuidePage() {
    const router = useRouter()
    const supabase = createClient()
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        checkAuth()
    }, [])

    const checkAuth = async () => {
        const {
            data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
            router.push("/")
            return
        }
        setIsLoading(false)
    }

    if (isLoading) {
        return (
            <div>
                <div className="flex items-center justify-center h-[calc(100vh-80px)]">
                    <div className="text-ink-body text-xl">Loading...</div>
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className="max-w-4xl">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-semibold tracking-tight text-ink-body mb-2">
                        Getting Started with Snapchart
                    </h1>
                    <p className="text-ink-text">
                        A complete guide to analyzing charts, creating trading rules, and
                        building better trading habits with AI assistance.
                    </p>
                </div>

                {/* Quick Start */}
                <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-6 mb-8">
                    <h2 className="text-xl font-semibold text-ink-body mb-3">
                        🚀 Quick Start
                    </h2>
                    <ol className="space-y-2 text-ink-text">
                        {[
                            <>Pin the Snapchart extension to your Chrome toolbar (puzzle icon → pin).</>,
                            <>Set up your <a href="/dashboard/rules" className="text-brand-300 hover:text-brand-200 underline">rules and daily limits</a>. Your coach checks every chart against them.</>,
                            <>Open your chart in Chrome (TradingView, Tradovate or TopstepX) and click the <strong className="text-ink-body">Snapchart</strong> button at the bottom right.</>,
                            <>Click <strong className="text-ink-body">Analyze this chart</strong> for a verdict against your rules, or type a question and use <strong className="text-ink-body">Send with Chart</strong>.</>,
                            <>On TradingView, turn on <strong className="text-ink-body">Auto-detect trades</strong> (⋮ menu) so your <a href="/dashboard/journal" className="text-brand-300 hover:text-brand-200 underline">journal</a> fills itself.</>,
                        ].map((step, i) => (
                            <li key={i} className="flex items-start">
                                <span className="font-semibold text-brand-300 mr-2">{i + 1}.</span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                </div>

                {/* Main Guide Sections */}
                <div className="space-y-8">
                    {/* Section 1: Installing & Setting Up */}
                    <section className="bg-ink-surface rounded-lg border border-ink-border p-6">
                        <h2 className="text-xl font-semibold text-ink-body mb-4">
                            1. Installing & Setting Up
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Install the Extension
                                </h3>
                                <p className="text-ink-text mb-2">
                                    Visit the{" "}
                                    <a
                                        href="https://chromewebstore.google.com/detail/bppbpeodpbepcmjifjjihejcnofdnibe?utm_source=item-share-cb"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand-300 hover:text-brand-200 underline"
                                    >
                                        Chrome Web Store
                                    </a>{" "}
                                    and click "Add to Chrome". The extension will appear in your
                                    browser toolbar.
                                </p>
                                <div className="bg-ink-elevated border border-ink-border rounded-lg p-4 text-sm text-ink-text">
                                    💡 <strong>Tip:</strong> Pin the extension to your toolbar for
                                    easy access. Right-click the extension icon and select "Pin".
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Grant Permissions
                                </h3>
                                <p className="text-ink-text mb-2">
                                    When you first use Snapchart on a trading platform, Chrome
                                    may ask for permission to access that site. This is required
                                    to capture chart screenshots and display the chat widget.
                                </p>
                                <p className="text-ink-text text-sm">
                                    <strong>What we access:</strong> Only chart images you
                                    explicitly request to analyze. We never access your trading
                                    accounts or execute trades.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Sign In
                                </h3>
                                <p className="text-ink-text">
                                    Click the extension icon and sign in with your Snapchart
                                    account. You'll be authenticated across all your browser tabs
                                    automatically.
                                </p>
                            </div>
                            <div className="mt-4">
                                <img
                                    src="/image.png"
                                    alt="Snapchart extension installation"
                                    className="w-full rounded-lg border border-ink-border"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Section 2: Analyzing Charts */}
                    <section className="bg-ink-surface rounded-lg border border-ink-border p-6">
                        <h2 className="text-xl font-semibold text-ink-body mb-4">
                            2. Analyzing Your First Chart
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Open a Trading Chart
                                </h3>
                                <p className="text-ink-text mb-2">
                                    Navigate to any web-based trading platform like TradingView or
                                    Tradovate. Open a chart you want to
                                    analyze.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Activate the Chat Widget
                                </h3>
                                <p className="text-ink-text mb-2">
                                    You'll see a small Snapchart widget appear on your chart
                                    (bottom right corner). Click it to open the chat interface.
                                </p>
                                <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-4 text-sm text-brand-200">
                                    📍 <strong>Can't see the widget?</strong> Make sure you're
                                    signed in to the extension and have granted site permissions.
                                    Try refreshing the page.
                                </div>
                                <div className="mt-4">
                                    <img
                                        src="/image2.png"
                                        alt="Snapchart extension widget on trading chart"
                                        className="w-full rounded-lg border border-ink-border"
                                    />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Get AI Analysis
                                </h3>
                                <p className="text-ink-text mb-2">
                                    Click the <strong>"Analyze Chart"</strong> button in the chat
                                    widget. Our AI will:
                                </p>
                                <ul className="list-disc list-inside text-ink-text space-y-1 ml-4">
                                    <li>Capture your current chart screenshot</li>
                                    <li>Identify patterns, support/resistance, and indicators</li>
                                    <li>Check against your active ruleset (if you have one)</li>
                                    <li>Provide detailed feedback</li>
                                </ul>
                                <p className="text-ink-text text-sm mt-2">
                                    ⏱️ Messages with screenshot analysis typically takes 5-10 seconds.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Ask Follow-Up Questions
                                </h3>
                                <p className="text-ink-text">
                                    After getting an analysis, you can chat with the AI to ask
                                    questions like following up on that analysis.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Section 3: Creating Trading Rules */}
                    <section className="bg-ink-surface rounded-lg border border-ink-border p-6">
                        <h2 className="text-xl font-semibold text-ink-body mb-4">
                            3. Creating Custom Trading Rules
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Why Use Rulesets?
                                </h3>
                                <p className="text-ink-text mb-2">
                                    Rulesets help you stick to your trading plan and avoid
                                    emotional decisions. When you analyze a chart, the AI checks
                                    if your setup follows your rules and gives you specific
                                    feedback.
                                </p>
                                <p className="text-ink-text text-sm italic">
                                    Example: "Only trade when RSI is below 30" or "Never risk more
                                    than 2% per trade"
                                </p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Create a Ruleset
                                </h3>
                                <ol className="list-decimal list-inside text-ink-text space-y-2 ml-4">
                                    <li>
                                        Go to the <strong>Rules</strong> page in your dashboard
                                    </li>
                                    <li>Click "Create New Ruleset"</li>
                                    <li>Give it a descriptive name (e.g., "9 EMA Day Trading Rules")</li>
                                    <li>Add your trading rules one by one</li>
                                    <li>Click "Save" when done</li>
                                </ol>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Rule Examples
                                </h3>
                                <div className="bg-ink-elevated border border-ink-border rounded-lg p-4 space-y-2">
                                    <p className="text-sm text-ink-text">
                                        ✅ <strong>Entry Rules:</strong> "Only enter when price is
                                        above 20 EMA on 15-min chart"
                                    </p>
                                    <p className="text-sm text-ink-text">
                                        ✅ <strong>Risk Management:</strong> "Stop loss must be at
                                        recent swing low/high"
                                    </p>
                                    <p className="text-sm text-ink-text">
                                        ✅ <strong>Psychology:</strong> "Never trade after 2
                                        consecutive losses"
                                    </p>
                                    <p className="text-sm text-ink-text">
                                        ✅ <strong>Confirmation:</strong> "Wait for 3 consecutive
                                        green candles before entry"
                                    </p>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Activate a Ruleset
                                </h3>
                                <p className="text-ink-text">
                                    You can have multiple rulesets for different strategies
                                    (scalping, swing trading, etc.) but only one can be active at
                                    a time. Click the toggle switch next to a ruleset to activate
                                    it. All future chart analyses will reference that ruleset.
                                </p>
                                <p className="text-ink-text">
                                    This allows for the AI to focus on one ruleset at a time and not give mixed feedback.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Section 4: Saving Favorites */}
                    <section className="bg-ink-surface rounded-lg border border-ink-border p-6">
                        <h2 className="text-xl font-semibold text-ink-body mb-4">
                            4. Saving & Organizing Analyses
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Save Important Analyses
                                </h3>
                                <p className="text-ink-text mb-2">
                                    When you receive particularly good analysis or insights, click
                                    the <strong>star icon</strong> (☆) next to the message to
                                    save it to your Favorites. It will highlight in gold signaling message is saved.
                                </p>
                                <p className="text-ink-text">
                                    Favorited messages are kept permanently (or until you delete
                                    them), while regular chat history is only kept for 30 days. If you delete chat history, favorites remain safe.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-ink-body mb-2">
                                    Review Your Favorites
                                </h3>
                                <p className="text-ink-text">
                                    Visit the <strong>Favorites</strong> page in your dashboard to
                                    see all saved analyses. This is great for:
                                </p>
                                <ul className="list-disc list-inside text-ink-text space-y-1 ml-4 mt-2">
                                    <li>Reviewing what worked in past trades</li>
                                    <li>Liking an inspiring feedback on a particular setup or emotions</li>
                                    <li>Building a library of good setups</li>
                                    <li>Learning from previous analysis</li>
                                    <li>Creating study materials for improvement</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Section 6: Tips & Best Practices */}
                    <section className="bg-ink-surface rounded-lg border border-ink-border p-6">
                        <h2 className="text-xl font-semibold text-ink-body mb-4">
                            6. Tips & Best Practices
                        </h2>

                        <div className="space-y-3">
                            <div className="flex items-start">
                                <span className="text-2xl mr-3">📊</span>
                                <div>
                                    <p className="font-semibold text-ink-body">
                                        Clean Your Charts
                                    </p>
                                    <p className="text-sm text-ink-text">
                                        Remove unnecessary indicators and clutter before analysis for
                                        more accurate AI feedback.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <span className="text-2xl mr-3">🎯</span>
                                <div>
                                    <p className="font-semibold text-ink-body">
                                        Be Specific in Rules
                                    </p>
                                    <p className="text-sm text-ink-text">
                                        The more specific your trading rules, the better the AI can
                                        check compliance. Include exact indicator values and
                                        conditions.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <span className="text-2xl mr-3">💬</span>
                                <div>
                                    <p className="font-semibold text-ink-body">Ask Questions</p>
                                    <p className="text-sm text-ink-text">
                                        Use the chat to ask follow-up questions. The AI can explain
                                        its reasoning and help you understand market structure better.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <span className="text-2xl mr-3">📝</span>
                                <div>
                                    <p className="font-semibold text-ink-body">
                                        Keep a Trading Journal
                                    </p>
                                    <p className="text-sm text-ink-text">
                                        Save good analyses to Favorites and review them weekly. Track
                                        what setups work best for you.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <span className="text-2xl mr-3">⚡</span>
                                <div>
                                    <p className="font-semibold text-ink-body">
                                        Analyze Before Entry
                                    </p>
                                    <p className="text-sm text-ink-text">
                                        Get AI feedback BEFORE placing trades, not after. Use it as a
                                        decision-making tool to see if your setup meets your rules.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <span className="text-2xl mr-3">🔄</span>
                                <div>
                                    <p className="font-semibold text-ink-body">
                                        Update Your Rules
                                    </p>
                                    <p className="text-sm text-ink-text">
                                        As your trading strategy evolves, update your rulesets. What
                                        worked 3 months ago might not work today.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer CTA */}
                <div className="mt-8 bg-brand-500/10 border border-brand-500/30 rounded-lg p-6 text-center">
                    <h2 className="text-xl font-semibold text-ink-body mb-2">
                        Ready to Trade Smarter?
                    </h2>
                    <p className="text-ink-text mb-4">
                        Start analyzing your charts with AI-powered feedback and build
                        better trading habits today.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <a
                            href="https://chromewebstore.google.com/detail/bppbpeodpbepcmjifjjihejcnofdnibe?utm_source=item-share-cb"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center px-6 py-3 bg-brand-500 hover:bg-brand-400 text-ink-bg font-medium rounded-lg transition-colors"
                        >
                            Install Extension
                        </a>
                        <a
                            href="/dashboard/rules"
                            className="inline-flex items-center justify-center px-6 py-3 bg-ink-surface hover:bg-ink-elevated text-ink-text font-medium rounded-lg transition-colors border border-ink-border"
                        >
                            Create Your First Ruleset
                        </a>
                    </div>
                </div>

                {/* Help Section */}
                <div className="mt-6 text-center text-sm text-ink-text">
                    <p>
                        Need help?{" "}
                        <a
                            href="/dashboard/faq"
                            className="text-brand-300 hover:text-brand-200 underline"
                        >
                            Check out our FAQ
                        </a>{" "}
                        or{" "}
                        <a
                            href="https://snapchart.canny.io/bugs-and-issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-300 hover:text-brand-200 underline"
                        >
                            contact support
                        </a>
                        .
                    </p>
                </div>
            </div>
        </div>
    )
}
