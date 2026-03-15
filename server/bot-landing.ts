/**
 * Static HTML landing page served to bots/crawlers that cannot execute JavaScript.
 * This ensures payment processors (Stripe), search engines, and verification bots
 * can see the full page content without needing a JS runtime.
 *
 * Regular users still get the React SPA — this only fires for known bot user agents.
 */

import type { Request, Response, NextFunction } from "express";

const BOT_UA_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /slurp/i, /facebookexternalhit/i,
  /linkedinbot/i, /twitterbot/i, /whatsapp/i, /telegram/i,
  /stripe/i, /curl/i, /wget/i, /python-requests/i, /httpx/i,
  /go-http-client/i, /java\//i, /okhttp/i, /axios/i,
  /preview/i, /fetch/i, /headless/i, /phantom/i,
  /google/i, /bing/i, /yandex/i, /baidu/i, /duckduck/i,
  /semrush/i, /ahrefs/i, /mj12bot/i, /dotbot/i,
  /textise/i, /uptimerobot/i, /pingdom/i, /sitechecker/i,
];

function isBot(ua: string): boolean {
  if (!ua) return true; // No UA = likely a bot
  return BOT_UA_PATTERNS.some((p) => p.test(ua));
}

const STATIC_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Premium Screener — S&amp;P 500 + NASDAQ 100 Options Analytics</title>
  <meta name="description" content="Scan 500+ S&amp;P 500 + NASDAQ 100 tickers daily. Options analytics platform ranking strategies by delta z-score, probability of profit, and annualized ROC.">

  <meta property="og:type" content="website">
  <meta property="og:url" content="https://premiumscreener.com/">
  <meta property="og:title" content="Premium Screener — S&amp;P 500 + NASDAQ 100 Options Analytics">
  <meta property="og:description" content="Scan 500+ S&amp;P 500 + NASDAQ 100 tickers daily. Options analytics platform ranking strategies by delta z-score, probability of profit, and annualized ROC.">
  <meta property="og:image" content="https://premiumscreener.com/og-image.png">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Premium Screener — S&amp;P 500 + NASDAQ 100 Options Analytics">
  <meta name="twitter:description" content="Scan 500+ S&amp;P 500 + NASDAQ 100 tickers daily. Options analytics platform ranking strategies by delta z-score, probability of profit, and annualized ROC.">
  <meta name="twitter:image" content="https://premiumscreener.com/og-image.png">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #fafafa; line-height: 1.6; }
    .container { max-width: 960px; margin: 0 auto; padding: 0 24px; }
    header { padding: 20px 0; border-bottom: 1px solid #27272a; }
    header .brand { font-size: 18px; font-weight: 600; }
    h1 { font-size: 36px; font-weight: 700; margin: 48px 0 16px; line-height: 1.2; }
    h1 span { color: #34d399; }
    h2 { font-size: 24px; font-weight: 600; margin: 40px 0 16px; color: #fafafa; }
    h3 { font-size: 18px; font-weight: 600; margin: 24px 0 8px; color: #d4d4d8; }
    p { color: #a1a1aa; margin-bottom: 12px; }
    .subtitle { font-size: 18px; color: #a1a1aa; max-width: 640px; margin-bottom: 32px; }
    .badge { display: inline-block; background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.2); border-radius: 20px; padding: 4px 12px; font-size: 13px; margin-bottom: 24px; }
    .cta { display: inline-block; background: #34d399; color: #000; padding: 12px 32px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 8px 8px 8px 0; }
    .cta-outline { display: inline-block; border: 1px solid #3f3f46; color: #d4d4d8; padding: 12px 32px; border-radius: 8px; font-weight: 500; text-decoration: none; }
    .features { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
    .feature { background: rgba(39,39,42,0.3); border: 1px solid rgba(63,63,70,0.4); border-radius: 12px; padding: 20px; }
    .feature h3 { margin-top: 0; font-size: 15px; color: #fafafa; }
    .feature p { font-size: 14px; margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 32px 0; text-align: center; }
    .stat-value { font-size: 32px; font-weight: 700; color: #34d399; }
    .stat-label { font-size: 13px; color: #71717a; margin-top: 4px; }
    .pricing { background: rgba(39,39,42,0.4); border: 1px solid rgba(63,63,70,0.5); border-radius: 12px; padding: 32px; max-width: 400px; margin: 24px 0; }
    .price { font-size: 42px; font-weight: 700; color: #fafafa; }
    .price span { font-size: 16px; color: #a1a1aa; font-weight: 400; }
    .check-list { list-style: none; padding: 0; }
    .check-list li { padding: 6px 0; font-size: 14px; color: #d4d4d8; }
    .check-list li::before { content: "✓ "; color: #34d399; font-weight: 600; }
    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
    .step { background: rgba(39,39,42,0.3); border: 1px solid rgba(63,63,70,0.4); border-radius: 12px; padding: 20px; }
    .step-num { font-size: 12px; font-weight: 700; color: #34d399; font-family: monospace; }
    .step h3 { margin-top: 8px; }
    .step p { font-size: 14px; margin: 0; }
    .legal { margin-top: 48px; padding-top: 32px; border-top: 1px solid #27272a; }
    .legal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .legal-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .legal h3 { font-size: 15px; color: #d4d4d8; margin-bottom: 8px; }
    .legal p { font-size: 12px; color: #71717a; }
    .disclaimer { border-top: 1px solid #27272a; padding-top: 20px; margin-top: 24px; }
    .disclaimer p { font-size: 12px; color: #71717a; }
    .disclaimer strong { color: #a1a1aa; }
    footer { text-align: center; padding: 24px 0; font-size: 12px; color: #52525b; }
    @media (max-width: 640px) {
      .features, .stats, .steps, .legal-grid, .legal-grid-3 { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  <header>
    <div class="container">
      <span class="brand">Premium Screener</span>
    </div>
  </header>

  <main class="container">

    <div class="badge">500+ S&amp;P 500 + NASDAQ 100 tickers scanned daily</div>

    <h1>Stop Guessing.<br><span>Start Screening.</span></h1>
    <p class="subtitle">Our engine scans 500+ S&amp;P 500 + NASDAQ 100 tickers every morning and ranks options strategies by composite score — so you spend less time scanning chains.</p>

    <a href="/auth" class="cta">Start Free Preview</a>
    <a href="#how-it-works" class="cta-outline">See How It Works</a>

    <p style="font-size:13px; color:#71717a; margin-top:16px;">No credit card required · Free preview available · Cancel anytime</p>

    <!-- Problem statement -->
    <p style="font-size:18px; color:#d4d4d8; margin-top:48px;">Most traders waste hours scanning chains manually. Premium levels are often mispriced — but only briefly.</p>
    <p style="font-size:18px; color:#71717a;">By the time you find it, the edge is gone.</p>

    <!-- How It Works -->
    <h2 id="how-it-works">How It Works</h2>
    <p>Three steps. Zero manual chain scanning.</p>
    <div class="steps">
      <div class="step">
        <span class="step-num">01</span>
        <h3>We Scan</h3>
        <p>Every trading day, our engine analyzes options chains across the S&amp;P 500 + NASDAQ 100 — every expiry, every strike.</p>
      </div>
      <div class="step">
        <span class="step-num">02</span>
        <h3>We Score</h3>
        <p>Each strategy is ranked by a composite of Delta Z-Score, Annualized ROC, Probability of Profit, and Liquidity.</p>
      </div>
      <div class="step">
        <span class="step-num">03</span>
        <h3>You Decide</h3>
        <p>Get ranked opportunities with full leg details, P&amp;L diagrams, and backtesting. Evaluate with confidence.</p>
      </div>
    </div>

    <!-- Features -->
    <h2>Built for Premium Sellers</h2>
    <p>Every feature designed to find, evaluate, and analyze options strategies for selling premium.</p>
    <div class="features">
      <div class="feature">
        <h3>5 Premium Strategies</h3>
        <p>Cash Secured Puts, Put Credit Spreads, Call Credit Spreads, Strangles, Iron Condors. Each optimized for premium sellers.</p>
      </div>
      <div class="feature">
        <h3>Delta Z-Score Ranking</h3>
        <p>Our proprietary scoring measures how rich current premiums are vs. the chain average. Higher Z = fatter premium.</p>
      </div>
      <div class="feature">
        <h3>IV Rank &amp; Earnings Integration</h3>
        <p>Know instantly if IV is elevated (ideal for selling) and whether earnings fall before expiry.</p>
      </div>
      <div class="feature">
        <h3>One-Click Backtesting</h3>
        <p>Simulate any strategy over 3, 6, or 12 months of price history. See backtest results, P&amp;L curve, Sharpe ratio.</p>
      </div>
      <div class="feature">
        <h3>Interactive P&amp;L Diagrams</h3>
        <p>Visualize max profit, max loss, breakevens, and expected move for every strategy at a glance.</p>
      </div>
      <div class="feature">
        <h3>Trade Journal &amp; Performance</h3>
        <p>Log positions, track P&amp;L, see your backtest performance by strategy. Know what's actually working.</p>
      </div>
      <div class="feature">
        <h3>Watchlist &amp; Custom Alerts</h3>
        <p>Pin your favorite tickers. Get notified when they score above your threshold.</p>
      </div>
      <div class="feature">
        <h3>Backtest Performance</h3>
        <p>See real backtest-based statistics across all strategies. Evaluate how each approach has performed historically.</p>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats">
      <div><div class="stat-value">500+</div><div class="stat-label">Tickers Scanned Daily</div></div>
      <div><div class="stat-value">2,600+</div><div class="stat-label">Strategies Analyzed Daily</div></div>
      <div><div class="stat-value">80%+</div><div class="stat-label">Backtest Success Rate (PCS)*</div></div>
      <div><div class="stat-value">90%+</div><div class="stat-label">Backtest Success Rate (IC)*</div></div>
    </div>

    <!-- Pricing -->
    <h2>Simple Pricing</h2>
    <p>One plan. Everything included.</p>
    <div class="pricing">
      <div class="price">$29 <span>/month</span></div>
      <ul class="check-list" style="margin-top:20px;">
        <li>Full S&amp;P 500 + NASDAQ 100 scans every trading day</li>
        <li>All 5 premium strategies</li>
        <li>Backtesting engine</li>
        <li>P&amp;L diagrams</li>
        <li>Trade journal</li>
        <li>Watchlist &amp; alerts</li>
        <li>IV Rank &amp; earnings data</li>
      </ul>
      <a href="/auth" class="cta" style="margin-top:20px; display:block; text-align:center;">Start Free Preview</a>
      <p style="font-size:12px; color:#71717a; text-align:center; margin-top:12px;">Free preview shows limited data. No credit card required to start.</p>
    </div>

    <!-- FAQ -->
    <h2>Frequently Asked Questions</h2>

    <h3>What strategies does it cover?</h3>
    <p>Cash Secured Puts (CSPs), Put Credit Spreads (PCS), Call Credit Spreads (CCS), Strangles, and Iron Condors — five core premium-selling strategies covering both bullish and bearish credit plays.</p>

    <h3>How is the composite score calculated?</h3>
    <p>It's a weighted blend of Delta Z-Score (30%), Annualized ROC (20%), Probability of Profit (20%), and Liquidity (10%), plus bonus points for high IV Rank (+10 when IVR ≥ 50) and strong backtest performance (+10 when historical backtest ≥ 60%).</p>

    <h3>How often is data updated?</h3>
    <p>Every trading day. Scans run during market hours so you get fresh ranked opportunities by market open.</p>

    <h3>Can I try it for free?</h3>
    <p>Yes. Create a free account to see limited results with some details redacted. Upgrade anytime to unlock everything.</p>

    <h3>What's your refund policy?</h3>
    <p>Cancel anytime, no questions asked. You keep access through the end of your billing period.</p>

    <!-- CTA -->
    <h2>Ready to screen smarter?</h2>
    <p>Join investors who save hours every day with systematic, data-driven options analytics.</p>
    <a href="/auth" class="cta">Start Free Preview</a>

    <!-- Legal & Compliance -->
    <div class="legal">
      <div class="legal-grid">
        <div>
          <h3>About PremiumScreener</h3>
          <p>PremiumScreener is a subscription SaaS platform that provides options analytics tools and research software for investors. The platform scans publicly available options market data and ranks strategies using statistical metrics such as probability of profit, implied volatility, and risk-adjusted return. We do not execute trades, manage funds, or provide brokerage or financial advisory services.</p>
        </div>
        <div>
          <h3>Contact &amp; Support</h3>
          <p>Email: support@premiumscreener.com</p>
          <p>PremiumScreener is operated as a software analytics business providing research tools to self-directed investors.</p>
        </div>
      </div>
      <div class="legal-grid-3">
        <div>
          <h3>Terms of Service</h3>
          <p>By using PremiumScreener, you agree that the platform provides analytics software only. All content is for educational and informational purposes. You acknowledge that options trading involves significant risk of loss and that you are solely responsible for your own investment decisions. All analytics models, scoring systems, and proprietary methodologies are the exclusive intellectual property of PremiumScreener and may not be copied, reproduced, or reverse engineered.</p>
        </div>
        <div>
          <h3>Privacy Policy</h3>
          <p>We collect only the information necessary to provide the service: email address and payment information (processed securely by Stripe). We do not sell or share your personal data with third parties. Usage data is collected to improve the platform. You may request deletion of your account and data at any time by contacting support.</p>
        </div>
        <div>
          <h3>Refund Policy</h3>
          <p>Cancel anytime, no questions asked. You retain access through the end of your current billing period. No partial refunds are issued for unused time within a billing cycle. If you experience a technical issue preventing access, contact support and we will resolve it promptly.</p>
        </div>
      </div>
      <div class="disclaimer">
        <p><strong>Risk Disclaimer</strong></p>
        <p>Backtested performance is hypothetical and provided for informational purposes only. Past performance, whether simulated or historical, does not guarantee future results. Options trading involves substantial risk of loss and is not suitable for all investors. PremiumScreener does not provide financial, investment, or trading advice. Consult a qualified financial advisor before making investment decisions.</p>
      </div>
    </div>

  </main>

  <footer>
    <div class="container">
      <p>&copy; 2026 PremiumScreener. All rights reserved.</p>
    </div>
  </footer>

</body>
</html>`;

/**
 * Middleware: if the request is for the root landing page AND the user agent
 * looks like a bot, serve the static HTML instead of the SPA shell.
 */
export function serveBotLanding(req: Request, res: Response, next: NextFunction) {
  // Only intercept requests for the landing page (root path or hash routes)
  const isLandingRoute = req.path === "/" || req.path === "/index.html";
  if (!isLandingRoute) return next();

  const ua = req.headers["user-agent"] || "";
  if (isBot(ua)) {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.send(STATIC_HTML);
  }

  next();
}
