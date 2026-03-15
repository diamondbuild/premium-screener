export function Disclaimer() {
  return (
    <div className="text-center text-xs text-muted-foreground py-6 px-4 space-y-2 max-w-3xl mx-auto">
      <p>
        PremiumScreener provides analytics and research tools for educational and informational purposes only.
        We do not execute trades, manage funds, or provide financial, investment, or trading advice.
        Users are solely responsible for their own investment decisions.
      </p>
      <p>
        Backtested performance is hypothetical and provided for informational purposes only.
        Past performance, whether simulated or historical, does not guarantee future results.
        Options trading involves significant risk and is not suitable for all investors.
      </p>
      <p>
        All analytics models, scoring systems, algorithms, and proprietary methodologies used by PremiumScreener,
        including the Delta Z-Score ranking system and strategy scoring framework, are the exclusive intellectual
        property of PremiumScreener. Users may not copy, reproduce, reverse engineer, distribute, or create
        derivative works based on these systems without prior written permission.
      </p>
      <p className="text-muted-foreground/60">
        &copy; {new Date().getFullYear()} PremiumScreener. All rights reserved. &nbsp;|&nbsp;
        Contact: support@premiumscreener.com
      </p>
    </div>
  );
}
